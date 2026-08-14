import { z } from 'zod'

/**
 * Public application form validation.
 *
 * Every rule here has a matching CHECK constraint or RLS predicate in
 * `supabase/migrations/0004_applicants.sql` and `0009_rls_policies.sql`. This
 * layer exists for the applicant's benefit — immediate, readable feedback — not
 * as the enforcement point. The database is the enforcement point, because a
 * determined submitter can POST straight to PostgREST.
 */

const PH_PHONE = /^(\+63|0)9\d{9}$/
const OPTIONAL_TEXT = z.string().trim().max(200).optional().or(z.literal(''))

function toNullable(value: string | undefined) {
  return value && value.trim() !== '' ? value.trim() : null
}

export const personalStepSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(80),
  middle_name: OPTIONAL_TEXT,
  last_name: z.string().trim().min(1, 'Last name is required').max(80),
  suffix: z.string().trim().max(10).optional().or(z.literal('')),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .min(1, 'Mobile number is required')
    .regex(PH_PHONE, 'Enter a valid PH mobile number, e.g. 09171234567'),
  birth_date: z
    .string()
    .min(1, 'Date of birth is required')
    .refine((value) => {
      const dob = new Date(value)
      if (Number.isNaN(dob.getTime())) return false
      const eighteen = new Date()
      eighteen.setFullYear(eighteen.getFullYear() - 18)
      return dob <= eighteen
    }, 'You must be at least 18 years old to apply'),
  sex: z.enum(['male', 'female']),
  civil_status: z
    .enum(['single', 'married', 'widowed', 'separated', 'divorced'])
    .optional()
    .or(z.literal('')),
  height_cm: z.string().optional().or(z.literal('')),
  weight_kg: z.string().optional().or(z.literal('')),
})

export const addressStepSchema = z.object({
  address_line: OPTIONAL_TEXT,
  barangay: OPTIONAL_TEXT,
  city_municipality: z.string().trim().min(1, 'City or municipality is required').max(100),
  province: OPTIONAL_TEXT,
  region: OPTIONAL_TEXT,
  postal_code: z.string().trim().max(10).optional().or(z.literal('')),
})

export const positionStepSchema = z.object({
  // A position id, not an enum — positions are configuration rows as of
  // migration 0013. The FK is what validates it; this only checks the shape.
  position_id: z.string().uuid('Select a position'),
  preferred_branch_id: z.string().uuid().optional().or(z.literal('')),
  years_experience: z
    .string()
    .refine((v) => v === '' || (Number(v) >= 0 && Number(v) <= 60), 'Enter 0–60 years'),
  highest_education: OPTIONAL_TEXT,
  expected_salary: z.string().optional().or(z.literal('')),
  availability_date: z.string().optional().or(z.literal('')),
  source: OPTIONAL_TEXT,
})

export const credentialsStepSchema = z.object({
  sss_no: OPTIONAL_TEXT,
  philhealth_no: OPTIONAL_TEXT,
  pagibig_no: OPTIONAL_TEXT,
  tin_no: OPTIONAL_TEXT,
  nbi_clearance_no: OPTIONAL_TEXT,
  nbi_clearance_expiry: z.string().optional().or(z.literal('')),
  police_clearance_no: OPTIONAL_TEXT,
  is_licensed: z.boolean(),
  security_license_no: OPTIONAL_TEXT,
  security_license_expiry: z.string().optional().or(z.literal('')),
})

// `boolean().refine(...)` rather than `literal(true)`: the field starts
// unticked, so the form's value type must permit `false` — it is the *submitted*
// value that has to be true.
export const consentStepSchema = z.object({
  consent_data: z
    .boolean()
    .refine((v) => v, 'You must consent to the processing of your personal data'),
  consent_accuracy: z
    .boolean()
    .refine((v) => v, 'Please confirm the information you provided is accurate'),
})

export const applicationSchema = personalStepSchema
  .merge(addressStepSchema)
  .merge(positionStepSchema)
  .merge(credentialsStepSchema)
  .merge(consentStepSchema)
  // A licensed applicant must supply the licence number the claim rests on.
  .refine(
    (values) => !values.is_licensed || Boolean(values.security_license_no?.trim()),
    {
      message: 'Enter your licence number, or untick "I hold a security licence"',
      path: ['security_license_no'],
    },
  )

export type ApplicationFormValues = z.infer<typeof applicationSchema>

export const applicationDefaults: ApplicationFormValues = {
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  email: '',
  phone: '',
  birth_date: '',
  sex: 'male',
  civil_status: '',
  height_cm: '',
  weight_kg: '',
  address_line: '',
  barangay: '',
  city_municipality: '',
  province: '',
  region: '',
  postal_code: '',
  position_id: '',
  preferred_branch_id: '',
  years_experience: '0',
  highest_education: '',
  expected_salary: '',
  availability_date: '',
  source: '',
  sss_no: '',
  philhealth_no: '',
  pagibig_no: '',
  tin_no: '',
  nbi_clearance_no: '',
  nbi_clearance_expiry: '',
  police_clearance_no: '',
  is_licensed: false,
  security_license_no: '',
  security_license_expiry: '',
  consent_data: true,
  consent_accuracy: true,
}

/**
 * Maps form values onto the payload `submit_application` expects.
 *
 * Only applicant-supplied fields appear here. The pipeline columns — status,
 * reviewed_by, rating, notes — are set by the function itself and are not read
 * from this payload, so there is nothing for a crafted request to override.
 */
export function toApplicantInsert(values: ApplicationFormValues) {
  return {
    first_name: values.first_name.trim(),
    middle_name: toNullable(values.middle_name),
    last_name: values.last_name.trim(),
    suffix: toNullable(values.suffix),
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim(),
    birth_date: values.birth_date,
    sex: values.sex,
    civil_status: values.civil_status ? values.civil_status : null,
    height_cm: values.height_cm ? Number(values.height_cm) : null,
    weight_kg: values.weight_kg ? Number(values.weight_kg) : null,
    address_line: toNullable(values.address_line),
    barangay: toNullable(values.barangay),
    city_municipality: values.city_municipality.trim(),
    province: toNullable(values.province),
    region: toNullable(values.region),
    postal_code: toNullable(values.postal_code),
    position_id: values.position_id,
    preferred_branch_id: values.preferred_branch_id || null,
    years_experience: values.years_experience ? Number(values.years_experience) : 0,
    highest_education: toNullable(values.highest_education),
    expected_salary: values.expected_salary ? Number(values.expected_salary) : null,
    availability_date: values.availability_date || null,
    source: toNullable(values.source),
    sss_no: toNullable(values.sss_no),
    philhealth_no: toNullable(values.philhealth_no),
    pagibig_no: toNullable(values.pagibig_no),
    tin_no: toNullable(values.tin_no),
    nbi_clearance_no: toNullable(values.nbi_clearance_no),
    nbi_clearance_expiry: values.nbi_clearance_expiry || null,
    police_clearance_no: toNullable(values.police_clearance_no),
    security_license_no: toNullable(values.security_license_no),
    security_license_expiry: values.security_license_expiry || null,
    is_licensed: values.is_licensed,
  }
}
