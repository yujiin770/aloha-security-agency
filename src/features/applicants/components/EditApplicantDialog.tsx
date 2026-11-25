import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { DraftNotice } from '@/components/ui/DraftNotice'
import { errorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { useDialogDraft } from '@/hooks/useDialogDraft'
import { usePositions } from '@/features/config/hooks/useConfig'
import { listBranchOptions } from '@/features/branches/api/branchesApi'
import { CIVIL_STATUSES } from '@/utils/constants'
import type { ApplicantRow } from '@/types/database.types'
import { updateApplicant } from '../api/applicantsApi'
import {
  applicantEditSchema,
  toApplicantInsert,
  type ApplicantEditValues,
} from '../schemas/applicationSchema'

const str = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(value)

function toFormValues(a: ApplicantRow): ApplicantEditValues {
  return {
    first_name: a.first_name,
    middle_name: str(a.middle_name),
    last_name: a.last_name,
    suffix: str(a.suffix),
    email: a.email,
    phone: a.phone,
    birth_date: a.birth_date,
    sex: a.sex,
    civil_status: a.civil_status ?? '',
    height_cm: str(a.height_cm),
    weight_kg: str(a.weight_kg),
    address_line: str(a.address_line),
    barangay: str(a.barangay),
    city_municipality: str(a.city_municipality),
    province: str(a.province),
    region: str(a.region),
    postal_code: str(a.postal_code),
    position_id: a.position_id,
    preferred_branch_id: str(a.preferred_branch_id),
    years_experience: str(a.years_experience),
    highest_education: str(a.highest_education),
    expected_salary: str(a.expected_salary),
    availability_date: str(a.availability_date),
    source: str(a.source),
    sss_no: str(a.sss_no),
    philhealth_no: str(a.philhealth_no),
    pagibig_no: str(a.pagibig_no),
    tin_no: str(a.tin_no),
    nbi_clearance_no: str(a.nbi_clearance_no),
    nbi_clearance_expiry: str(a.nbi_clearance_expiry),
    police_clearance_no: str(a.police_clearance_no),
    is_licensed: a.is_licensed,
    security_license_no: str(a.security_license_no),
    security_license_expiry: str(a.security_license_expiry),
  }
}

const LEGEND =
  'mb-3 text-xs font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase'

/**
 * Lets staff correct what an applicant submitted. Pipeline fields — status,
 * interview, rejection reason — are not here; they move through the
 * recruitment actions, which keep the status history and notifications.
 */
export function EditApplicantDialog({
  open,
  applicant,
  onClose,
  onResume,
}: {
  open: boolean
  applicant: ApplicantRow
  onClose: () => void
  /** Reopens the dialog when unsaved edits from an earlier visit are found. */
  onResume?: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  // Inactive positions included, so an application for a since-retired
  // position still shows (and keeps) the one it was made for.
  const positions = usePositions(true)
  const facilities = useQuery({
    queryKey: queryKeys.branches.options(),
    queryFn: listBranchOptions,
    staleTime: 5 * 60_000,
    enabled: open,
  })

  const form = useForm<ApplicantEditValues>({
    resolver: zodResolver(applicantEditSchema),
    defaultValues: toFormValues(applicant),
  })
  const errors = form.formState.errors
  const isLicensed = useWatch({ control: form.control, name: 'is_licensed' })

  // Start from the saved record each time the dialog opens. Declared before
  // useDialogDraft so a restored draft is laid over these values, not under them.
  useEffect(() => {
    if (open) form.reset(toFormValues(applicant))
    // Only on opening: a background refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const draft = useDialogDraft({
    id: `applicant.edit:${applicant.id}`,
    form,
    open,
    recordId: applicant.id,
    // The selects need their options before a restored value is laid over them.
    ready: positions.isSuccess,
    onResume: () => onResume?.(),
  })

  const save = useMutation({
    mutationFn: (values: ApplicantEditValues) => {
      const patch = toApplicantInsert(values)
      return updateApplicant(applicant.id, {
        ...patch,
        // Unticking the licence clears what the claim rested on.
        security_license_no: values.is_licensed ? patch.security_license_no : null,
        security_license_expiry: values.is_licensed ? patch.security_license_expiry : null,
      })
    },
    onSuccess: (updated) => {
      toast.success('Applicant updated', `${updated.reference_no} was saved.`)
      void qc.invalidateQueries({ queryKey: queryKeys.applicants.all })
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all })
      // A hired applicant's personnel record is updated in the same transaction (0031).
      if (applicant.status === 'hired') void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
      onClose()
    },
    onError: (error) => toast.error('Could not save changes', errorMessage(error)),
  })

  const positionOptions = (positions.data ?? []).map((p) => ({
    value: p.id,
    label: p.is_active ? p.name : `${p.name} (inactive)`,
  }))

  // Only active facilities are listed. Keep an inactive preference selectable,
  // or saving would silently clear it.
  const facilityOptions = (facilities.data ?? []).map((b) => ({ value: b.id, label: b.name }))
  if (
    applicant.preferred_branch_id &&
    facilities.isSuccess &&
    !facilityOptions.some((o) => o.value === applicant.preferred_branch_id)
  ) {
    facilityOptions.unshift({
      value: applicant.preferred_branch_id,
      label: 'Current facility (inactive)',
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      confirmClose={form.formState.isDirty}
      size="lg"
      title="Edit applicant information"
      description={
        applicant.status === 'hired'
          ? `${applicant.reference_no} · Hired: changes are also saved to their personnel roster record.`
          : `${applicant.reference_no} · Status changes go through the recruitment actions.`
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
          <legend className={LEGEND}>Personal information</legend>
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
            <Field label="Date of birth" required error={errors.birth_date?.message}>
              <Input type="date" {...form.register('birth_date')} />
            </Field>
            <Field label="Sex" required error={errors.sex?.message}>
              <Select
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
                {...form.register('sex')}
              />
            </Field>
            <Field label="Civil status" error={errors.civil_status?.message}>
              <Select
                placeholder="Not stated"
                options={CIVIL_STATUSES.map((c) => ({ value: c.value, label: c.label }))}
                {...form.register('civil_status')}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Height (cm)" error={errors.height_cm?.message}>
                <Input type="number" min={100} max={250} {...form.register('height_cm')} />
              </Field>
              <Field label="Weight (kg)" error={errors.weight_kg?.message}>
                <Input type="number" min={30} max={250} {...form.register('weight_kg')} />
              </Field>
            </div>
            <Field label="Email" required error={errors.email?.message}>
              <Input type="email" autoComplete="off" {...form.register('email')} />
            </Field>
            <Field label="Mobile" required error={errors.phone?.message}>
              <Input inputMode="tel" placeholder="09171234567" {...form.register('phone')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[var(--app-border)] pt-5">
          <legend className={LEGEND}>Address</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Street / house no."
              className="sm:col-span-2"
              error={errors.address_line?.message}
            >
              <Input autoComplete="off" {...form.register('address_line')} />
            </Field>
            <Field label="Barangay" error={errors.barangay?.message}>
              <Input autoComplete="off" {...form.register('barangay')} />
            </Field>
            <Field label="City / municipality" error={errors.city_municipality?.message}>
              <Input autoComplete="off" {...form.register('city_municipality')} />
            </Field>
            <Field label="Province" error={errors.province?.message}>
              <Input autoComplete="off" {...form.register('province')} />
            </Field>
            <Field label="Region" error={errors.region?.message}>
              <Input autoComplete="off" {...form.register('region')} />
            </Field>
            <Field label="Postal code" error={errors.postal_code?.message}>
              <Input autoComplete="off" {...form.register('postal_code')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[var(--app-border)] pt-5">
          <legend className={LEGEND}>Application details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Position applied" required error={errors.position_id?.message}>
              <Select
                placeholder={positions.isLoading ? 'Loading…' : 'Select a position'}
                options={positionOptions}
                {...form.register('position_id')}
              />
            </Field>
            <Field label="Preferred facility" error={errors.preferred_branch_id?.message}>
              <Select
                placeholder={facilities.isLoading ? 'Loading…' : 'No preference'}
                options={facilityOptions}
                {...form.register('preferred_branch_id')}
              />
            </Field>
            <Field label="Years of experience" error={errors.years_experience?.message}>
              <Input type="number" min={0} max={60} {...form.register('years_experience')} />
            </Field>
            <Field label="Highest education" error={errors.highest_education?.message}>
              <Input autoComplete="off" {...form.register('highest_education')} />
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

        <fieldset className="space-y-4 border-t border-[var(--app-border)] pt-5">
          <legend className={LEGEND}>Government numbers &amp; credentials</legend>
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
            <div className="sm:col-span-2">
              <Checkbox label="Holds a security licence" {...form.register('is_licensed')} />
            </div>
            {isLicensed && (
              <>
                <Field
                  label="Security licence no."
                  required
                  error={errors.security_license_no?.message}
                >
                  <Input autoComplete="off" {...form.register('security_license_no')} />
                </Field>
                <Field label="Licence expiry" error={errors.security_license_expiry?.message}>
                  <Input type="date" {...form.register('security_license_expiry')} />
                </Field>
              </>
            )}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
