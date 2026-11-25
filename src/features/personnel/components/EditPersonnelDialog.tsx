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
import type { PersonnelRow } from '@/types/database.types'
import { updatePersonnel } from '../api/personnelApi'

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
    emergency_contact_name: optional(120),
    emergency_contact_phone: optional(20),
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

function toFormValues(p: PersonnelRow): FormValues {
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
    emergency_contact_name: p.emergency_contact_name ?? '',
    emergency_contact_phone: p.emergency_contact_phone ?? '',
  }
}

/**
 * Corrects a roster record's personal, licence and statutory details.
 *
 * Status, separation, suspension and blocklisting are deliberately not here:
 * they go through their RPCs (0019, 0027), which keep the action log and the
 * open deployments consistent. Facility changes belong to Deployments.
 */
export function EditPersonnelDialog({
  open,
  person,
  onClose,
  onResume,
}: {
  open: boolean
  person: PersonnelRow
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
    defaultValues: toFormValues(person),
  })
  const errors = form.formState.errors

  // Start from the saved record each time the dialog opens. Declared before
  // useDialogDraft so a restored draft is laid over these values, not under them.
  useEffect(() => {
    if (open) form.reset(toFormValues(person))
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

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      updatePersonnel(person.id, {
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
        emergency_contact_name: blankToNull(values.emergency_contact_name),
        emergency_contact_phone: blankToNull(values.emergency_contact_phone),
      }),
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      confirmClose={form.formState.isDirty}
      size="lg"
      title="Edit personnel information"
      description={
        linked
          ? `${person.employee_no} · Changes are also saved to this person's original application.`
          : `${person.employee_no} · Status, separation and facility are changed from their own actions.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((values) => save.mutate(values))}
            isLoading={save.isPending}
            disabled={!form.formState.isDirty}
          >
            Save changes
          </Button>
        </>
      }
    >
      <DraftNotice restoredAt={draft.restoredAt} onDiscard={draft.discard} />
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
            Government numbers &amp; emergency contact
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
            <Field label="Emergency contact" error={errors.emergency_contact_name?.message}>
              <Input autoComplete="off" {...form.register('emergency_contact_name')} />
            </Field>
            <Field label="Emergency contact phone" error={errors.emergency_contact_phone?.message}>
              <Input inputMode="tel" {...form.register('emergency_contact_phone')} />
            </Field>
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
