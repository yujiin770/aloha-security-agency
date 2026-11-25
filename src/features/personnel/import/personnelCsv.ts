/**
 * CSV import of existing personnel: the template, the parser, value clean-up
 * and per-row validation. Pure functions only — the page holds the state and
 * import_personnel_row() (0029) does the writing.
 *
 * The parser also accepts the agency's client roster sheets saved as CSV
 * ("NAME:", "DATE STARTED:", "AREA OF ASSIGNMENT:", …) through HEADER_ALIASES,
 * and the date formats those sheets actually contain.
 */

/**
 * Column kinds drive clean-up, validation and the editor used in the grid.
 * `list` cells hold several entries: one per line (or separated by "|"), the
 * parts of each entry separated by ";" in the order the header names them.
 */
export type ColumnKind =
  | 'date'
  | 'sex'
  | 'shift'
  | 'status'
  | 'facility'
  | 'yesno'
  | 'civil'
  | 'number'
  | 'military'
  | 'list'
  | undefined

/**
 * `core`: who the guard is and the numbers every roster carries.
 * `pds`: the rest of the Personal Data Sheet (0032).
 * `roster`: where they are posted and their status — not on the paper form.
 */
export type ColumnGroup = 'core' | 'pds' | 'roster'

/**
 * The sections of a personnel record, in the order the app shows them: the
 * Edit information dialog (identity, employment, government numbers), then the
 * Personal Data Sheet card section by section, then the roster columns the
 * sheet does not have. The template's heading band and the review grid use
 * these titles, so a column sits under the same heading everywhere.
 */
export const IMPORT_SECTIONS = [
  { id: 'identity', title: 'Identity' },
  { id: 'employment', title: 'Employment & licence' },
  { id: 'government', title: 'Government numbers' },
  { id: 'background', title: 'Personal background' },
  { id: 'emergency', title: 'Emergency contact' },
  { id: 'education', title: 'Education & training' },
  { id: 'military', title: 'PNP / military training' },
  { id: 'dependents', title: 'Dependents' },
  { id: 'employment_history', title: 'Employment background' },
  { id: 'references', title: 'Character references' },
  { id: 'other', title: 'Other information' },
  { id: 'ids', title: 'Badge, licence control and residence certificate' },
  { id: 'posting', title: 'Posting & status' },
] as const

export type SectionId = (typeof IMPORT_SECTIONS)[number]['id']

interface ColumnDef {
  key: string
  section: SectionId
  /** As labelled on the Personal Data Sheet / Edit information form. */
  label: string
  /**
   * The template's column heading: the label, made to stand on its own where
   * the form relies on its section ("Name" → "Emergency contact name"), and
   * with the parts of a list column spelled out.
   */
  header: string
  /** The paper form's wording, and earlier template headings. Read on import. */
  aliases?: readonly string[]
  width: number
  group: ColumnGroup
  required?: boolean
  kind?: Exclude<ColumnKind, undefined>
  /** Shown in the template's Guide sheet. */
  help?: string
}

/** Same sections, order and labels as the Personal Data Sheet in the app. */
export const IMPORT_COLUMNS = [
  // Identity
  { key: 'first_name', section: 'identity', label: 'First name', header: 'First name', aliases: ['First Name'], width: 150, group: 'core', required: true },
  { key: 'last_name', section: 'identity', label: 'Last name', header: 'Last name', aliases: ['Last Name'], width: 150, group: 'core', required: true },
  { key: 'middle_name', section: 'identity', label: 'Middle name', header: 'Middle name', width: 130, group: 'core' },
  { key: 'suffix', section: 'identity', label: 'Suffix', header: 'Suffix', width: 70, group: 'core', help: 'Jr., Sr., III' },
  { key: 'birth_date', section: 'identity', label: 'Date of birth', header: 'Date of birth', aliases: ['Birth date'], width: 120, group: 'core', kind: 'date' },
  { key: 'sex', section: 'identity', label: 'Sex', header: 'Sex', width: 100, group: 'core', kind: 'sex', help: 'Male or Female (M / F).' },
  { key: 'civil_status', section: 'identity', label: 'Civil status', header: 'Civil status', width: 120, group: 'pds', kind: 'civil', help: 'Single, Married, Widowed, Separated or Divorced.' },
  { key: 'highest_education', section: 'identity', label: 'Highest education', header: 'Highest education', aliases: ['Highest Educational Attainment'], width: 170, group: 'pds' },
  { key: 'height_cm', section: 'identity', label: 'Height (cm)', header: 'Height (cm)', aliases: ['Height'], width: 100, group: 'pds', kind: 'number', help: 'In cm, or feet and inches such as 5\'7".' },
  { key: 'weight_kg', section: 'identity', label: 'Weight (kg)', header: 'Weight (kg)', aliases: ['Weight'], width: 100, group: 'pds', kind: 'number', help: 'In kg, or pounds such as 150 lbs.' },
  { key: 'email', section: 'identity', label: 'Email', header: 'Email', width: 190, group: 'core' },
  { key: 'phone', section: 'identity', label: 'Mobile', header: 'Mobile', aliases: ['Latest Tel/Cell-Phone No.', 'Phone'], width: 130, group: 'core' },
  { key: 'address', section: 'identity', label: 'Address', header: 'Address', aliases: ['Present Address'], width: 220, group: 'core' },

  // Employment & licence
  { key: 'employee_no', section: 'employment', label: 'Employee no.', header: 'Employee no.', width: 130, group: 'roster', help: 'Leave blank to generate one (ASA-EMP-…).' },
  { key: 'date_hired', section: 'employment', label: 'Date hired', header: 'Date hired', aliases: ['Date of Employment'], width: 120, group: 'roster', kind: 'date' },
  { key: 'security_license_no', section: 'employment', label: 'Security licence no.', header: 'Security licence no.', aliases: ['Security License No.', 'Licence no.'], width: 160, group: 'core' },
  { key: 'security_license_expiry', section: 'employment', label: 'Licence expiry', header: 'Licence expiry', aliases: ['License Expiry Date', 'License expiry'], width: 120, group: 'core', kind: 'date' },

  // Government numbers
  { key: 'sss_no', section: 'government', label: 'SSS no.', header: 'SSS no.', aliases: ['SSS'], width: 130, group: 'core' },
  { key: 'philhealth_no', section: 'government', label: 'PhilHealth no.', header: 'PhilHealth no.', aliases: ['PhilHealth'], width: 140, group: 'core' },
  { key: 'pagibig_no', section: 'government', label: 'Pag-IBIG no.', header: 'Pag-IBIG no.', aliases: ['Pag-IBIG'], width: 140, group: 'core' },
  { key: 'tin_no', section: 'government', label: 'TIN', header: 'TIN', aliases: ['TIN No.'], width: 130, group: 'core' },

  // Personal background
  { key: 'place_of_birth', section: 'background', label: 'Place of birth', header: 'Place of birth', width: 160, group: 'pds' },
  { key: 'religion', section: 'background', label: 'Religion', header: 'Religion', width: 130, group: 'pds' },
  { key: 'provincial_address', section: 'background', label: 'Provincial address', header: 'Provincial address', width: 220, group: 'pds' },
  { key: 'father_name', section: 'background', label: "Father's name", header: "Father's name", width: 170, group: 'pds' },
  { key: 'father_occupation', section: 'background', label: "Father's occupation", header: "Father's occupation", width: 150, group: 'pds' },
  { key: 'mother_name', section: 'background', label: "Mother's name", header: "Mother's name", width: 170, group: 'pds' },
  { key: 'mother_occupation', section: 'background', label: "Mother's occupation", header: "Mother's occupation", width: 150, group: 'pds' },
  { key: 'parents_address', section: 'background', label: "Parents' address", header: "Parents' address", aliases: ['Their Address'], width: 220, group: 'pds' },
  { key: 'spouse_name', section: 'background', label: 'Name of spouse', header: 'Name of spouse', aliases: ['Spouse'], width: 170, group: 'pds', help: 'If married.' },
  { key: 'spouse_occupation', section: 'background', label: "Spouse's occupation", header: "Spouse's occupation", width: 150, group: 'pds' },
  { key: 'spouse_address', section: 'background', label: "Spouse's exact address", header: "Spouse's exact address", aliases: ["Spouse's address"], width: 220, group: 'pds' },

  // Emergency contact
  { key: 'emergency_contact_name', section: 'emergency', label: 'Name', header: 'Emergency contact name', aliases: ['Contact Person in Case of Emergency', 'Emergency contact'], width: 170, group: 'core' },
  { key: 'emergency_contact_relationship', section: 'emergency', label: 'Relationship', header: 'Emergency contact relationship', width: 130, group: 'pds' },
  { key: 'emergency_contact_phone', section: 'emergency', label: 'Contact number', header: 'Emergency contact number', aliases: ['Emergency phone', 'Emergency contact phone'], width: 130, group: 'core' },
  { key: 'emergency_contact_occupation', section: 'emergency', label: 'Occupation', header: 'Emergency contact occupation', aliases: ['Emergency occupation'], width: 150, group: 'pds' },

  // Education & training
  { key: 'school_name', section: 'education', label: 'Name of school', header: 'Name of school', aliases: ['School'], width: 180, group: 'pds' },
  { key: 'course', section: 'education', label: 'Course', header: 'Course', width: 150, group: 'pds' },
  { key: 'date_graduated', section: 'education', label: 'Date graduated', header: 'Date graduated', width: 120, group: 'pds', help: 'As written, e.g. March 2012.' },
  { key: 'trainings', section: 'education', label: 'Security training attended', header: 'Security training attended (Training; Name of training school; Inclusive dates)', aliases: ['Security trainings'], width: 340, group: 'pds', kind: 'list', help: 'One training per line. Example: Basic Security Guard Course; XYZ Training Center; Jan–Mar 2019' },

  // PNP / military training
  { key: 'military_training', section: 'military', label: 'Training', header: 'PNP / military training (PNP, AFP, ROTC / CMT)', aliases: ['PNP / military'], width: 140, group: 'pds', kind: 'military', help: 'Any of PNP, AFP, ROTC — e.g. "PNP, ROTC". Blank if none.' },
  { key: 'military_branch', section: 'military', label: 'Branch of service', header: 'Branch of service', width: 140, group: 'pds' },
  { key: 'military_serial_no', section: 'military', label: 'PNP / AFP serial no.', header: 'PNP / AFP serial no.', aliases: ['PNP/AFP SN'], width: 130, group: 'pds' },
  { key: 'military_rank', section: 'military', label: 'Rank', header: 'Rank', width: 110, group: 'pds' },
  { key: 'military_status', section: 'military', label: 'Status', header: 'Service status', width: 120, group: 'pds', help: 'e.g. Retired, Reservist.' },
  { key: 'military_years_service', section: 'military', label: 'Years in service', header: 'Years in service', aliases: ['Yrs. in Service'], width: 100, group: 'pds', kind: 'number' },
  { key: 'military_reason_leaving', section: 'military', label: 'Reason for leaving', header: 'Reason for leaving the service', aliases: ['Reason left service'], width: 180, group: 'pds' },

  // Dependents, employment background, character references
  { key: 'dependents', section: 'dependents', label: 'Dependents', header: 'Dependents (Name; Date of birth; Relationship; Address)', aliases: ['Applicant Dependents'], width: 340, group: 'pds', kind: 'list', help: 'One dependent per line (Alt+Enter in Excel), or separate them with |. Example: Maria Dela Cruz; 2015-02-03; Daughter; Guiwan, Zamboanga City' },
  { key: 'employment_history', section: 'employment_history', label: 'Employment background', header: 'Employment background (Previous employer; From; To; Salary; Reason for leaving)', width: 380, group: 'pds', kind: 'list', help: 'One employer per line, most recent first. Example: ABC Security Agency; Jan 2019; Dec 2022; 12000; End of contract' },
  { key: 'character_references', section: 'references', label: 'Character references', header: 'Character references (Name; Company; Position; Address / tel. no.)', width: 340, group: 'pds', kind: 'list', help: 'Persons not related to the guard, one per line. Example: Pedro Santos; ACME Corp.; Manager; 09171234567' },

  // Other information
  { key: 'special_skills', section: 'other', label: 'Special skills', header: 'Special skills', aliases: ['Special Skill'], width: 180, group: 'pds' },
  { key: 'has_loans', section: 'other', label: 'Any loans in SSS, Pag-IBIG, etc.?', header: 'Any loans in SSS, Pag-IBIG, etc.?', aliases: ['Loans in SSS, Pag-IBIG, etc.?', 'Has loans'], width: 120, group: 'pds', kind: 'yesno', help: 'Yes or No.' },
  { key: 'loan_details', section: 'other', label: 'Loan details', header: 'Loan details', width: 180, group: 'pds' },
  { key: 'has_criminal_record', section: 'other', label: 'Ever convicted of any crime?', header: 'Ever convicted of any crime?', aliases: ['Convicted'], width: 120, group: 'pds', kind: 'yesno', help: 'Yes or No.' },
  { key: 'criminal_record_details', section: 'other', label: 'Please specify', header: 'Conviction details', aliases: ['If Yes, Please Specify'], width: 180, group: 'pds' },
  { key: 'drinks_alcohol', section: 'other', label: 'Drinks alcoholic beverages?', header: 'Drinks alcoholic beverages?', aliases: ['Drinks'], width: 120, group: 'pds', kind: 'yesno', help: 'Yes or No.' },
  { key: 'smokes', section: 'other', label: 'Smokes cigarettes?', header: 'Smokes cigarettes?', width: 120, group: 'pds', kind: 'yesno', help: 'Yes or No.' },
  { key: 'health_problems', section: 'other', label: 'Health problems', header: 'Health problems', width: 170, group: 'pds' },
  { key: 'willing_background_check', section: 'other', label: 'Willing to undergo background investigation?', header: 'Willing to undergo background investigation?', aliases: ['Willing: background check'], width: 140, group: 'pds', kind: 'yesno', help: 'Yes or No.' },
  { key: 'willing_any_assignment', section: 'other', label: 'Willing to be assigned anywhere in Region 9 or nearby provinces?', header: 'Willing to be assigned anywhere in Region 9 or nearby provinces?', aliases: ['Willing: any post'], width: 160, group: 'pds', kind: 'yesno', help: 'Yes or No.' },
  { key: 'recommended_by', section: 'other', label: 'Who recommended you to this agency?', header: 'Who recommended you to this agency?', aliases: ['Who Recommended You in This Agency?', 'Recommended by'], width: 170, group: 'pds' },

  // Badge, licence control and residence certificate
  { key: 'badge_no', section: 'ids', label: 'Badge no.', header: 'Badge no.', width: 120, group: 'pds' },
  { key: 'license_control_no', section: 'ids', label: 'Licence control no.', header: 'Licence control no.', aliases: ['License Control No.'], width: 140, group: 'pds' },
  { key: 'res_cert_no', section: 'ids', label: 'Res. cert. no.', header: 'Res. cert. no.', width: 130, group: 'pds' },
  { key: 'res_cert_issued_on', section: 'ids', label: 'Res. cert. issued on', header: 'Res. cert. issued on', width: 120, group: 'pds', kind: 'date' },
  { key: 'res_cert_issued_at', section: 'ids', label: 'Res. cert. issued at', header: 'Res. cert. issued at', width: 160, group: 'pds' },

  // Posting & status — the roster's, not on the Personal Data Sheet
  { key: 'facility', section: 'posting', label: 'Facility', header: 'Facility / area of assignment', width: 200, group: 'roster', kind: 'facility', help: 'The facility name or code, exactly as on the Post / Area page.' },
  { key: 'shift', section: 'posting', label: 'Shift', header: 'Shift', width: 110, group: 'roster', kind: 'shift', help: 'Day, Night, Mid or Rotating.' },
  { key: 'post', section: 'posting', label: 'Post', header: 'Post', width: 130, group: 'roster' },
  { key: 'status', section: 'posting', label: 'Status', header: 'Status', width: 130, group: 'roster', kind: 'status', help: 'Active, On leave, Suspended, Resigned, Terminated or Blocklisted.' },
  { key: 'status_date', section: 'posting', label: 'Effectivity date', header: 'Effectivity date', width: 120, group: 'roster', kind: 'date' },
  { key: 'status_reason', section: 'posting', label: 'Status reason', header: 'Status reason', width: 200, group: 'roster', help: 'Required for Suspended, Terminated and Blocklisted.' },
  { key: 'violation', section: 'posting', label: 'Violation / offense', header: 'Violation / offense', width: 180, group: 'roster' },
  { key: 'violation_details', section: 'posting', label: 'Violation details', header: 'Violation details', width: 200, group: 'roster' },
  { key: 'violation_date', section: 'posting', label: 'Violation date', header: 'Violation date', width: 120, group: 'roster', kind: 'date' },
] as const satisfies readonly ColumnDef[]

export type ColumnKey = (typeof IMPORT_COLUMNS)[number]['key']
export type RowValues = Record<ColumnKey, string>

const COLUMN_BY_KEY = new Map<string, ColumnDef>(IMPORT_COLUMNS.map((c) => [c.key, c]))

export const columnKind = (key: ColumnKey): ColumnKind => COLUMN_BY_KEY.get(key)?.kind

export const columnGroup = (key: ColumnKey): ColumnGroup => COLUMN_BY_KEY.get(key)!.group

export const columnHelp = (key: ColumnKey): string | undefined => COLUMN_BY_KEY.get(key)?.help

export const columnSection = (key: ColumnKey): SectionId => COLUMN_BY_KEY.get(key)!.section

/** The heading without a list column's "(Name; Date of birth; …)", for messages. */
export const columnTitle = (c: Pick<ColumnDef, 'header'>): string =>
  c.header.replace(/\s*\((?:[^)]*;[^)]*|PNP[^)]*)\)$/, '')

export const EMPTY_ROW: RowValues = Object.fromEntries(
  IMPORT_COLUMNS.map((c) => [c.key, '']),
) as RowValues

/** The parts of each entry in a `list` column, in the order the header gives them. */
export const LIST_FIELDS = {
  dependents: ['name', 'birth_date', 'relationship', 'address'],
  employment_history: ['employer', 'from', 'to', 'salary', 'reason'],
  trainings: ['training', 'school', 'dates'],
  character_references: ['name', 'company', 'position', 'contact'],
} as const satisfies Partial<Record<ColumnKey, readonly string[]>>

type ListKey = keyof typeof LIST_FIELDS

/** Row limits — the CHECK constraints in 0032. */
const LIST_MAX: Record<ListKey, number> = {
  dependents: 10,
  employment_history: 5,
  trainings: 5,
  character_references: 5,
}

export const CIVIL_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
  { value: 'divorced', label: 'Divorced' },
] as const

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
    place_of_birth: 'Zamboanga City',
    height_cm: '170',
    weight_kg: '65',
    civil_status: 'married',
    religion: 'Roman Catholic',
    father_name: 'Pedro Dela Cruz',
    father_occupation: 'Farmer',
    mother_name: 'Maria Santos',
    mother_occupation: 'Housewife',
    parents_address: 'Guiwan, Zamboanga City',
    spouse_name: 'Ana Dela Cruz',
    spouse_occupation: 'Teacher',
    spouse_address: 'Guiwan, Zamboanga City',
    has_loans: 'no',
    badge_no: 'B-1024',
    emergency_contact_name: 'Ana Dela Cruz',
    emergency_contact_relationship: 'Wife',
    emergency_contact_phone: '09181234567',
    dependents: 'Mark Dela Cruz; 2015-02-03; Son; Guiwan, Zamboanga City',
    employment_history: 'ABC Security Agency; Jan 2019; Dec 2022; 12000; End of contract',
    highest_education: 'College graduate',
    date_graduated: 'March 2018',
    school_name: 'Western Mindanao State University',
    course: 'BS Criminology',
    trainings: 'Basic Security Guard Course; XYZ Training Center; Jan–Mar 2019',
    character_references: 'Pedro Santos; ACME Corp.; Manager; 09171234567',
    has_criminal_record: 'no',
    drinks_alcohol: 'no',
    smokes: 'no',
    willing_background_check: 'yes',
    willing_any_assignment: 'yes',
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
    // "(Name; Date of Birth; …)" explains the format; it is not part of the name.
    .replace(/\([^)]*\)/g, ' ')
    // "*" marks a required column in the template's heading.
    .replace(/[:.?'’*]/g, '')
    .replace(/[\s_/-]+/g, ' ')
    .trim()

/** Template headers plus the column names used in the client roster sheets. */
const HEADER_ALIASES: Record<string, ColumnKey | 'name'> = {
  // Later entries win. Short form labels go first because several repeat
  // across sections ("Status", "Relationship"); the template's own headings,
  // the keys (templates from before 0032) and the paper wording outrank them.
  ...Object.fromEntries(IMPORT_COLUMNS.map((c) => [normHeader(c.label), c.key])),
  ...Object.fromEntries(
    IMPORT_COLUMNS.flatMap((c) => ('aliases' in c ? c.aliases : []).map((a) => [normHeader(a), c.key])),
  ),
  ...Object.fromEntries(IMPORT_COLUMNS.map((c) => [normHeader(c.key), c.key])),
  ...Object.fromEntries(IMPORT_COLUMNS.map((c) => [normHeader(c.header), c.key])),
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
  'date of employment': 'date_hired',
  'present address': 'address',
  'emergency contact': 'emergency_contact_name',
  'emergency contact name': 'emergency_contact_name',
  'contact person': 'emergency_contact_name',
  relationship: 'emergency_contact_relationship',
  'emergency phone': 'emergency_contact_phone',
  dependents: 'dependents',
  'employment background': 'employment_history',
  'previous employer': 'employment_history',
  'security training attended': 'trainings',
  'character references': 'character_references',
  'pnp military training': 'military_training',
  'highest education': 'highest_education',
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

  // The row naming the most columns. Not simply the first with a match: the
  // template's section band above the headings names a few too ("Dependents").
  let headerIndex = -1
  let mapping: (ColumnKey | 'name' | null)[] = []
  let best = 1
  for (let i = 0; i < Math.min(5, table.length); i++) {
    const candidate = table[i]!.map((h) => HEADER_ALIASES[normHeader(h)] ?? null)
    const found = candidate.filter(Boolean).length
    if (found > best) {
      headerIndex = i
      mapping = candidate
      best = found
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
  return IMPORT_COLUMNS.every(
    (c) => c.key === 'status' || c.key === 'shift' || ('kind' in c && c.kind === 'yesno') || !v[c.key],
  )
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
  // List cells keep their line breaks until normalizeList has split on them.
  if (columnKind(key) === 'list') {
    return BLANKS.has(raw.trim().toLowerCase()) ? '' : normalizeList(key as ListKey, raw)
  }
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
    case 'yesno':
      return YES_NO_ALIASES[text.toLowerCase().replace(/[.!]/g, '')] ?? text
    case 'civil':
      return CIVIL_ALIASES[text.toLowerCase().replace(/[.!]/g, '')] ?? text
    case 'number':
      return normalizeNumber(key, text)
    case 'military':
      return normalizeMilitary(text)
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

const YES_NO_ALIASES: Record<string, string> = {
  yes: 'yes', y: 'yes', true: 'yes', '1': 'yes', oo: 'yes', meron: 'yes', mayroon: 'yes', x: 'yes', '✓': 'yes', '✔': 'yes',
  no: 'no', n: 'no', false: 'no', '0': 'no', wala: 'no', hindi: 'no', di: 'no',
}

const CIVIL_ALIASES: Record<string, string> = {
  single: 'single', s: 'single',
  married: 'married', m: 'married',
  widowed: 'widowed', widow: 'widowed', widower: 'widowed', w: 'widowed',
  separated: 'separated', sep: 'separated',
  divorced: 'divorced', annulled: 'divorced',
}

/** Plain digits for the measurement columns; feet/inches and pounds converted. */
function normalizeNumber(key: ColumnKey, text: string): string {
  const t = text.toLowerCase().replace(/,/g, '').trim()
  const round = (n: number) => String(Math.round(n * 10) / 10)
  if (key === 'height_cm') {
    // 5'7", 5' 7, 5ft 7in, 5.7 ft is not feet-and-inches but 5'7 typed loosely.
    const fi = t.match(/^(\d)\s*(?:'|’|ft|feet|\.)\s*(\d{1,2})?\s*(?:"|”|''|in|inches)?$/)
    if (fi) return round((Number(fi[1]) * 12 + Number(fi[2] ?? 0)) * 2.54)
    const cm = t.match(/^(\d+(?:\.\d+)?)\s*(?:cm)?$/)
    if (cm) return round(Number(cm[1]))
    return text
  }
  if (key === 'weight_kg') {
    const lb = t.match(/^(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)$/)
    if (lb) return round(Number(lb[1]) / 2.20462)
    const kg = t.match(/^(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?)?$/)
    if (kg) return round(Number(kg[1]))
    return text
  }
  const n = t.match(/^(\d+)\s*(?:yrs?|years?)?$/)
  return n ? n[1]! : text
}

const MILITARY_TOKENS: Record<string, string> = {
  pnp: 'PNP',
  afp: 'AFP',
  rotc: 'ROTC',
  cmt: 'ROTC',
  'rotc/cmt': 'ROTC',
}

/** "pnp / rotc" → "PNP, ROTC". Unknown words are kept so validation shows them. */
function normalizeMilitary(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/rotc\s*\/\s*cmt/g, 'rotc')
    .split(/[\s,;/&+]+|\band\b/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.every((t) => MILITARY_TOKENS[t])) {
    const found = new Set(tokens.map((t) => MILITARY_TOKENS[t]!))
    return ['PNP', 'AFP', 'ROTC'].filter((t) => found.has(t)).join(', ')
  }
  return text
}

/** Splits a list cell into entries, each a list of trimmed parts. */
export function splitList(raw: string): string[][] {
  return raw
    .split(/\r?\n|\|/)
    .map((entry) => entry.split(';').map((part) => part.replace(/\s+/g, ' ').trim()))
    .filter((parts) => parts.some(Boolean))
}

/** One entry per "|", parts joined by "; ", dependents' birth dates as YYYY-MM-DD. */
function normalizeList(key: ListKey, raw: string): string {
  return splitList(raw)
    .map((parts) => {
      if (key === 'dependents' && parts[1]) parts[1] = parseDate(parts[1]) ?? parts[1]
      // Trailing empty parts ("Name; ; ") add nothing.
      while (parts.length > 1 && !parts[parts.length - 1]) parts.pop()
      return parts.join('; ')
    })
    .join(' | ')
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
      err(c.key, `${columnTitle(c)}: Excel turned this into scientific notation and lost digits. Format the column as Text and type it again.`)
    } else if ('kind' in c && c.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      err(c.key, `${columnTitle(c)}: "${value}" is not a date. Use YYYY-MM-DD, e.g. 2024-04-30.`)
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

  // Personal Data Sheet (0032)
  for (const c of IMPORT_COLUMNS) {
    const value = v[c.key]
    if (!value) continue
    // pds_from_payload (0032) caps every Personal Data Sheet text at 300, typed
    // or not; lists are capped per entry there. Roster columns have no cap.
    if (c.group === 'pds' && value.length > 300 && !('kind' in c && c.kind === 'list')) {
      err(c.key, `${columnTitle(c)}: at most 300 characters.`)
    }
    if (!('kind' in c)) continue
    if (c.kind === 'yesno' && value !== 'yes' && value !== 'no') {
      err(c.key, `${columnTitle(c)}: answer Yes or No.`)
    } else if (c.kind === 'civil' && !CIVIL_STATUS_OPTIONS.some((o) => o.value === value)) {
      err(c.key, `${columnTitle(c)}: use Single, Married, Widowed, Separated or Divorced.`)
    } else if (c.kind === 'military' && !/^(PNP|AFP|ROTC)(, (PNP|AFP|ROTC))*$/.test(value)) {
      err(c.key, `${columnTitle(c)}: list any of PNP, AFP, ROTC — e.g. "PNP, ROTC".`)
    } else if (c.kind === 'number') {
      const n = Number(value)
      const [min, max, unit] =
        c.key === 'height_cm' ? [100, 250, 'cm'] : c.key === 'weight_kg' ? [30, 250, 'kg'] : [0, 60, 'years']
      if (!/^\d+(\.\d+)?$/.test(value) || n < min || n > max) {
        err(c.key, `${columnTitle(c)}: enter ${min}–${max} ${unit}.`)
      }
    } else if (c.kind === 'list') {
      const key = c.key as ListKey
      const fields = LIST_FIELDS[key]
      const entries = splitList(value)
      if (entries.length > LIST_MAX[key]) {
        err(c.key, `${columnTitle(c)}: at most ${LIST_MAX[key]} entries (this has ${entries.length}).`)
      }
      entries.forEach((parts, i) => {
        if (parts.length > fields.length) {
          err(c.key, `${columnTitle(c)}, entry ${i + 1}: ${parts.length} parts, but only ${fields.length} are expected (${c.header.match(/\(([^)]*)\)/)?.[1] ?? ''}). Separate entries with a new line or |.`)
        }
        if (key === 'dependents' && parts[1] && !/^\d{4}-\d{2}-\d{2}$/.test(parts[1])) {
          err(c.key, `${columnTitle(c)}, entry ${i + 1}: "${parts[1]}" is not a date of birth. Use YYYY-MM-DD.`)
        }
      })
    }
  }
  if (v.emergency_contact_phone && !/^[0-9+()\s-]{7,20}$/.test(v.emergency_contact_phone)) {
    err('emergency_contact_phone', 'Emergency contact number: not a valid phone number.')
  }

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
    ...pdsPayload(v),
  }
}

const yesNoPayload = (value: string) => (value === 'yes' ? 'true' : value === 'no' ? 'false' : '')

/** The Personal Data Sheet part, in the shape pds_from_payload() (0032) reads. */
function pdsPayload(v: RowValues) {
  const military = v.military_training ? v.military_training.split(', ') : null
  const flag = (t: string) => (military ? String(military.includes(t)) : '')
  const lists = Object.fromEntries(
    (Object.keys(LIST_FIELDS) as ListKey[]).map((key) => [
      key,
      splitList(v[key]).map((parts) =>
        Object.fromEntries(LIST_FIELDS[key].map((field, i) => [field, parts[i] ?? ''])),
      ),
    ]),
  )
  return {
    place_of_birth: v.place_of_birth,
    provincial_address: v.provincial_address,
    civil_status: v.civil_status,
    height_cm: v.height_cm,
    weight_kg: v.weight_kg,
    religion: v.religion,
    father_name: v.father_name,
    father_occupation: v.father_occupation,
    mother_name: v.mother_name,
    mother_occupation: v.mother_occupation,
    parents_address: v.parents_address,
    spouse_name: v.spouse_name,
    spouse_occupation: v.spouse_occupation,
    spouse_address: v.spouse_address,
    special_skills: v.special_skills,
    has_loans: yesNoPayload(v.has_loans),
    loan_details: v.loan_details,
    badge_no: v.badge_no,
    emergency_contact_relationship: v.emergency_contact_relationship,
    emergency_contact_occupation: v.emergency_contact_occupation,
    military_pnp: flag('PNP'),
    military_afp: flag('AFP'),
    military_rotc: flag('ROTC'),
    military_branch: v.military_branch,
    military_serial_no: v.military_serial_no,
    military_rank: v.military_rank,
    military_status: v.military_status,
    military_years_service: v.military_years_service,
    military_reason_leaving: v.military_reason_leaving,
    highest_education: v.highest_education,
    date_graduated: v.date_graduated,
    school_name: v.school_name,
    course: v.course,
    recommended_by: v.recommended_by,
    has_criminal_record: yesNoPayload(v.has_criminal_record),
    criminal_record_details: v.criminal_record_details,
    drinks_alcohol: yesNoPayload(v.drinks_alcohol),
    smokes: yesNoPayload(v.smokes),
    health_problems: v.health_problems,
    willing_background_check: yesNoPayload(v.willing_background_check),
    willing_any_assignment: yesNoPayload(v.willing_any_assignment),
    res_cert_no: v.res_cert_no,
    res_cert_issued_on: v.res_cert_issued_on,
    res_cert_issued_at: v.res_cert_issued_at,
    license_control_no: v.license_control_no,
    ...lists,
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
