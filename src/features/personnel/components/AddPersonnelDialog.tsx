import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { usePositions, useRanksForPosition } from '@/features/config/hooks/useConfig'
import { createPersonnel } from '../api/personnelApi'

const PH_PHONE = /^(\+63|0)9\d{9}$/
const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))
const optionalDate = z.string().optional().or(z.literal(''))

const schema = z
  .object({
    employee_no: optional(40),
    first_name: z.string().trim().min(1, 'First name is required').max(80),
    middle_name: optional(80),
    last_name: z.string().trim().min(1, 'Last name is required').max(80),
    suffix: optional(10),
    email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
    phone: z
      .string()
      .trim()
      .regex(PH_PHONE, 'Enter a valid PH mobile number, e.g. 09171234567')
      .optional()
      .or(z.literal('')),
    birth_date: optionalDate,
    sex: z.enum(['male', 'female']).optional().or(z.literal('')),
    position_id: z.string().min(1, 'Choose a position'),
    rank_id: z.string().optional().or(z.literal('')),
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
  .refine((v) => !v.date_hired || v.date_hired <= new Date().toISOString().slice(0, 10), {
    path: ['date_hired'],
    message: 'Date hired cannot be in the future',
  })

type FormValues = z.infer<typeof schema>

const DEFAULTS: FormValues = {
  employee_no: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  email: '',
  phone: '',
  birth_date: '',
  sex: '',
  position_id: '',
  rank_id: '',
  date_hired: '',
  security_license_no: '',
  security_license_expiry: '',
  sss_no: '',
  philhealth_no: '',
  pagibig_no: '',
  tin_no: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
}

const blankToNull = (value: string | undefined) => (value?.trim() ? value.trim() : null)

/**
 * Adds a guard who was already employed before the system existed, straight
 * onto the roster with no application behind them.
 */
export function AddPersonnelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const positions = usePositions()

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS })
  const positionId = useWatch({ control: form.control, name: 'position_id' })
  const ranks = useRanksForPosition(positionId || null)
  const errors = form.formState.errors

  function close() {
    form.reset(DEFAULTS)
    onClose()
  }

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      createPersonnel({
        employee_no: blankToNull(values.employee_no),
        first_name: values.first_name.trim(),
        middle_name: blankToNull(values.middle_name),
        last_name: values.last_name.trim(),
        suffix: blankToNull(values.suffix),
        email: blankToNull(values.email),
        phone: blankToNull(values.phone),
        birth_date: blankToNull(values.birth_date),
        sex: values.sex || null,
        position_id: values.position_id,
        rank_id: blankToNull(values.rank_id),
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
    onSuccess: (person) => {
      toast.success(
        'Personnel added',
        `${person.first_name} ${person.last_name} is on the roster as ${person.employee_no}.`,
      )
      void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all })
      close()
      navigate(`/admin/personnel/${person.id}`)
    },
    onError: (error) => toast.error('Could not add personnel', errorMessage(error)),
  })

  return (
    <Modal
      open={open}
      onClose={close}
      confirmClose={form.formState.isDirty}
      size="lg"
      title="Add existing personnel"
      description="For guards already employed by the agency. New hires still come through Applicants."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((values) => create.mutate(values))}
            isLoading={create.isPending}
          >
            Add to roster
          </Button>
        </>
      }
    >
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
            <Field label="Date of birth" error={errors.birth_date?.message}>
              <Input type="date" {...form.register('birth_date')} />
            </Field>
            <Field label="Sex" error={errors.sex?.message}>
              <Select
                placeholder="Not recorded"
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
                {...form.register('sex')}
              />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" autoComplete="off" {...form.register('email')} />
            </Field>
            <Field label="Mobile" error={errors.phone?.message}>
              <Input inputMode="tel" placeholder="09171234567" {...form.register('phone')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[var(--app-border)] pt-5">
          <legend className="mb-3 text-xs font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase">
            Employment
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Position" required error={errors.position_id?.message}>
              <Select
                placeholder={positions.isLoading ? 'Loading…' : 'Choose a position'}
                options={(positions.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                {...form.register('position_id', {
                  onChange: () => form.setValue('rank_id', ''),
                })}
              />
            </Field>
            <Field
              label="Rank"
              hint={positionId ? undefined : 'Choose a position first'}
              error={errors.rank_id?.message}
            >
              <Select
                placeholder="No rank"
                disabled={!positionId}
                options={(ranks.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
                {...form.register('rank_id')}
              />
            </Field>
            <Field label="Date hired" required error={errors.date_hired?.message}>
              <Input type="date" {...form.register('date_hired')} />
            </Field>
            <Field
              label="Employee no."
              hint="Leave blank to generate one (ASA-EMP-…)"
              error={errors.employee_no?.message}
            >
              <Input autoComplete="off" {...form.register('employee_no')} />
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
