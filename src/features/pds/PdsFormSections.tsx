import type { ReactNode } from 'react'
import {
  Controller,
  get,
  useFieldArray,
  useWatch,
  type FieldPath,
  type UseFormReturn,
} from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { calculateAge } from '@/utils/format'
import {
  EMPTY_DEPENDENT,
  EMPTY_EMPLOYMENT,
  EMPTY_REFERENCE,
  EMPTY_TRAINING,
  PDS_LIMITS,
  type PdsFormValues,
  type PdsListField,
  type PdsSection,
} from './pdsSchema'

type Form = UseFormReturn<PdsFormValues>

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

/**
 * The Personal Data Sheet's inputs, one fieldset per section. `required`
 * marks the fields the public form insists on (pdsApplySchema); staff forms
 * leave it off, since older records predate these fields.
 */
export function PdsFormSections({
  form,
  sections,
  required = false,
}: {
  form: Form
  sections: PdsSection[]
  required?: boolean
}) {
  return (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <div
          key={section}
          className={index > 0 ? 'border-t border-[var(--app-border)] pt-5' : undefined}
        >
          {SECTION_RENDERERS[section]({ form, required })}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function err(form: Form, path: string): string | undefined {
  const e = get(form.formState.errors, path)
  return (e?.message ?? e?.root?.message) as string | undefined
}

function Heading({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-[var(--app-text)]">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">{hint}</p>}
    </div>
  )
}

function TextField({
  form,
  name,
  label,
  required,
  hint,
  className,
  type,
  placeholder,
}: {
  form: Form
  name: FieldPath<PdsFormValues>
  label: string
  required?: boolean
  hint?: ReactNode
  className?: string
  type?: string
  placeholder?: string
}) {
  return (
    <Field label={label} required={required} hint={hint} className={className} error={err(form, name)}>
      <Input type={type} placeholder={placeholder} autoComplete="off" {...form.register(name)} />
    </Field>
  )
}

function YesNoField({
  form,
  name,
  label,
  className,
}: {
  form: Form
  name: FieldPath<PdsFormValues>
  label: string
  className?: string
}) {
  return (
    <Field label={label} className={className} error={err(form, name)}>
      <Select placeholder="—" options={YES_NO} {...form.register(name)} />
    </Field>
  )
}

/* -------------------------------------------------------------------------- */

type RendererProps = { form: Form; required: boolean }

const SECTION_RENDERERS: Record<PdsSection, (props: RendererProps) => ReactNode> = {
  family: ({ form, required }) => (
    <>
      <Heading title="Personal background" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="place_of_birth" label="Place of birth" required={required} />
        <TextField form={form} name="religion" label="Religion" />
        <TextField
          form={form}
          name="provincial_address"
          label="Provincial address"
          className="sm:col-span-2"
        />
        <TextField form={form} name="father_name" label="Father's name" />
        <TextField form={form} name="father_occupation" label="Father's occupation" />
        <TextField form={form} name="mother_name" label="Mother's name" />
        <TextField form={form} name="mother_occupation" label="Mother's occupation" />
        <TextField
          form={form}
          name="parents_address"
          label="Parents' address"
          className="sm:col-span-2"
        />
      </div>
      <div className="mt-5">
        <Heading title="If married" hint="Leave blank if not married." />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="spouse_name" label="Name of spouse" />
          <TextField form={form} name="spouse_occupation" label="Spouse's occupation" />
          <TextField
            form={form}
            name="spouse_address"
            label="Spouse's exact address"
            className="sm:col-span-2"
          />
        </div>
      </div>
    </>
  ),

  emergency: ({ form, required }) => (
    <>
      <Heading title="Contact person in case of emergency" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="emergency_contact_name" label="Name" required={required} />
        <TextField
          form={form}
          name="emergency_contact_relationship"
          label="Relationship"
          placeholder="e.g. Mother, Spouse"
          required={required}
        />
        <Field label="Contact number" required={required} error={err(form, 'emergency_contact_phone')}>
          <Input inputMode="tel" placeholder="09171234567" {...form.register('emergency_contact_phone')} />
        </Field>
        <TextField form={form} name="emergency_contact_occupation" label="Occupation" />
      </div>
    </>
  ),

  education: ({ form }) => (
    <>
      <Heading title="Education" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="school_name" label="Name of school" />
        <TextField form={form} name="course" label="Course" />
        <TextField
          form={form}
          name="date_graduated"
          label="Date graduated"
          placeholder="e.g. March 2012"
        />
      </div>
      <div className="mt-5">
        <ListEditor
          form={form}
          name="trainings"
          title="Security training attended"
          addLabel="Add training"
          empty={EMPTY_TRAINING}
          columns={[
            { key: 'training', label: 'Training' },
            { key: 'school', label: 'Name of training school' },
            { key: 'dates', label: 'Inclusive dates', placeholder: 'e.g. Jan–Mar 2019' },
          ]}
        />
      </div>
    </>
  ),

  military: ({ form }) => (
    <>
      <Heading title="PNP / military training" hint="Leave blank if none." />
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
        {(
          [
            ['military_pnp', 'PNP'],
            ['military_afp', 'AFP'],
            ['military_rotc', 'ROTC / CMT'],
          ] as const
        ).map(([name, label]) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <Checkbox
                label={label}
                checked={field.value === 'yes'}
                onChange={(e) => field.onChange(e.target.checked ? 'yes' : '')}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="military_branch" label="Branch of service" />
        <TextField form={form} name="military_serial_no" label="PNP / AFP serial no." />
        <TextField form={form} name="military_rank" label="Rank" />
        <TextField form={form} name="military_status" label="Status" placeholder="e.g. Retired, Reservist" />
        <TextField
          form={form}
          name="military_years_service"
          label="Years in service"
          type="number"
        />
        <TextField form={form} name="military_reason_leaving" label="Reason for leaving" />
      </div>
    </>
  ),

  dependents: ({ form }) => (
    <ListEditor
      form={form}
      name="dependents"
      title="Dependents"
      hint="Age is worked out from the date of birth."
      addLabel="Add dependent"
      empty={EMPTY_DEPENDENT}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'birth_date', label: 'Date of birth', type: 'date', showAge: true },
        { key: 'relationship', label: 'Relationship' },
        { key: 'address', label: 'Address' },
      ]}
    />
  ),

  employment: ({ form }) => (
    <ListEditor
      form={form}
      name="employment_history"
      title="Employment background"
      hint="Most recent first."
      addLabel="Add employer"
      empty={EMPTY_EMPLOYMENT}
      columns={[
        { key: 'employer', label: 'Previous employer' },
        // Free text, as on the paper form and in imports: "Jan 2019", "2019".
        { key: 'from', label: 'From', placeholder: 'e.g. Jan 2019' },
        { key: 'to', label: 'To', placeholder: 'e.g. Dec 2022' },
        { key: 'salary', label: 'Salary', placeholder: '₱' },
        { key: 'reason', label: 'Reason for leaving' },
      ]}
    />
  ),

  references: ({ form, required }) => (
    <ListEditor
      form={form}
      name="character_references"
      title="Character references"
      hint={`Persons not related to you.${required ? ' At least one is required.' : ''}`}
      addLabel="Add reference"
      empty={EMPTY_REFERENCE}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'company', label: 'Company' },
        { key: 'position', label: 'Position' },
        { key: 'contact', label: 'Address / tel. no.' },
      ]}
    />
  ),

  other: ({ form }) => <OtherSection form={form} />,

  ids: ({ form }) => (
    <>
      <Heading title="Badge, licence control and residence certificate" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="badge_no" label="Badge no." />
        <TextField form={form} name="license_control_no" label="Licence control no." />
        <TextField form={form} name="res_cert_no" label="Res. cert. no." />
        <TextField form={form} name="res_cert_issued_on" label="Res. cert. issued on" type="date" />
        <TextField
          form={form}
          name="res_cert_issued_at"
          label="Res. cert. issued at"
          className="sm:col-span-2"
        />
      </div>
    </>
  ),
}

function OtherSection({ form }: { form: Form }) {
  const [hasLoans, hasRecord] = useWatch({
    control: form.control,
    name: ['has_loans', 'has_criminal_record'],
  })
  return (
    <>
      <Heading title="Other information" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Special skills" className="sm:col-span-2" error={err(form, 'special_skills')}>
          <Textarea rows={2} {...form.register('special_skills')} />
        </Field>
        <YesNoField form={form} name="has_loans" label="Any loans in SSS, Pag-IBIG, etc.?" />
        {hasLoans === 'yes' ? (
          <TextField form={form} name="loan_details" label="Loan details" />
        ) : (
          <div className="hidden sm:block" />
        )}
        <YesNoField form={form} name="has_criminal_record" label="Ever convicted of any crime?" />
        {hasRecord === 'yes' ? (
          <TextField form={form} name="criminal_record_details" label="Please specify" />
        ) : (
          <div className="hidden sm:block" />
        )}
        <YesNoField form={form} name="drinks_alcohol" label="Drinks alcoholic beverages?" />
        <YesNoField form={form} name="smokes" label="Smokes cigarettes?" />
        <TextField
          form={form}
          name="health_problems"
          label="Health problems"
          className="sm:col-span-2"
          placeholder="Leave blank if none"
        />
        <YesNoField
          form={form}
          name="willing_background_check"
          label="Willing to undergo background investigation?"
        />
        <YesNoField
          form={form}
          name="willing_any_assignment"
          label="Willing to be assigned anywhere in Region 9 or nearby provinces?"
        />
        <TextField
          form={form}
          name="recommended_by"
          label="Who recommended you to this agency?"
          className="sm:col-span-2"
        />
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */

interface ListColumn {
  key: string
  label: string
  type?: string
  placeholder?: string
  /** Shows the age worked out from this date. */
  showAge?: boolean
}

function ListEditor({
  form,
  name,
  title,
  hint,
  addLabel,
  empty,
  columns,
}: {
  form: Form
  name: PdsListField
  title: string
  hint?: string
  addLabel: string
  empty: object
  columns: ListColumn[]
}) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name })
  const max = PDS_LIMITS[name]
  const listError = err(form, name)

  return (
    <div>
      <Heading title={title} hint={hint} />
      {fields.length === 0 && (
        <p className="mb-3 text-sm text-[var(--app-text-subtle)]">None listed.</p>
      )}
      <ol className="space-y-3">
        {fields.map((field, index) => (
          <li
            key={field.id}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--app-text-subtle)]">
                {index + 1}.
              </span>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => remove(index)}
                aria-label={`Remove entry ${index + 1}`}
              >
                Remove
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {columns.map((col) => {
                const path = `${name}.${index}.${col.key}` as FieldPath<PdsFormValues>
                return (
                  <Field
                    key={col.key}
                    label={col.label}
                    error={err(form, path)}
                    hint={col.showAge ? <AgeHint form={form} path={path} /> : undefined}
                  >
                    <Input
                      type={col.type}
                      placeholder={col.placeholder}
                      autoComplete="off"
                      {...form.register(path)}
                    />
                  </Field>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
      {listError && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {listError}
        </p>
      )}
      <Button
        className="mt-3"
        size="sm"
        variant="secondary"
        leftIcon={<Plus className="h-3.5 w-3.5" />}
        disabled={fields.length >= max}
        onClick={() => append({ ...empty } as never)}
      >
        {fields.length >= max ? `Up to ${max}` : addLabel}
      </Button>
    </div>
  )
}

function AgeHint({ form, path }: { form: Form; path: FieldPath<PdsFormValues> }) {
  const value = useWatch({ control: form.control, name: path }) as string | undefined
  const age = calculateAge(value || null)
  return age === null ? null : <>Age {age}</>
}
