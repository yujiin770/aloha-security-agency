import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Copy,
  RotateCcw,
  Search,
  Send,
  TriangleAlert,
  WifiOff,
} from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { FileUpload } from '@/features/applicants/components/FileUpload'
import {
  applicationDefaults,
  applicationSchema,
  type ApplicationFormValues,
} from '@/features/applicants/schemas/applicationSchema'
import {
  submitApplication,
  uploadApplicantDocument,
} from '@/features/applicants/api/applicantsApi'
import { listBranchOptions } from '@/features/branches/api/branchesApi'
import { queryKeys } from '@/lib/queryKeys'
import { toAppError } from '@/lib/errors'
import { useFormDraft } from '@/hooks/useFormDraft'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePublicPositions } from '@/features/config/hooks/useConfig'
import { CIVIL_STATUSES } from '@/utils/constants'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { DocumentType } from '@/types/database.types'

/**
 * Multi-step public application.
 *
 * One react-hook-form instance spans all steps; "Next" validates only the
 * current step's fields via `trigger`, so an applicant is never blocked by an
 * error on a page they haven't reached.
 *
 * Documents are held in memory and uploaded after the applicant row exists —
 * the storage RLS policy in 0010 requires a real pending application before it
 * accepts an object.
 */

const STEPS = [
  { id: 'personal', title: 'Personal details' },
  { id: 'address', title: 'Address' },
  { id: 'position', title: 'Position' },
  { id: 'credentials', title: 'Credentials' },
  { id: 'documents', title: 'Documents' },
  { id: 'review', title: 'Review' },
] as const

const STEP_FIELDS: Record<number, FieldPath<ApplicationFormValues>[]> = {
  0: ['first_name', 'middle_name', 'last_name', 'suffix', 'email', 'phone', 'birth_date', 'sex', 'civil_status', 'height_cm', 'weight_kg'],
  1: ['address_line', 'barangay', 'city_municipality', 'province', 'region', 'postal_code'],
  2: ['position_id', 'preferred_branch_id', 'years_experience', 'highest_education', 'expected_salary', 'availability_date', 'source'],
  3: ['sss_no', 'philhealth_no', 'pagibig_no', 'tin_no', 'nbi_clearance_no', 'nbi_clearance_expiry', 'police_clearance_no', 'is_licensed', 'security_license_no', 'security_license_expiry'],
  4: [],
  5: ['consent_data', 'consent_accuracy'],
}

const DOCUMENT_SLOTS: {
  type: DocumentType
  label: string
  description?: string
  required?: boolean
}[] = [
  { type: 'resume', label: 'Résumé / bio-data', description: 'Recommended', required: false },
  { type: 'government_id', label: 'Valid government ID' },
  { type: 'nbi_clearance', label: 'NBI clearance' },
  { type: 'security_license', label: 'Security licence (LESP/SOSIA)', description: 'If licensed' },
]

const DRAFT_KEY = 'aloha:application-draft:v1'

/**
 * Never persisted. Consent has to be given deliberately each session rather
 * than restored on the applicant's behalf, and files cannot be serialised.
 */
const DRAFT_OMIT: (keyof ApplicationFormValues)[] = ['consent_data', 'consent_accuracy']

export default function ApplyPage() {
  const toast = useToast()
  const online = useOnlineStatus()
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [reference, setReference] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitFailure, setSubmitFailure] = useState<
    { kind: 'network' | 'other'; message: string } | null
  >(null)
  const [draftDismissed, setDraftDismissed] = useState(false)

  // One idempotency key per filled-in form, so a retry after an ambiguous
  // timeout cannot create a second applicant record. State rather than a ref:
  // `onSubmit` reads it, and `onSubmit` is created during render.
  const [submissionId] = useState(() => crypto.randomUUID())

  const { data: branches = [] } = useQuery({
    queryKey: queryKeys.branches.options(),
    queryFn: listBranchOptions,
    staleTime: 10 * 60_000,
  })

  const { data: positions = [], isLoading: positionsLoading } = usePublicPositions()

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { ...applicationDefaults, consent_data: false, consent_accuracy: false },
    mode: 'onBlur',
  })

  // `useWatch` rather than `form.watch()`: the latter returns a fresh function
  // each render, which makes React Compiler skip memoizing this whole (large)
  // component.
  const isLicensed = useWatch({ control: form.control, name: 'is_licensed' })
  const selectedPositionId = useWatch({ control: form.control, name: 'position_id' })
  const selectedPosition = positions.find((p) => p.id === selectedPositionId)

  const draft = useFormDraft({
    key: DRAFT_KEY,
    form,
    step,
    onRestoreStep: setStep,
    omit: DRAFT_OMIT,
    enabled: reference === null,
  })

  function startOver() {
    draft.discard()
    form.reset({ ...applicationDefaults, consent_data: false, consent_accuracy: false })
    setFiles({})
    setStep(0)
    setDraftDismissed(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function next() {
    const fields = STEP_FIELDS[step] ?? []
    const valid = fields.length === 0 || (await form.trigger(fields))
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function onSubmit(values: ApplicationFormValues) {
    if (!navigator.onLine) {
      setSubmitFailure({
        kind: 'network',
        message: 'You appear to be offline right now.',
      })
      return
    }

    setSubmitFailure(null)

    try {
      const applicant = await submitApplication(values, {
        submissionId,
      })

      // Uploads are best-effort: the application itself is already safely
      // recorded, so a failed attachment must not read as a failed submission.
      const pending = Object.entries(files).filter(([, file]) => file)
      const failures: string[] = []

      for (const [documentType, file] of pending) {
        // One retry each — an upload interrupted by a brief drop usually
        // succeeds second time, and the applicant has no way to reattach later.
        let uploaded = false
        for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
          try {
            await uploadApplicantDocument({
              applicantId: applicant.id,
              documentType: documentType as DocumentType,
              file: file!,
            })
            uploaded = true
          } catch {
            /* fall through to the retry, then to the failure list */
          }
        }
        if (!uploaded) failures.push(documentType.replace(/_/g, ' '))
      }

      if (failures.length > 0) {
        toast.warning(
          'Application submitted, some files did not upload',
          `You can bring these to your interview: ${failures.join(', ')}.`,
        )
      }

      draft.clear()
      setReference(applicant.reference_no)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      const appError = toAppError(error)
      // A dropped connection is recoverable and the answers are safe, so it
      // gets a state the applicant can act on rather than a toast that vanishes.
      if (appError.code === 'NETWORK' || !navigator.onLine) {
        setSubmitFailure({ kind: 'network', message: appError.message })
      } else {
        setSubmitFailure({ kind: 'other', message: appError.message })
        toast.error('Could not submit your application', appError.message)
      }
    }
  }

  /* ---------------------------------------------------------------- success */
  if (reference) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="text-center">
            <div className="mx-auto inline-flex rounded-full bg-success-soft p-4 text-success">
              <CircleCheck className="h-8 w-8" aria-hidden="true" />
            </div>

            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--app-text)]">
              Application received
            </h1>
            <p className="mt-2 text-sm text-[var(--app-text-muted)]">
              Thank you for applying to Aloha Security Agency. Our recruitment
              team will review your submission and contact you at the email
              address you provided.
            </p>

            <div className="mt-6 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-5">
              <p className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                Your reference number
              </p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-brand-600">
                {reference}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                leftIcon={
                  copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => {
                  void navigator.clipboard.writeText(reference)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Copied' : 'Copy reference'}
              </Button>
              <p className="mt-3 text-xs text-[var(--app-text-muted)]">
                Write this down. You'll need it — along with your surname — to
                check your application status.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/status">
                <Button leftIcon={<Search className="h-4 w-4" />}>
                  Check status
                </Button>
              </Link>
              <Link to="/">
                <Button variant="secondary">Back to home</Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      </div>
    )
  }

  /* ------------------------------------------------------------------- form */
  const errors = form.formState.errors

  return (
    // `PublicLayout`'s header is `fixed`, so it takes no space in the flow.
    // Pages built on <PageHero> absorb that with their own top padding; this one
    // is not, so it has to clear the header itself or the title sits under it.
    <div className="mx-auto w-full max-w-3xl px-4 pt-28 pb-12 sm:px-6 sm:pt-32">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-text)] sm:text-3xl">
        Application form
      </h1>
      <p className="mt-2 text-sm text-[var(--app-text-muted)]">
        Takes about ten minutes. Fields marked{' '}
        <span className="text-brand-500">*</span> are required. Your answers are
        saved on this device as you go, so it is safe to close the page and come
        back.
      </p>

      {draft.restoredAt && !draftDismissed && (
        <div
          role="status"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 dark:bg-info/10"
        >
          <p className="text-sm text-[var(--app-text)]">
            <RotateCcw className="mr-1.5 -mt-0.5 inline h-4 w-4" aria-hidden="true" />
            We restored your progress from {formatRelative(draft.restoredAt)}.
            Attachments and the consent boxes need to be filled in again.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraftDismissed(true)}>
              Continue
            </Button>
            <Button variant="secondary" size="sm" onClick={startOver}>
              Start over
            </Button>
          </div>
        </div>
      )}

      {/* Stepper */}
      <ol className="mt-8 flex flex-wrap gap-1" aria-label="Application progress">
        {STEPS.map((s, index) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              // Backwards navigation only — jumping ahead would skip validation.
              onClick={() => index < step && setStep(index)}
              disabled={index > step}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'flex h-1.5 w-full rounded-full transition-colors',
                index < step && 'bg-laurel-500',
                index === step && 'bg-brand-500',
                index > step && 'bg-[var(--app-border)]',
                index < step && 'cursor-pointer',
              )}
            >
              <span className="sr-only">
                {s.title}
                {index < step ? ' (completed)' : index === step ? ' (current)' : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs font-medium text-[var(--app-text-muted)]">
        Step {step + 1} of {STEPS.length} — {STEPS[step]!.title}
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6" noValidate>
        <Card>
          {/* 0 — Personal ------------------------------------------------- */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" required error={errors.first_name?.message}>
                  <Input autoComplete="given-name" {...form.register('first_name')} />
                </Field>
                <Field label="Middle name" error={errors.middle_name?.message}>
                  <Input autoComplete="additional-name" {...form.register('middle_name')} />
                </Field>
                <Field label="Last name" required error={errors.last_name?.message}>
                  <Input autoComplete="family-name" {...form.register('last_name')} />
                </Field>
                <Field label="Suffix" hint="Jr., Sr., III" error={errors.suffix?.message}>
                  <Input {...form.register('suffix')} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email address" required error={errors.email?.message}>
                  <Input type="email" autoComplete="email" {...form.register('email')} />
                </Field>
                <Field
                  label="Mobile number"
                  required
                  hint="e.g. 09171234567"
                  error={errors.phone?.message}
                >
                  <Input type="tel" autoComplete="tel" {...form.register('phone')} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
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
                    placeholder="Select…"
                    options={CIVIL_STATUSES.map((c) => ({
                      value: c.value,
                      label: c.label,
                    }))}
                    {...form.register('civil_status')}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Height (cm)" error={errors.height_cm?.message}>
                  <Input type="number" min={100} max={250} {...form.register('height_cm')} />
                </Field>
                <Field label="Weight (kg)" error={errors.weight_kg?.message}>
                  <Input type="number" min={30} max={250} {...form.register('weight_kg')} />
                </Field>
              </div>
            </div>
          )}

          {/* 1 — Address -------------------------------------------------- */}
          {step === 1 && (
            <div className="space-y-4">
              <Field label="House no. and street" error={errors.address_line?.message}>
                <Input autoComplete="street-address" {...form.register('address_line')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Barangay" error={errors.barangay?.message}>
                  <Input {...form.register('barangay')} />
                </Field>
                <Field
                  label="City / municipality"
                  required
                  error={errors.city_municipality?.message}
                >
                  <Input {...form.register('city_municipality')} />
                </Field>
                <Field label="Province" error={errors.province?.message}>
                  <Input {...form.register('province')} />
                </Field>
                <Field label="Region" error={errors.region?.message}>
                  <Input placeholder="e.g. NCR, Region VII" {...form.register('region')} />
                </Field>
              </div>
              <Field label="Postal code" error={errors.postal_code?.message}>
                <Input className="sm:max-w-[12rem]" {...form.register('postal_code')} />
              </Field>
            </div>
          )}

          {/* 2 — Position ------------------------------------------------- */}
          {step === 2 && (
            <div className="space-y-4">
              <Field
                label="Position applied for"
                required
                hint={
                  positionsLoading
                    ? 'Loading open positions…'
                    : selectedPosition?.description || undefined
                }
                error={errors.position_id?.message}
              >
                <Select
                  placeholder="Select a position…"
                  options={positions.map((p) => ({ value: p.id, label: p.name }))}
                  {...form.register('position_id')}
                />
              </Field>

              {/* Requirements come from the position's configured fields, so
                  this can never contradict what an administrator has set. */}
              {selectedPosition && (
                <ul className="space-y-1 rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
                  <li>Minimum age {selectedPosition.min_age}</li>
                  {selectedPosition.min_years_experience > 0 && (
                    <li>
                      At least {selectedPosition.min_years_experience} year(s) of
                      experience
                    </li>
                  )}
                  {selectedPosition.min_height_cm && (
                    <li>Minimum height {selectedPosition.min_height_cm} cm</li>
                  )}
                  {selectedPosition.requires_license && (
                    <li>A valid LESP/SOSIA security licence is required</li>
                  )}
                </ul>
              )}

              <Field
                label="Preferred branch or area"
                hint={
                  branches.length === 0
                    ? 'Optional — we will match you to the nearest available post.'
                    : 'Optional'
                }
                error={errors.preferred_branch_id?.message}
              >
                <Select
                  placeholder="No preference"
                  options={branches.map((b) => ({
                    value: b.id,
                    label: `${b.name} — ${b.city_municipality}`,
                  }))}
                  {...form.register('preferred_branch_id')}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Years of experience"
                  error={errors.years_experience?.message}
                >
                  <Input type="number" min={0} max={60} {...form.register('years_experience')} />
                </Field>
                <Field label="Highest education" error={errors.highest_education?.message}>
                  <Input
                    placeholder="e.g. High school graduate"
                    {...form.register('highest_education')}
                  />
                </Field>
                <Field
                  label="Expected monthly salary (₱)"
                  error={errors.expected_salary?.message}
                >
                  <Input type="number" min={0} step={500} {...form.register('expected_salary')} />
                </Field>
                <Field
                  label="Available to start"
                  error={errors.availability_date?.message}
                >
                  <Input type="date" {...form.register('availability_date')} />
                </Field>
              </div>

              <Field
                label="How did you hear about us?"
                error={errors.source?.message}
              >
                <Textarea rows={2} {...form.register('source')} />
              </Field>
            </div>
          )}

          {/* 3 — Credentials ---------------------------------------------- */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-[var(--app-text)]">
                  Government numbers
                </h2>
                <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                  Optional now — you can provide these at interview.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="SSS number" error={errors.sss_no?.message}>
                    <Input {...form.register('sss_no')} />
                  </Field>
                  <Field label="PhilHealth number" error={errors.philhealth_no?.message}>
                    <Input {...form.register('philhealth_no')} />
                  </Field>
                  <Field label="Pag-IBIG number" error={errors.pagibig_no?.message}>
                    <Input {...form.register('pagibig_no')} />
                  </Field>
                  <Field label="TIN" error={errors.tin_no?.message}>
                    <Input {...form.register('tin_no')} />
                  </Field>
                </div>
              </div>

              <div className="border-t border-[var(--app-border)] pt-5">
                <h2 className="text-sm font-semibold text-[var(--app-text)]">
                  Clearances
                </h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="NBI clearance number" error={errors.nbi_clearance_no?.message}>
                    <Input {...form.register('nbi_clearance_no')} />
                  </Field>
                  <Field
                    label="NBI clearance expiry"
                    error={errors.nbi_clearance_expiry?.message}
                  >
                    <Input type="date" {...form.register('nbi_clearance_expiry')} />
                  </Field>
                  <Field
                    label="Police clearance number"
                    error={errors.police_clearance_no?.message}
                  >
                    <Input {...form.register('police_clearance_no')} />
                  </Field>
                </div>
              </div>

              <div className="border-t border-[var(--app-border)] pt-5">
                <h2 className="text-sm font-semibold text-[var(--app-text)]">
                  Security licence
                </h2>
                <div className="mt-3">
                  <Checkbox
                    label="I hold a valid LESP / SOSIA security licence"
                    {...form.register('is_licensed')}
                  />
                </div>
                {isLicensed && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Licence number"
                      required
                      error={errors.security_license_no?.message}
                    >
                      <Input {...form.register('security_license_no')} />
                    </Field>
                    <Field
                      label="Licence expiry"
                      error={errors.security_license_expiry?.message}
                    >
                      <Input type="date" {...form.register('security_license_expiry')} />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4 — Documents ------------------------------------------------ */}
          {step === 4 && (
            <div className="space-y-5">
              <p className="text-sm text-[var(--app-text-muted)]">
                Upload what you have to hand. Anything missing can be brought to
                your interview — it won't hold up your application.
              </p>
              {DOCUMENT_SLOTS.map((slot) => (
                <FileUpload
                  key={slot.type}
                  documentType={slot.type}
                  label={slot.label}
                  description={slot.description}
                  value={files[slot.type] ?? null}
                  onChange={(file) =>
                    setFiles((current) => ({ ...current, [slot.type]: file }))
                  }
                />
              ))}
            </div>
          )}

          {/* 5 — Review --------------------------------------------------- */}
          {step === 5 && (
            <div className="space-y-5">
              <ReviewSummary
                values={form.getValues()}
                files={files}
                positionName={selectedPosition?.name ?? '—'}
              />

              <div className="space-y-3 border-t border-[var(--app-border)] pt-5">
                <div>
                  <Checkbox
                    label="I consent to the processing of my personal data"
                    description="Aloha Security Agency will use this information to assess my application, in line with the Data Privacy Act of 2012 (RA 10173). Records are retained for five years after closure, then permanently deleted."
                    {...form.register('consent_data')}
                  />
                  {errors.consent_data && (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {errors.consent_data.message}
                    </p>
                  )}
                </div>

                <div>
                  <Checkbox
                    label="I confirm the information I have given is true and accurate"
                    description="Providing false information is grounds for rejection or dismissal."
                    {...form.register('consent_accuracy')}
                  />
                  {errors.consent_accuracy && (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {errors.consent_accuracy.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Submission failure — recoverable, so it stays on screen */}
        {submitFailure && (
          <div
            role="alert"
            className={cn(
              'mt-5 rounded-lg border px-4 py-3',
              submitFailure.kind === 'network'
                ? 'border-warning/40 bg-warning-soft dark:bg-warning/10'
                : 'border-danger/40 bg-danger-soft dark:bg-danger/10',
            )}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
              {submitFailure.kind === 'network' ? (
                <>
                  <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Your connection dropped
                </>
              ) : (
                <>
                  <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  We couldn't submit your application
                </>
              )}
            </p>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">
              {submitFailure.message}
              {submitFailure.kind === 'network' &&
                ' Your answers are saved on this device — try again once you are back online.'}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              disabled={!online || form.formState.isSubmitting}
              isLoading={form.formState.isSubmitting}
              onClick={() => void form.handleSubmit(onSubmit)()}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={step === 0 || form.formState.isSubmitting}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={next} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Continue
            </Button>
          ) : (
            <div className="text-right">
              <Button
                type="submit"
                size="lg"
                disabled={!online}
                isLoading={form.formState.isSubmitting}
                leftIcon={<Send className="h-4 w-4" />}
              >
                Submit application
              </Button>
              {!online && (
                <p className="mt-1.5 text-xs text-[var(--app-text-muted)]">
                  You're offline. Your answers are saved — submit once you
                  reconnect.
                </p>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function ReviewSummary({
  values,
  files,
  positionName,
}: {
  values: ApplicationFormValues
  files: Record<string, File | null>
  positionName: string
}) {
  const attached = Object.entries(files).filter(([, file]) => file)

  const rows: [string, string][] = [
    ['Name', [values.first_name, values.middle_name, values.last_name, values.suffix].filter(Boolean).join(' ')],
    ['Email', values.email],
    ['Mobile', values.phone],
    ['Date of birth', values.birth_date],
    ['Address', [values.address_line, values.barangay, values.city_municipality, values.province].filter(Boolean).join(', ')],
    ['Position', positionName],
    ['Experience', `${values.years_experience || 0} year(s)`],
    ['Licensed', values.is_licensed ? `Yes — ${values.security_license_no}` : 'No'],
  ]

  return (
    <div>
      <h2 className="text-sm font-semibold text-[var(--app-text)]">
        Check your details
      </h2>
      <dl className="mt-3 divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]">
        {rows.map(([term, value]) => (
          <div key={term} className="flex gap-4 px-4 py-2.5 text-sm">
            <dt className="w-36 shrink-0 text-[var(--app-text-muted)]">{term}</dt>
            <dd className="min-w-0 flex-1 break-words font-medium text-[var(--app-text)]">
              {value || '—'}
            </dd>
          </div>
        ))}
        <div className="flex gap-4 px-4 py-2.5 text-sm">
          <dt className="w-36 shrink-0 text-[var(--app-text-muted)]">Documents</dt>
          <dd className="min-w-0 flex-1 font-medium text-[var(--app-text)]">
            {attached.length === 0
              ? 'None attached'
              : attached.map(([type]) => type.replace(/_/g, ' ')).join(', ')}
          </dd>
        </div>
      </dl>
    </div>
  )
}
