/**
 * CSV import of existing personnel: the template, the parser, value clean-up
 * and per-row validation. Pure functions only — the page holds the state and
 * import_personnel_row() (0029) does the writing.
 *
 * The parser also accepts the agency's client roster sheets saved as CSV
 * ("NAME:", "DATE STARTED:", "AREA OF ASSIGNMENT:", …) through HEADER_ALIASES,
 * and the date formats those sheets actually contain.
 */

export const IMPORT_COLUMNS = [
  { key: 'employee_no', header: 'employee_no', label: 'Employee no.', width: 130 },
  { key: 'last_name', header: 'last_name', label: 'Last name', width: 150, required: true },
  { key: 'first_name', header: 'first_name', label: 'First name', width: 150, required: true },
  { key: 'middle_name', header: 'middle_name', label: 'Middle name', width: 130 },
  { key: 'suffix', header: 'suffix', label: 'Suffix', width: 70 },
  { key: 'birth_date', header: 'birth_date', label: 'Birth date', width: 120, kind: 'date' },
  { key: 'sex', header: 'sex', label: 'Sex', width: 100, kind: 'sex' },
  { key: 'phone', header: 'phone', label: 'Phone', width: 130 },
  { key: 'email', header: 'email', label: 'Email', width: 190 },
  { key: 'address', header: 'address', label: 'Address', width: 220 },
  { key: 'date_hired', header: 'date_hired', label: 'Date hired', width: 120, kind: 'date' },
  { key: 'facility', header: 'facility', label: 'Facility', width: 200, kind: 'facility' },
  { key: 'shift', header: 'shift', label: 'Shift', width: 110, kind: 'shift' },
  { key: 'post', header: 'post', label: 'Post', width: 130 },
  { key: 'security_license_no', header: 'security_license_no', label: 'Licence no.', width: 160 },
  {
    key: 'security_license_expiry',
    header: 'security_license_expiry',
    label: 'Licence expiry',
    width: 120,
    kind: 'date',
  },
  { key: 'sss_no', header: 'sss_no', label: 'SSS', width: 130 },
  { key: 'pagibig_no', header: 'pagibig_no', label: 'Pag-IBIG', width: 140 },
  { key: 'philhealth_no', header: 'philhealth_no', label: 'PhilHealth', width: 140 },
  { key: 'tin_no', header: 'tin_no', label: 'TIN', width: 130 },
  {
    key: 'emergency_contact_name',
    header: 'emergency_contact_name',
    label: 'Emergency contact',
    width: 170,
  },
  {
    key: 'emergency_contact_phone',
    header: 'emergency_contact_phone',
    label: 'Emergency phone',
    width: 130,
  },
  { key: 'status', header: 'status', label: 'Status', width: 130, kind: 'status' },
  { key: 'status_date', header: 'status_date', label: 'Effectivity date', width: 120, kind: 'date' },
  { key: 'status_reason', header: 'status_reason', label: 'Status reason', width: 200 },
  { key: 'violation', header: 'violation', label: 'Violation / offense', width: 180 },
  { key: 'violation_details', header: 'violation_details', label: 'Violation details', width: 200 },
  { key: 'violation_date', header: 'violation_date', label: 'Violation date', width: 120, kind: 'date' },
] as const satisfies readonly {
  key: string
  header: string
  label: string
  width: number
  required?: boolean
  kind?: 'date' | 'sex' | 'shift' | 'status' | 'facility'
}[]

export type ColumnKey = (typeof IMPORT_COLUMNS)[number]['key']
export type RowValues = Record<ColumnKey, string>
export type ColumnKind = 'date' | 'sex' | 'shift' | 'status' | 'facility' | undefined

export const columnKind = (key: ColumnKey): ColumnKind =>
  (IMPORT_COLUMNS.find((c) => c.key === key) as { kind?: ColumnKind } | undefined)?.kind

export const EMPTY_ROW: RowValues = Object.fromEntries(
  IMPORT_COLUMNS.map((c) => [c.key, '']),
) as RowValues

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'blocklisted', label: 'Blocklisted' },
] as const

export const SHIFT_OPTIONS = ['day', 'night', 'mid', 'rotating'] as const

/** Marks the template's sample rows so they are never imported by accident. */
export const EXAMPLE_MARKER = 'EXAMPLE'

export const TEMPLATE_EXAMPLES: Partial<RowValues>[] = [
  {
    employee_no: EXAMPLE_MARKER,
    last_name: 'DELA CRUZ',
    first_name: 'JUAN',
    middle_name: 'SANTOS',
    birth_date: '2000-07-07',
    sex: 'male',
    phone: '09171234567',
    address: 'Guiwan, Zamboanga City',
    date_hired: '2024-04-30',
    facility: 'ADZU Main Campus',
    shift: 'day',
    security_license_no: 'R09-202410000',
    security_license_expiry: '2027-06-30',
    sss_no: '10-1525481-1',
    pagibig_no: '1213-4871-2987',
    philhealth_no: '20-025152639-6',
    status: 'active',
  },
  {
    employee_no: EXAMPLE_MARKER,
    last_name: 'REYES',
    first_name: 'ANA',
    date_hired: '2023-01-15',
    facility: 'ADZU Main Campus',
    status: 'resigned',
    status_date: '2025-05-01',
    status_reason: 'Personal reasons',
    violation: 'Habitual tardiness',
    violation_details: 'Late 5 times in March 2025',
    violation_date: '2025-03-31',
  },
]

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/** RFC 4180 CSV: quoted fields, doubled quotes, embedded newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const newline = src.search(/\r?\n/)
  const firstLine = newline === -1 ? src : src.slice(0, newline)
  // Excel in some locales saves with semicolons.
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[:.]/g, '')
    .replace(/[\s_/-]+/g, ' ')
    .trim()

/** Template headers plus the column names used in the client roster sheets. */
const HEADER_ALIASES: Record<string, ColumnKey | 'name'> = {
  ...Object.fromEntries(IMPORT_COLUMNS.map((c) => [normHeader(c.header), c.key])),
  ...Object.fromEntries(IMPORT_COLUMNS.map((c) => [normHeader(c.label), c.key])),
  name: 'name',
  'full name': 'name',
  'date started': 'date_hired',
  'date hired': 'date_hired',
  'contact no': 'phone',
  'contact number': 'phone',
  birthday: 'birth_date',
  'date of birth': 'birth_date',
  'area of assignment': 'facility',
  'license no': 'security_license_no',
  'security license no': 'security_license_no',
  'security license expiration': 'security_license_expiry',
  'sss no': 'sss_no',
  'sss number': 'sss_no',
  'pagibig no': 'pagibig_no',
  'pagibig number': 'pagibig_no',
  'pag ibig no': 'pagibig_no',
  'philhealth no': 'philhealth_no',
  'philhealth number': 'philhealth_no',
  'tin no': 'tin_no',
  'violations offense remarks': 'violation',
  'violations offenses remarks': 'violation',
  'violation offense remarks': 'violation',
  'violation offenses remarks': 'violation',
  'violation offense': 'violation',
  'violation s': 'violation',
  violations: 'violation',
  'effectivity date': 'status_date',
}

export interface ParsedFile {
  rows: RowValues[]
  /** Header cells that matched no column, so the user knows what was skipped. */
  ignoredHeaders: string[]
}

/**
 * Finds the header row (within the first five rows — the roster sheets have a
 * blank title row), maps columns, and returns one RowValues per data row.
 */
export function rowsFromCsv(text: string): ParsedFile {
  return rowsFromTable(parseCsv(text))
}

/** Maps a grid of cells (from a CSV or one worksheet) onto import rows. */
export function rowsFromTable(table: string[][]): ParsedFile {
  if (table.length === 0) throw new Error('The file is empty.')

  let headerIndex = -1
  let mapping: (ColumnKey | 'name' | null)[] = []
  for (let i = 0; i < Math.min(5, table.length); i++) {
    const candidate = table[i]!.map((h) => HEADER_ALIASES[normHeader(h)] ?? null)
    if (candidate.filter(Boolean).length >= 2) {
      headerIndex = i
      mapping = candidate
      break
    }
  }
  if (headerIndex < 0) {
    throw new Error(
      'Could not find the header row. Use the template, or make sure the first row has column names such as last_name and first_name.',
    )
  }

  const ignoredHeaders = table[headerIndex]!
    .filter((h, i) => h.trim() && !mapping[i])
    .map((h) => h.trim())

  const rows = table.slice(headerIndex + 1).map((cells) => {
    const values: RowValues = { ...EMPTY_ROW }
    let nameNote = ''
    cells.forEach((cell, i) => {
      const key = mapping[i]
      if (!key) return
      if (key === 'name') {
        const { last, first, note } = splitName(cell)
        if (last && !values.last_name) values.last_name = last
        if (first && !values.first_name) values.first_name = first
        nameNote = note
      } else if (!values[key].trim()) {
        values[key] = cell
      }
    })
    // "SMITH, JOHN (AWOL)": the bracket note stands in for the status only when
    // the STATUS column itself is empty — it is often an alias or a remark.
    if (nameNote && !values.status.trim()) values.status = nameNote
    return normalizeRow(values)
  })

  return { rows: rows.filter((r) => !isBlankRow(r)), ignoredHeaders }
}

/**
 * Roster sheets pre-fill columns such as STATUS far below the last guard, so a
 * row with nothing but those is not a person.
 */
function isBlankRow(v: RowValues): boolean {
  return IMPORT_COLUMNS.every((c) => c.key === 'status' || c.key === 'shift' || !v[c.key])
}

/** "ABELLO, FRANCIS MC CHE (AWOL)" → last ABELLO, first FRANCIS MC CHE, note AWOL. */
function splitName(raw: string) {
  const note = raw.match(/\(([^)]*)\)/)?.[1]?.trim() ?? ''
  const name = raw.replace(/\([^)]*\)/g, '').trim()
  // "DECENA. ARFIL" — a period typed where the comma belongs.
  const separator = name.includes(',') ? ',' : /^[^.\s]+\.\s/.test(name) ? '.' : ','
  const [last = '', ...rest] = name.split(separator)
  return { last: last.trim(), first: rest.join(separator).trim(), note }
}

/* -------------------------------------------------------------------------- */
/* Value clean-up                                                             */
/* -------------------------------------------------------------------------- */

const BLANKS = new Set([
  'n/a', 'n.a', 'n.a.', 'na', 'none', '-', '—', 'null', 'nil', 'no record', 'no record on file',
])

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoIfValid(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null
  }
  return `${y}-${pad(m)}-${pad(d)}`
}

const fullYear = (y: number) => {
  if (y >= 100) return y
  const thisYear = new Date().getFullYear() % 100
  return y <= thisYear + 1 ? 2000 + y : 1900 + y
}

/**
 * Turns the date spellings found in the roster sheets into YYYY-MM-DD:
 * 2024-04-30, 04/30/2024, 30 APRIL 2024, 06 AUG. 1980, SEPT. 1, 2025,
 * Jun 10/ 2003, 16-Feb-25, July 12, 2025 and Excel serial numbers (45432).
 * Numeric slashes are read month-first, as Philippine forms are.
 * Returns null when the text is not a date it can read with confidence.
 */
export function parseDate(raw: string): string | null {
  // A zero typed for the letter O inside a month name: "N0V", "0CT".
  const text = raw.trim().replace(/(?<=[a-z])0|0(?=[a-z])/gi, 'O')
  if (!text) return null

  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return isoIfValid(+m[1]!, +m[2]!, +m[3]!)

  m = text.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/)
  if (m) return isoIfValid(fullYear(+m[3]!), +m[1]!, +m[2]!)

  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text))
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
      return isoIfValid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }
    return null
  }

  const monthWord = text.toLowerCase().match(/[a-z]{3,}/)
  const month = monthWord ? MONTHS[monthWord[0].slice(0, 3)] : undefined
  if (month) {
    const nums = (text.match(/\d+/g) ?? []).map(Number)
    if (nums.length !== 2) return null
    const [a, b] = nums as [number, number]
    const fourDigit = String(a).length === 4 ? a : String(b).length === 4 ? b : null
    const year = fourDigit ?? fullYear(b)
    const day = fourDigit === a ? b : a
    return isoIfValid(year, month, day)
  }
  return null
}

const STATUS_ALIASES: Record<string, string> = {
  active: 'active',
  'reactive': 'active',
  're active': 'active',
  'on leave': 'on_leave',
  'onleave': 'on_leave',
  leave: 'on_leave',
  suspended: 'suspended',
  suspension: 'suspended',
  resigned: 'resigned',
  resign: 'resigned',
  terminated: 'terminated',
  termination: 'terminated',
  blocklisted: 'blocklisted',
  blacklisted: 'blocklisted',
  blocklist: 'blocklisted',
  removed: 'blocklisted',
}

/** Canonical value for one cell, or the trimmed original when it cannot be read. */
export function normalizeValue(key: ColumnKey, raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (BLANKS.has(text.toLowerCase())) return ''
  if (!text) return ''

  switch (columnKind(key)) {
    case 'date':
      // An empty date cell with a formula or number format reads as 0.
      if (text === '0') return ''
      return parseDate(text) ?? text
    case 'sex': {
      const t = text.toLowerCase()
      if (t === 'm' || t === 'male') return 'male'
      if (t === 'f' || t === 'female') return 'female'
      return text
    }
    case 'shift': {
      const t = text.toLowerCase().replace(/\s*shift$/, '')
      return (SHIFT_OPTIONS as readonly string[]).includes(t) ? t : text
    }
    case 'status': {
      const t = text.toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim()
      return STATUS_ALIASES[t] ?? text
    }
  }

  if (key === 'phone' || key === 'emergency_contact_phone') {
    const digits = text.replace(/[\s()-]/g, '')
    // Excel drops the leading zero of 09xx numbers.
    if (/^9\d{9}$/.test(digits)) return `0${digits}`
    return /^\+?\d+$/.test(digits) ? digits : text
  }
  if (key === 'email') return text.toLowerCase()
  if (key === 'last_name' || key === 'first_name' || key === 'middle_name') {
    // Notes in brackets "(AWOL)" and marker asterisks "PONCIANO*" are not part of the name.
    return text.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\*/g, '').trim()
  }
  return text
}

export function normalizeRow(values: RowValues): RowValues {
  const out = { ...values }
  for (const c of IMPORT_COLUMNS) out[c.key] = normalizeValue(c.key, values[c.key] ?? '')

  // The roster sheets write the effectivity as a sentence ("VACATION LEAVE
  // EFFECTIVE 06 OCTOBER 2025"). Keep the sentence as the reason and use the
  // date inside it.
  if (out.status_date && !/^\d{4}-\d{2}-\d{2}$/.test(out.status_date)) {
    const found = findDateInText(out.status_date)
    if (found) {
      if (!out.status_reason) out.status_reason = out.status_date
      out.status_date = found
    }
  }

  // The sheets' single VIOLATIONS/OFFENSE/REMARKS column explains a non-active
  // status ("CONFINED IN THE HOSPITAL", "MARKED AWOL…") more often than it
  // records an offense. With no other reason given, it becomes the reason.
  if (out.status && out.status !== 'active' && !out.status_reason && out.violation && !out.violation_details) {
    out.status_reason = out.violation
    out.violation = ''
  }
  return out
}

/** The first readable date inside a sentence, e.g. "… EFFECTIVE SEPT 15, 2025". */
export function findDateInText(text: string): string | null {
  const patterns = [
    /\b\d{1,2}\s+[a-z]{3,}\.?,?\s+\d{4}\b/i, // 06 OCTOBER 2025
    /\b[a-z]{3,}\.?\s+\d{1,2},?\s+\d{4}\b/i, // SEPT 15, 2025
    /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, // 10/06/2025
    /\b\d{4}-\d{2}-\d{2}\b/,
  ]
  for (const re of patterns) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags + 'g'))) {
      const iso = parseDate(m[0])
      if (iso) return iso
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export interface Facility {
  id: string
  name: string
  code: string
}

export interface RowIssue {
  column: ColumnKey | null
  message: string
  /** Errors block the row; warnings are shown but do not. */
  level: 'error' | 'warning'
}

export function findFacility(value: string, facilities: Facility[]): Facility | undefined {
  const t = value.trim().toLowerCase()
  if (!t) return undefined
  return facilities.find((f) => f.name.toLowerCase() === t || f.code.toLowerCase() === t)
}

/** Local calendar date — toISOString() is UTC, a day behind before 8 a.m. in Manila. */
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const SCIENTIFIC = /^\d+(\.\d+)?e\+\d+$/i
const REASON_REQUIRED = new Set(['suspended', 'terminated', 'blocklisted'])
const SEPARATING = new Set(['resigned', 'terminated', 'blocklisted'])

/** The hire date the import will actually use when the cell is blank. */
export function effectiveDateHired(v: RowValues): string {
  if (v.date_hired) return v.date_hired
  const status = v.status || 'active'
  if (SEPARATING.has(status) && v.status_date && v.status_date < today()) return v.status_date
  return today()
}

export function validateRow(
  v: RowValues,
  ctx: { facilities: Facility[]; duplicateEmployeeNos: Set<string> },
): RowIssue[] {
  const issues: RowIssue[] = []
  const err = (column: ColumnKey | null, message: string) =>
    issues.push({ column, message, level: 'error' })
  const warn = (column: ColumnKey | null, message: string) =>
    issues.push({ column, message, level: 'warning' })

  if (v.employee_no === EXAMPLE_MARKER) {
    err('employee_no', 'This is the template’s example row — delete it.')
  }
  if (!v.last_name) err('last_name', 'Last name is required.')
  if (!v.first_name) err('first_name', 'First name is required.')

  for (const c of IMPORT_COLUMNS) {
    const value = v[c.key]
    if (!value) continue
    if (SCIENTIFIC.test(value)) {
      err(c.key, `${c.label}: Excel turned this into scientific notation and lost digits. Format the column as Text and type it again.`)
    } else if ('kind' in c && c.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      err(c.key, `${c.label}: "${value}" is not a date. Use YYYY-MM-DD, e.g. 2024-04-30.`)
    }
  }

  if (v.employee_no && ctx.duplicateEmployeeNos.has(v.employee_no.toLowerCase())) {
    err('employee_no', 'This employee number appears more than once in the file.')
  }
  if (v.sex && v.sex !== 'male' && v.sex !== 'female') err('sex', 'Sex must be male or female.')
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) err('email', 'Not a valid email address.')
  if (v.shift && !(SHIFT_OPTIONS as readonly string[]).includes(v.shift)) {
    err('shift', 'Shift must be day, night, mid or rotating.')
  }
  if (v.facility && !findFacility(v.facility, ctx.facilities)) {
    err('facility', `No active facility named "${v.facility}". Choose one, or add it on the Post / Area page first.`)
  }

  const status = v.status || 'active'
  if (!STATUS_OPTIONS.some((s) => s.value === status)) {
    err('status', `"${v.status}" is not a status here. Choose Active, On leave, Suspended, Resigned, Terminated or Blocklisted (e.g. AWOL → Terminated with a reason).`)
  }
  if (REASON_REQUIRED.has(status) && !v.status_reason) {
    err('status_reason', 'A reason is required for this status.')
  }
  if (status !== 'active' && !v.status_date) {
    warn('status_date', 'No effectivity date — today will be used.')
  }

  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (v.date_hired && iso.test(v.date_hired) && v.date_hired > today()) {
    err('date_hired', 'Date hired cannot be in the future.')
  }
  if (!v.date_hired) {
    warn('date_hired', `No date hired — ${effectiveDateHired(v)} will be used.`)
  }
  const hired = effectiveDateHired(v)
  if (SEPARATING.has(status) && v.status_date && iso.test(v.status_date) && iso.test(hired) && v.status_date < hired) {
    err('status_date', 'The effectivity date cannot be before the date hired.')
  }
  if (v.violation_details && !v.violation) err('violation', 'Enter the offense for these violation details.')

  return issues
}

/** Lower-cased employee numbers that occur more than once among `rows`. */
export function duplicateEmployeeNos(rows: { values: RowValues }[]): Set<string> {
  const seen = new Map<string, number>()
  for (const r of rows) {
    const no = r.values.employee_no.trim().toLowerCase()
    if (no && no !== EXAMPLE_MARKER.toLowerCase()) seen.set(no, (seen.get(no) ?? 0) + 1)
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([no]) => no))
}

/** The JSON import_personnel_row() expects. */
export function toImportPayload(v: RowValues, facilities: Facility[]) {
  return {
    employee_no: v.employee_no,
    last_name: v.last_name,
    first_name: v.first_name,
    middle_name: v.middle_name,
    suffix: v.suffix,
    birth_date: v.birth_date,
    sex: v.sex,
    phone: v.phone,
    email: v.email,
    address: v.address,
    date_hired: effectiveDateHired(v),
    branch_id: findFacility(v.facility, facilities)?.id ?? '',
    shift: v.shift || 'day',
    post: v.post,
    security_license_no: v.security_license_no,
    security_license_expiry: v.security_license_expiry,
    sss_no: v.sss_no,
    pagibig_no: v.pagibig_no,
    philhealth_no: v.philhealth_no,
    tin_no: v.tin_no,
    emergency_contact_name: v.emergency_contact_name,
    emergency_contact_phone: v.emergency_contact_phone,
    status: v.status || 'active',
    status_date: v.status_date,
    status_reason: v.status_reason,
    violation: v.violation,
    violation_details: v.violation_details,
    violation_date: v.violation_date,
  }
}

/* -------------------------------------------------------------------------- */
/* .xlsx                                                                      */
/* -------------------------------------------------------------------------- */
// Excel's own file keeps long numbers (Pag-IBIG, PhilHealth) exactly; saving as
// CSV writes them as 1.21E+11 and the digits are gone. So the workbook itself
// is accepted too. Only what the import needs is read: sheet names, shared
// strings and cell values.

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

/** Text of every <t> in a fragment, skipping phonetic hints (<rPh>). */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => decodeXml(m[1]!))
    .join('')

const columnIndex = (ref: string) =>
  [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

export interface WorkbookSheet {
  name: string
  table: string[][]
}

/** Every worksheet of an .xlsx as a grid of display-independent cell values. */
export function sheetsFromXlsx(files: Record<string, Uint8Array>): WorkbookSheet[] {
  const read = (path: string) => {
    const bytes = files[path]
    return bytes ? new TextDecoder().decode(bytes) : ''
  }

  const workbook = read('xl/workbook.xml')
  if (!workbook) throw new Error('This is not an Excel workbook.')

  const rels = new Map(
    [...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      m[0].match(/\bId="([^"]+)"/)?.[1] ?? '',
      m[0].match(/\bTarget="([^"]+)"/)?.[1] ?? '',
    ]),
  )
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textOf(m[1]!),
  )

  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = decodeXml(m[0].match(/\bname="([^"]*)"/)?.[1] ?? 'Sheet')
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1] ?? ''
    const target = (rels.get(rid) ?? '').replace(/^\/?(xl\/)?/, '')
    const xml = read(`xl/${target}`)

    const table: string[][] = []
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]!
        const body = c[2] ?? ''
        const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
        const type = attrs.match(/\bt="([^"]+)"/)?.[1]
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        let value = ''
        if (type === 's') value = shared[Number(v)] ?? ''
        else if (type === 'inlineStr') value = textOf(body)
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
        else if (v !== undefined) value = decodeXml(v)
        const index = ref ? columnIndex(ref) : cells.length
        cells[index] = value
      }
      table.push(Array.from(cells, (x) => x ?? ''))
    }
    return { name, table: table.filter((r) => r.some((x) => x.trim() !== '')) }
  })
}
