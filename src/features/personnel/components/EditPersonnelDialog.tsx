import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { DraftNotice } from '@/components/ui/DraftNotice'
import { errorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { useDialogDraft } from '@/hooks/useDialogDraft'
import { CIVIL_STATUSES } from '@/utils/constants'
import type { ApplicantRow, PersonnelRow } from '@/types/database.types'
import { updateApplicant } from '@/features/applicants/api/applicantsApi'
import { updatePersonnel } from '../api/personnelApi'
import { PdsFormSections } from '@/features/pds/PdsFormSections'
import { ALL_PDS_SECTIONS, pdsToPatch, type PdsFormValues } from '@/features/pds/pdsSchema'
import { usePdsSubform } from '@/features/pds/usePdsSubform'

/** Same shape the database accepts for applicants (0004); lenient for imported numbers. */
const PHONE = /^[0-9+()\s-]{7,20}$/
const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))
const optionalDate = z.string().optional().or(z.literal(''))

const baseSchema = z
  .object({
    employee_no: z.string().trim().min(1, 'Employee number is required').max(40),
    first_name: z.string().trim().min(1, 'First name is required').max(80),
    middle_name: optional(80),
    last_name: z.string().trim().min(1, 'Last name is required').max(80),
    suffix: optional(10),
    email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
    phone: z
      .string()
      .trim()
      .regex(PHONE, 'Enter a valid mobile number, e.g. 09171234567')
      .optional()
      .or(z.literal('')),
    birth_date: optionalDate,
    sex: z.enum(['male', 'female']).optional().or(z.literal('')),
    civil_status: z
      .enum(['single', 'married', 'widowed', 'separated', 'divorced'])
      .optional()
      .or(z.literal('')),
    height_cm: z
      .string()
      .refine((v) => v === '' || (Number(v) >= 100 && Number(v) <= 250), 'Enter 100–250 cm'),
    weight_kg: z
      .string()
      .refine((v) => v === '' || (Number(v) >= 30 && Number(v) <= 250), 'Enter 30–250 kg'),
    highest_education: optional(200),
    address: optional(300),
    date_hired: z.string().min(1, 'Date hired is required'),
    security_license_no: optional(60),
    security_license_expiry: optionalDate,
    sss_no: optional(30),
    philhealth_no: optional(30),
    pagibig_no: optional(30),
    tin_no: optional(30),
    // Held only on the application this guard was hired from; shown and saved
    // only when there is one.
    nbi_clearance_no: optional(200),
    nbi_clearance_expiry: optionalDate,
    police_clearance_no: optional(200),
    years_experience: z
      .string()
      .refine((v) => v === '' || (Number(v) >= 0 && Number(v) <= 60), 'Enter 0–60 years'),
    expected_salary: z
      .string()
      .refine((v) => v === '' || Number(v) >= 0, 'Enter an amount of 0 or more'),
    availability_date: optionalDate,
    source: optional(200),
  })
  .refine((v) => v.date_hired <= new Date().toISOString().slice(0, 10), {
    path: ['date_hired'],
    message: 'Date hired cannot be in the future',
  })

type FormValues = z.infer<typeof baseSchema>

/**
 * A guard hired through the pipeline shares these details with their
 * application (0031), and an application cannot leave them blank.
 */
const REQUIRED_WHEN_LINKED: [keyof FormValues, string][] = [
  ['email', 'Email is required — it is shared with the application'],
  ['phone', 'Mobile number is required — it is shared with the application'],
  ['birth_date', 'Date of birth is required — it is shared with the application'],
  ['sex', 'Sex is required — it is shared with the application'],
]

function schemaFor(linked: boolean) {
  if (!linked) return baseSchema
  return baseSchema.superRefine((values, ctx) => {
    for (const [field, message] of REQUIRED_WHEN_LINKED) {
      if (!String(values[field] ?? '').trim()) ctx.addIssue({ code: 'custom', path: [field], message })
    }
  })
}

const blankToNull = (value: string | undefined) => (value?.trim() ? value.trim() : null)

/** The application-only fields, which save to the application rather than the roster. */
const APPLICATION_FIELDS = [
  'nbi_clearance_no',
  'nbi_clearance_expiry',
  'police_clearance_no',
  'years_experience',
  'expected_salary',
  'availability_date',
  'source',
] as const satisfies readonly (keyof FormValues)[]

const str = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(value)

function toFormValues(p: PersonnelRow, a?: ApplicantRow | null): FormValues {
  return {
    employee_no: p.employee_no,
    first_name: p.first_name,
    middle_name: p.middle_name ?? '',
    last_name: p.last_name,
    suffix: p.suffix ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    birth_date: p.birth_date ?? '',
    sex: p.sex ?? '',
    civil_status: p.civil_status ?? '',
    height_cm: p.height_cm === null ? '' : String(p.height_cm),
    weight_kg: p.weight_kg === null ? '' : String(p.weight_kg),
    highest_education: p.highest_education ?? '',
    address: p.address ?? '',
    date_hired: p.date_hired,
    security_license_no: p.security_license_no ?? '',
    security_license_expiry: p.security_license_expiry ?? '',
    sss_no: p.sss_no ?? '',
    philhealth_no: p.philhealth_no ?? '',
    pagibig_no: p.pagibig_no ?? '',
    tin_no: p.tin_no ?? '',
    nbi_clearance_no: str(a?.nbi_clearance_no),
    nbi_clearance_expiry: str(a?.nbi_clearance_expiry),
    police_clearance_no: str(a?.police_clearance_no),
    years_experience: str(a?.years_experience),
    expected_salary: str(a?.expected_salary),
    availability_date: str(a?.availability_date),
    source: str(a?.source),
  }
}

/**
 * Corrects a roster record's personal, licence and statutory details — and,
 * for a guard hired through the pipeline, the application details only the
 * application holds (clearances, experience, salary), so one dialog edits the
 * whole record.
 *
 * Status, separation, suspension and blocklisting are deliberately not here:
 * they go through their RPCs (0019, 0027), which keep the action log and the
 * open deployments consistent. Facility changes belong to Deployments.
 */
export function EditPersonnelDialog({
  open,
  person,
  application,
  onClose,
  onResume,
}: {
  open: boolean
  person: PersonnelRow
  /** The application this guard was hired from, when the user may read it. */
  application?: ApplicantRow | null
  onClose: () => void
  /** Reopens the dialog when unsaved edits from an earlier visit are found. */
  onResume?: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const linked = Boolean(person.applicant_id)
  const schema = useMemo(() => schemaFor(linked), [linked])
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(person, application),
  })
  const errors = form.formState.errors

  // Start from the saved record each time the dialog opens. Declared before
  // useDialogDraft so a restored draft is laid over these values, not under them.
  useEffect(() => {
    if (open) form.reset(toFormValues(person, application))
    // Only on opening: a background refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const draft = useDialogDraft({
    id: `personnel.edit:${person.id}`,
    form,
    open,
    recordId: person.id,
    onResume: () => onResume?.(),
  })

  const pds = usePdsSubform({
    record: person,
    open,
    draftId: 'pds.personnel',
    recordId: person.id,
    onResume,
  })
  const dirty = form.formState.isDirty || pds.form.formState.isDirty

  const save = useMutation({
    mutationFn: async ({ values, pdsValues }: { values: FormValues; pdsValues: PdsFormValues }) => {
      const updated = await updatePersonnel(person.id, {
        employee_no: values.employee_no.trim(),
        first_name: values.first_name.trim(),
        middle_name: blankToNull(values.middle_name),
        last_name: values.last_name.trim(),
        suffix: blankToNull(values.suffix),
        email: blankToNull(values.email)?.toLowerCase() ?? null,
        phone: blankToNull(values.phone),
        birth_date: blankToNull(values.birth_date),
        sex: values.sex || null,
        civil_status: values.civil_status || null,
        height_cm: values.height_cm ? Number(values.height_cm) : null,
        weight_kg: values.weight_kg ? Number(values.weight_kg) : null,
        highest_education: blankToNull(values.highest_education),
        address: blankToNull(values.address),
        date_hired: values.date_hired,
        security_license_no: blankToNull(values.security_license_no),
        security_license_expiry: blankToNull(values.security_license_expiry),
        sss_no: blankToNull(values.sss_no),
        philhealth_no: blankToNull(values.philhealth_no),
        pagibig_no: blankToNull(values.pagibig_no),
        tin_no: blankToNull(values.tin_no),
        // The Personal Data Sheet is part of the same record and the same save.
        ...pdsToPatch(pdsValues),
      })
      // Shared details already reached the application through the sync
      // trigger (0031/0032); only its own fields are written here, and only
      // when one of them was changed.
      const dirtyFields = form.formState.dirtyFields
      if (application && APPLICATION_FIELDS.some((field) => dirtyFields[field])) {
        await updateApplicant(application.id, {
          nbi_clearance_no: blankToNull(values.nbi_clearance_no),
          nbi_clearance_expiry: blankToNull(values.nbi_clearance_expiry),
          police_clearance_no: blankToNull(values.police_clearance_no),
          years_experience: values.years_experience ? Number(values.years_experience) : 0,
          expected_salary: values.expected_salary ? Number(values.expected_salary) : null,
          availability_date: blankToNull(values.availability_date),
          source: blankToNull(values.source),
        })
      }
      return updated
    },
    onSuccess: (updated) => {
      toast.success('Personnel updated', `${updated.first_name} ${updated.last_name}'s record was saved.`)
      void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
      // Licence expiry feeds the dashboard's "expiring" count.
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all })
      void qc.invalidateQueries({ queryKey: queryKeys.deployments.all })
      // The linked application was updated in the same transaction (0031).
      if (linked) void qc.invalidateQueries({ queryKey: queryKeys.applicants.all })
      onClose()
    },
    onError: (error) => toast.error('Could not save changes', errorMessage(error)),
  })

  // Both halves are checked before anything is saved, so every invalid field
  // is highlighted at once, wherever it is in the dialog.
  async function submit() {
    const [mainOk, pdsOk] = await Promise.all([form.trigger(), pds.form.trigger()])
    if (!mainOk || !pdsOk) {
      toast.error('Check the highlighted fields', 'Some details need correcting before saving.')
      return
    }
    save.mutate({ values: form.getValues(), pdsValues: pds.form.getValues() })
  }

  function discardDrafts() {
    draft.discard()
    pds.draft.discard()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      confirmClose={dirty}
      size="xl"
      title="Edit personnel information"
      description={
        linked
          ? `${person.employee_no} · One record: changes are saved to both the roster and the application.`
          : `${person.employee_no} · Status, separation and facility are changed from their own actions.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            isLoading={save.isPending}
            disabled={!dirty}
          >
            Save changes
          </Button>
        </>
      }
    >
      <DraftNotice
        restoredAt={draft.restoredAt ?? pds.draft.restoredAt}
        onDiscard={discardDrafts}
      />
      <form className="space-y-6" noValidate onSubmit={(e) => e.preventDefault()}>
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase">
            Identity
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required error={errors.first_name?.message}>
              <Input autoComplete="off" {...form.register('first_name')} />
            </Field>
            <Field label="Last name" required error={errors.last_name?.message}>
              <Input autoComplete="off" {...form.register('last_name')} />
            </Field>
            <Field label="Middle name" error={errors.middle_name?.message}>
              <Input autoComplete="off" {...form.register('middle_name')} />
            </Field>
            <Field label="Suffix" error={errors.suffix?.message}>
              <Input placeholder="Jr., III" {...form.register('suffix')} />
            </Field>
            <Field label="Date of birth" required={linked} error={errors.birth_date?.message}>
              <Input type="date" {...form.register('birth_date')} />
            </Field>
            <Field label="Sex" required={linked} error={errors.sex?.message}>
              <Select
                placeholder="Not recorded"
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
                {...form.register('sex')}
              />
            </Field>
            <Field label="Civil status" error={errors.civil_status?.message}>
              <Select
                placeholder="Not recorded"
                options={CIVIL_STATUSES.map((c) => ({ value: c.value, label: c.label }))}
                {...form.register('civil_status')}
              />
            </Field>
            <Field label="Highest education" error={errors.highest_education?.message}>
              <Input autoComplete="off" {...form.register('highest_education')} />
            </Field>
            <Field label="Height (cm)" error={errors.height_cm?.message}>
              <Input type="number" min={100} max={250} {...form.register('height_cm')} />
            </Field>
            <Field label="Weight (kg)" error={errors.weight_kg?.message}>
              <Input type="number" min={30} max={250} {...form.register('weight_kg')} />
            </Field>
            <Field label="Email" required={linked} error={errors.email?.message}>
              <Input type="email" autoComplete="off" {...form.register('email')} />
            </Field>
            <Field label="Mobile" required={linked} error={errors.phone?.message}>
              <Input inputMode="tel" placeholder="09171234567" {...form.register('phone')} />
            </Field>
            <Field label="Address" className="sm:col-span-2" error={errors.address?.message}>
              <Input autoComplete="off" placeholder="Barangay, city" {...form.register('address')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[var(--app-border)] pt-5">
          <legend className="mb-3 text-xs font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase">
            Employment &amp; licence
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee no." required error={errors.employee_no?.message}>
              <Input autoComplete="off" {...form.register('employee_no')} />
            </Field>
            <Field label="Date hired" required error={errors.date_hired?.message}>
              <Input type="date" {...form.register('date_hired')} />
            </Field>
            <Field label="Security licence no." error={errors.security_license_no?.message}>
              <Input autoComplete="off" {...form.register('security_license_no')} />
            </Field>
            <Field label="Licence expiry" error={errors.security_license_expiry?.message}>
              <Input type="date" {...form.register('security_license_expiry')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[var(--app-border)] pt-5">
          <legend className="mb-3 text-xs font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase">
            Government numbers
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SSS no." error={errors.sss_no?.message}>
              <Input autoComplete="off" {...form.register('sss_no')} />
            </Field>
            <Field label="PhilHealth no." error={errors.philhealth_no?.message}>
              <Input autoComplete="off" {...form.register('philhealth_no')} />
            </Field>
            <Field label="Pag-IBIG no." error={errors.pagibig_no?.message}>
              <Input autoComplete="off" {...form.register('pagibig_no')} />
            </Field>
            <Field label="TIN" error={errors.tin_no?.message}>
              <Input autoComplete="off" {...form.register('tin_no')} />
            </Field>
          </div>
        </fieldset>

        {application && (
          <fieldset className="space-y-4 border-t border-[var(--app-border)] pt-5">
            <legend className="mb-3 text-xs font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase">
              Clearances &amp; application
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="NBI clearance no." error={errors.nbi_clearance_no?.message}>
                <Input autoComplete="off" {...form.register('nbi_clearance_no')} />
              </Field>
              <Field label="NBI expiry" error={errors.nbi_clearance_expiry?.message}>
                <Input type="date" {...form.register('nbi_clearance_expiry')} />
              </Field>
              <Field
                label="Police clearance no."
                className="sm:col-span-2"
                error={errors.police_clearance_no?.message}
              >
                <Input autoComplete="off" {...form.register('police_clearance_no')} />
              </Field>
              <Field label="Years of experience" error={errors.years_experience?.message}>
                <Input type="number" min={0} max={60} {...form.register('years_experience')} />
              </Field>
              <Field label="Expected salary (₱)" error={errors.expected_salary?.message}>
                <Input type="number" min={0} {...form.register('expected_salary')} />
              </Field>
              <Field label="Available from" error={errors.availability_date?.message}>
                <Input type="date" {...form.register('availability_date')} />
              </Field>
              <Field label="Heard about us via" error={errors.source?.message}>
                <Input autoComplete="off" {...form.register('source')} />
              </Field>
            </div>
          </fieldset>
        )}

        <fieldset className="border-t border-[var(--app-border)] pt-5">
          <legend className="mb-3 text-xs font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase">
            Personal Data Sheet
          </legend>
          <PdsFormSections form={pds.form} sections={ALL_PDS_SECTIONS} />
        </fieldset>
      </form>
    </Modal>
  )
}
