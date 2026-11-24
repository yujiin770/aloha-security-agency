import templateUrl from '@/assets/templates/personal-data-sheet.docx?url'
import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import { getApplicant } from '@/features/applicants/api/applicantsApi'
import { format, parseISO } from 'date-fns'
import { calculateAge, fullName, humanize } from '@/utils/format'
import { cmToFeetInches } from '@/utils/units'
import type { ApplicantRow, PersonnelRow } from '@/types/database.types'

/**
 * Fills the agency's "Personal Data Sheet" (docs/APPLICATION (SECURITY).docx)
 * for one personnel record and downloads it as a Word file.
 *
 * The template in src/assets/templates is the original form with each blank we
 * can fill replaced by a `{{key:N}}` token, where N is the number of
 * underscores the blank had. A filled value is written underlined and padded
 * back towards N characters so the line keeps roughly its printed length; an
 * empty value puts the original underscores back, ready to fill in by hand.
 *
 * Fields the system does not collect (parents, religion, dependents,
 * employment history, references, …) are left as blank lines.
 */

export type PdsField =
  | 'date_applied'
  | 'phone'
  | 'position'
  | 'last_name'
  | 'first_name'
  | 'middle_name'
  | 'birth_date'
  | 'age'
  | 'present_address'
  | 'height'
  | 'weight'
  | 'civil_status'
  | 'sss'
  | 'pagibig'
  | 'philhealth'
  | 'tin'
  | 'license_no'
  | 'license_expiry'
  | 'emergency_name'
  | 'emergency_phone'
  | 'education'
  | 'date_hired'
  | 'interview_date'
  | 'interviewer'
  | 'interview_notes'
  | 'full_name'

export type PdsData = Record<PdsField, string>

/** MM/DD/YYYY — compact enough for the form's short date blanks. */
function date(value: string | null | undefined): string {
  if (!value) return ''
  const d = parseISO(value)
  return Number.isNaN(d.getTime()) ? '' : format(d, 'MM/dd/yyyy')
}

function formatHeight(cm: number | null | undefined): string {
  if (cm === null || cm === undefined) return ''
  // The blank is short; feet and inches is how the form is usually filled.
  const [ft, inch] = cmToFeetInches(String(cm))
  return ft ? `${ft}'${inch}"` : `${Math.round(cm)} cm`
}

function formatWeight(kg: number | null | undefined): string {
  return kg === null || kg === undefined ? '' : `${Math.round(kg)} kg`
}

/** Pure mapping, kept separate so it is easy to see where each blank comes from. */
export function buildPdsData(params: {
  person: PersonnelRow
  applicant: ApplicantRow | null
  positionName: string
  interviewerName: string | null
}): PdsData {
  const { person: p, applicant: a, positionName, interviewerName } = params
  const birth = p.birth_date ?? a?.birth_date ?? null
  const age = calculateAge(birth)
  const address =
    p.address ??
    (a
      ? [a.address_line, a.barangay, a.city_municipality, a.province]
          .filter((part) => part && part.trim())
          .join(', ')
      : '')

  return {
    date_applied: date(a?.created_at),
    phone: p.phone ?? a?.phone ?? '',
    position: positionName,
    last_name: [p.last_name, p.suffix].filter(Boolean).join(' '),
    first_name: p.first_name,
    middle_name: p.middle_name ?? '',
    birth_date: date(birth),
    age: age === null ? '' : String(age),
    present_address: address,
    height: formatHeight(a?.height_cm),
    weight: formatWeight(a?.weight_kg),
    civil_status: a?.civil_status ? humanize(a.civil_status) : '',
    sss: p.sss_no ?? a?.sss_no ?? '',
    pagibig: p.pagibig_no ?? a?.pagibig_no ?? '',
    philhealth: p.philhealth_no ?? a?.philhealth_no ?? '',
    tin: p.tin_no ?? a?.tin_no ?? '',
    license_no: p.security_license_no ?? a?.security_license_no ?? '',
    license_expiry: date(p.security_license_expiry ?? a?.security_license_expiry),
    emergency_name: p.emergency_contact_name ?? '',
    emergency_phone: p.emergency_contact_phone ?? '',
    education: a?.highest_education ?? '',
    date_hired: date(p.date_hired),
    interview_date: date(a?.interview_at),
    interviewer: interviewerName ?? '',
    interview_notes: a?.interview_notes ?? '',
    full_name: fullName(p),
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Rough printed width of `text`, measured in underscores, erring on the wide
 * side. Capitals in Bookman Old Style are about half as wide again as an
 * underscore, so counting characters would push the next label onto a new line.
 */
function printedWidth(text: string): number {
  let total = 0
  for (const ch of text) {
    if (ch === ' ') total += 0.7
    else if (/[0-9]/.test(ch)) total += 1.4
    else if (/[A-Z]/.test(ch)) total += 1.75
    else if (/[a-z]/.test(ch)) total += 1.25
    else total += 0.9
  }
  return total
}

/** Replaces every `{{key:N}}` token in document.xml. Exported for testing. */
export function fillDocumentXml(xml: string, data: Partial<PdsData>): string {
  return xml.replace(/\{\{(\w+):(\d+)\}\}/g, (_m, key: string, n: string) => {
    const width = Number(n)
    const raw = (data[key as PdsField] ?? '').replace(/\s+/g, ' ').trim()
    if (!raw) return '_'.repeat(width)
    // Free-text notes keep their case; form entries are printed in capitals,
    // as the agency's sheets are.
    if (key === 'interview_notes') {
      // The interviewer box is a fixed two-line space; anything longer would
      // push the form onto a fifth page.
      const limit = Math.floor(width * 0.75)
      const notes = raw.length > limit ? `${raw.slice(0, limit - 1).trimEnd()}…` : raw
      return escapeXml(` ${notes} `)
    }
    const value = raw.toUpperCase()
    // Whatever length the value leaves over stays as underscores, so the line
    // prints about as long as the blank did and never pushes the next label
    // onto a new line by more than the estimate's error.
    const rest = Math.floor(width - printedWidth(` ${value}`))
    return escapeXml(` ${value}${rest > 0 ? '_'.repeat(rest) : ' '}`)
  })
}

async function loadExtras(person: PersonnelRow) {
  if (!person.applicant_id) return { applicant: null, interviewerName: null, positionName: '' }

  // A hired applicant row may have been purged under the retention policy;
  // the sheet is still produced from the personnel record alone.
  const applicant = await getApplicant(person.applicant_id).catch(() => null)
  let interviewerName: string | null = null
  if (applicant?.reviewed_by) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', applicant.reviewed_by)
      .maybeSingle()
    interviewerName = data?.full_name || null
  }
  // Personnel carry no position since 0028; the form asks for the position
  // applied for, which the application still records.
  let positionName = ''
  if (applicant?.position_id) {
    const { data } = await supabase
      .from('positions')
      .select('name')
      .eq('id', applicant.position_id)
      .maybeSingle()
    positionName = data?.name ?? ''
  }
  return { applicant, interviewerName, positionName }
}

/** Builds the filled .docx and starts the browser download. */
export async function downloadPersonalDataSheet(params: {
  person: PersonnelRow
}): Promise<void> {
  const { person } = params

  const [{ unzipSync, zipSync, strFromU8, strToU8 }, response, extras] = await Promise.all([
    import('fflate'),
    fetch(templateUrl),
    loadExtras(person),
  ])
  if (!response.ok) throw new Error('Could not load the Personal Data Sheet template.')

  const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const data = buildPdsData({ person, ...extras })
  const documentXml = files['word/document.xml']
  if (!documentXml) throw new Error('The Personal Data Sheet template is damaged.')
  files['word/document.xml'] = strToU8(fillDocumentXml(strFromU8(documentXml), data))

  // Copied into a plain ArrayBuffer: Blob's typings reject a view that might
  // be backed by a SharedArrayBuffer.
  const bytes = zipSync(files, { level: 6 })
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `PDS - ${person.last_name}, ${person.first_name} (${person.employee_no}).docx`
    .replace(/[\\/:*?"<>|]+/g, '-')
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  // The sheet carries government ID numbers in full, so who exported whose
  // record is logged. Best effort: the download has already happened.
  const actorId = (await supabase.auth.getUser()).data.user?.id
  if (actorId) {
    const { error } = await supabase.from('activity_logs').insert({
      actor_id: actorId,
      action: 'personnel.pds_exported',
      entity_type: 'personnel',
      entity_id: person.id,
      summary: `Exported Personal Data Sheet for ${fullName(person)} (${person.employee_no})`,
      metadata: {},
    })
    if (error && import.meta.env.DEV) console.warn('[pds] activity log failed', toAppError(error, ''))
  }
}
