import templateUrl from '@/assets/templates/personal-data-sheet.docx?url'
import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import { getApplicant } from '@/features/applicants/api/applicantsApi'
import { format, parseISO } from 'date-fns'
import { calculateAge, fullName, humanize } from '@/utils/format'
import { cmToFeetInches } from '@/utils/units'
import type { ApplicantRow, PdsFields, PersonnelRow } from '@/types/database.types'

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
 * The Personal Data Sheet section of the record (family, education, military,
 * dependents, employment history, trainings, references, the yes/no questions
 * and the ID-card details) fills the matching blanks, so the exported sheet
 * carries everything the record holds. Anything left empty prints as the
 * original blank line.
 */

/**
 * Token key -> text. Keys match the `{{key:N}}` tokens in the template; any
 * key without a value prints as the blank line.
 */
export type PdsData = Record<string, string>

/** MM/DD/YYYY — compact enough for the form's short date blanks. */
function date(value: string | null | undefined): string {
  if (!value) return ''
  const d = parseISO(value)
  return Number.isNaN(d.getTime()) ? '' : format(d, 'MM/dd/yyyy')
}

/** A stored date ("2019-03-04"), month ("2019-03") or free text, as printed. */
function looseDate(value: string | null | undefined): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return date(value)
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  return m ? `${m[2]}/${m[1]}` : value
}

const yesNo = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : '')
const check = (v: boolean | null | undefined) => (v ? 'X' : '')

/**
 * Splits text over consecutive blanks of the given widths (in underscores),
 * breaking between words. Whatever does not fit goes on the last blank.
 */
function wrap(text: string, widths: number[]): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = widths.map(() => '')
  let line = 0
  for (const word of words) {
    const candidate = lines[line] ? `${lines[line]} ${word}` : word
    if (
      line < widths.length - 1 &&
      lines[line] &&
      printedWidth(` ${candidate.toUpperCase()}`) > widths[line]!
    ) {
      line += 1
      lines[line] = word
    } else {
      lines[line] = candidate
    }
  }
  return lines
}

/** The PDS lists (dependents, employment, trainings, references) as numbered keys. */
function rows<T>(
  items: T[] | null | undefined,
  prefix: string,
  max: number,
  columns: (item: T) => Record<string, string>,
): PdsData {
  const out: PdsData = {}
  ;(items ?? []).slice(0, max).forEach((item, index) => {
    for (const [column, value] of Object.entries(columns(item))) {
      out[`${prefix}${index + 1}_${column}`] = value
    }
  })
  return out
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
    height: formatHeight(p.height_cm ?? a?.height_cm),
    weight: formatWeight(p.weight_kg ?? a?.weight_kg),
    civil_status: (p.civil_status ?? a?.civil_status) ? humanize((p.civil_status ?? a?.civil_status)!) : '',
    sss: p.sss_no ?? a?.sss_no ?? '',
    pagibig: p.pagibig_no ?? a?.pagibig_no ?? '',
    philhealth: p.philhealth_no ?? a?.philhealth_no ?? '',
    tin: p.tin_no ?? a?.tin_no ?? '',
    license_no: p.security_license_no ?? a?.security_license_no ?? '',
    license_expiry: date(p.security_license_expiry ?? a?.security_license_expiry),
    emergency_name: p.emergency_contact_name ?? '',
    emergency_phone: p.emergency_contact_phone ?? '',
    education: p.highest_education ?? a?.highest_education ?? '',
    date_hired: date(p.date_hired),
    interview_date: date(a?.interview_at),
    interviewer: interviewerName ?? '',
    interview_notes: a?.interview_notes ?? '',
    full_name: fullName(p),
    ...pdsSections(p),
  }
}

/** The Personal Data Sheet section of the record (0032). */
function pdsSections(r: PdsFields): PdsData {
  const [criminal, criminal2, criminal3] = wrap(r.criminal_record_details ?? '', [13, 87, 87])
  const loans =
    r.has_loans === true
      ? ['Yes', r.loan_details].filter(Boolean).join(' - ')
      : r.has_loans === false
        ? 'No'
        : (r.loan_details ?? '')

  return {
    place_of_birth: r.place_of_birth ?? '',
    provincial_address: r.provincial_address ?? '',
    religion: r.religion ?? '',
    father_name: r.father_name ?? '',
    father_occupation: r.father_occupation ?? '',
    mother_name: r.mother_name ?? '',
    mother_occupation: r.mother_occupation ?? '',
    parents_address: r.parents_address ?? '',
    spouse_name: r.spouse_name ?? '',
    spouse_occupation: r.spouse_occupation ?? '',
    spouse_address: r.spouse_address ?? '',
    special_skills: r.special_skills ?? '',
    loans,
    badge_no: r.badge_no ?? '',
    emergency_relationship: r.emergency_contact_relationship ?? '',
    emergency_occupation: r.emergency_contact_occupation ?? '',

    military_pnp: check(r.military_pnp),
    military_afp: check(r.military_afp),
    military_rotc: check(r.military_rotc),
    military_branch: r.military_branch ?? '',
    military_serial_no: r.military_serial_no ?? '',
    military_rank: r.military_rank ?? '',
    military_status: r.military_status ?? '',
    military_years:
      r.military_years_service === null || r.military_years_service === undefined
        ? ''
        : String(r.military_years_service),
    military_reason_leaving: r.military_reason_leaving ?? '',

    date_graduated: looseDate(r.date_graduated),
    school_name: r.school_name ?? '',
    course: r.course ?? '',

    recommended_by: r.recommended_by ?? '',
    criminal_record: yesNo(r.has_criminal_record),
    criminal_details: criminal ?? '',
    criminal_details_line1: criminal2 ?? '',
    criminal_details_line2: criminal3 ?? '',
    drinks_alcohol: yesNo(r.drinks_alcohol),
    smokes: yesNo(r.smokes),
    health_problems: r.health_problems ?? '',
    willing_background_check: yesNo(r.willing_background_check),
    willing_any_assignment: yesNo(r.willing_any_assignment),

    res_cert_no: r.res_cert_no ?? '',
    res_cert_issued_on: looseDate(r.res_cert_issued_on),
    res_cert_issued_at: r.res_cert_issued_at ?? '',
    license_control_no: r.license_control_no ?? '',

    ...rows(r.dependents, 'dependent', 5, (d) => {
      const age = calculateAge(d.birth_date || null)
      return {
        name: d.name,
        birth_date: date(d.birth_date),
        age: age === null ? '' : String(age),
        relationship: d.relationship,
        address: d.address,
      }
    }),
    ...rows(r.employment_history, 'emp', 5, (e) => ({
      employer: e.employer,
      dates: [looseDate(e.from), looseDate(e.to)].filter(Boolean).join(' - '),
      salary: e.salary,
      reason: e.reason,
    })),
    ...rows(r.trainings, 'training', 5, (t) => ({
      name: t.training,
      school: t.school,
      dates: t.dates,
    })),
    ...rows(r.character_references, 'reference', 3, (c) => ({
      name: c.name,
      company: c.company,
      position: c.position,
      contact: c.contact,
    })),
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

/** Smallest a value is shrunk to fit its blank, as a share of the form's size. */
const MIN_LINE_SCALE = 0.65
const MIN_CELL_SCALE = 0.55

/**
 * A token and the run it sits in. Every token in the template is a run of its
 * own, so the run's font size can be reduced when a value is too long.
 */
const TOKEN_RUN =
  /<w:r>(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?(<w:t(?: [^>]*)?>)\{\{(\w+):(~?)(\d+)\}\}<\/w:t><\/w:r>/g

/** Scales the run's font size (w:sz / w:szCs, in half-points). */
function shrinkRunProps(rPr: string, scale: number): string {
  return rPr.replace(
    /<w:(sz|szCs) w:val="(\d+)"\/>/g,
    (_m, tag: string, size: string) =>
      `<w:${tag} w:val="${Math.max(12, Math.floor(Number(size) * scale))}"/>`,
  )
}

/** The text a token prints, and how much its run must shrink to keep to the blank. */
function fillToken(
  key: string,
  width: number,
  cell: boolean,
  data: Partial<PdsData>,
): { text: string; scale: number } {
  const raw = (data[key] ?? '')
    .replace(/\s+/g, ' ')
    // Dashes as plain hyphens: the template's font setup prints an en/em dash
    // in a fallback font, which changes the look of the whole entry.
    .replace(/[\u2013\u2014]/g, '-')
    .trim()
  // A table cell is boxed already: empty stays empty.
  if (!raw) return { text: cell ? '' : '_'.repeat(width), scale: 1 }
  // Free-text notes keep their case; form entries are printed in capitals,
  // as the agency's sheets are.
  if (key === 'interview_notes') {
    // The interviewer box is a fixed two-line space; anything longer would
    // push the form onto a fifth page.
    const limit = Math.floor(width * 0.75)
    const notes = raw.length > limit ? `${raw.slice(0, limit - 1).trimEnd()}…` : raw
    return { text: escapeXml(` ${notes} `), scale: 1 }
  }
  const value = raw.toUpperCase()
  if (cell) {
    const needed = printedWidth(value)
    return {
      text: escapeXml(value),
      scale: needed > width ? Math.max(MIN_CELL_SCALE, width / needed) : 1,
    }
  }
  const needed = printedWidth(` ${value} `)
  // Too long for the blank: print it smaller rather than let it push the rest
  // of the line (and the page) down.
  if (needed > width) {
    return { text: escapeXml(` ${value} `), scale: Math.max(MIN_LINE_SCALE, width / needed) }
  }
  // Whatever length the value leaves over stays as underscores, so the line
  // prints about as long as the blank did.
  const rest = Math.floor(width - printedWidth(` ${value}`))
  return { text: escapeXml(` ${value}${rest > 0 ? '_'.repeat(rest) : ' '}`), scale: 1 }
}

/**
 * Replaces every `{{key:N}}` token in document.xml. N is the blank's length
 * in underscores; `{{key:~N}}` is a table cell N underscores wide, filled
 * without underscores. Exported for testing.
 */
export function fillDocumentXml(xml: string, data: Partial<PdsData>): string {
  return xml.replace(
    TOKEN_RUN,
    (_m, rPr: string | undefined, tOpen: string, key: string, tilde: string, n: string) => {
      const { text, scale } = fillToken(key, Number(n), tilde === '~', data)
      const props = rPr ? (scale < 1 ? shrinkRunProps(rPr, scale) : rPr) : ''
      return `<w:r>${props}${tOpen}${text}</w:t></w:r>`
    },
  )
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
