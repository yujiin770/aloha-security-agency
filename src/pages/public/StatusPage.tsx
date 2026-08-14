import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { CalendarClock, FileSearch, Search } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Field'
import { checkApplicationStatus } from '@/features/applicants/api/applicantsApi'
import { applicantStatusMeta } from '@/utils/constants'
import { formatDate, formatDateTime } from '@/utils/format'
import { errorMessage } from '@/lib/errors'
import type { ApplicationStatusResult } from '@/types/database.types'

const schema = z.object({
  reference_no: z.string().trim().min(1, 'Reference number is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
})

type FormValues = z.infer<typeof schema>

const STATUS_MESSAGES: Record<string, string> = {
  pending: 'Your application has been received and is queued for review.',
  screening: 'Our recruitment officers are verifying your documents and clearances.',
  interview: 'You have been shortlisted. Watch for an interview invitation by email or phone.',
  hired: 'Congratulations — you have been hired. Our HR team will contact you about onboarding.',
  rejected: 'Thank you for your interest. We are not moving forward with this application.',
  archived: 'This application has been closed.',
}

export default function StatusPage() {
  const [result, setResult] = useState<ApplicationStatusResult | null>(null)
  const [notFound, setNotFound] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reference_no: '', last_name: '' },
  })

  async function onSubmit(values: FormValues) {
    setNotFound(false)
    setResult(null)
    try {
      const found = await checkApplicationStatus(values.reference_no, values.last_name)
      if (found) setResult(found)
      else setNotFound(true)
    } catch (error) {
      form.setError('reference_no', { message: errorMessage(error) })
    }
  }

  const meta = result ? applicantStatusMeta(result.status) : undefined

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <div className="mx-auto inline-flex rounded-full bg-brand-50 p-3 text-brand-600 dark:bg-brand-900/25">
          <FileSearch className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--app-text)] sm:text-3xl">
          Check your application status
        </h1>
        <p className="mt-2 text-sm text-[var(--app-text-muted)]">
          Enter the reference number from your confirmation, along with your
          surname.
        </p>
      </div>

      <Card className="mt-8">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            label="Reference number"
            required
            hint="Looks like ASA-2026-000123"
            error={form.formState.errors.reference_no?.message}
          >
            <Input
              placeholder="ASA-2026-000123"
              className="font-mono uppercase"
              {...form.register('reference_no')}
            />
          </Field>

          <Field
            label="Last name"
            required
            error={form.formState.errors.last_name?.message}
          >
            <Input autoComplete="family-name" {...form.register('last_name')} />
          </Field>

          <Button
            type="submit"
            fullWidth
            size="lg"
            isLoading={form.formState.isSubmitting}
            leftIcon={<Search className="h-4 w-4" />}
          >
            Check status
          </Button>
        </form>
      </Card>

      {notFound && (
        <Card className="mt-5 border-warning/30 bg-warning-soft">
          <h2 className="text-sm font-semibold text-amber-800">
            No matching application
          </h2>
          <p className="mt-1 text-sm text-amber-900/80">
            Check that the reference number and surname match your confirmation
            exactly. Closed and archived applications no longer appear here. If
            you're sure the details are right,{' '}
            <Link to="/contact" className="font-medium underline">
              get in touch
            </Link>
            .
          </p>
        </Card>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-5"
        >
          <Card padded={false}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--app-border)] p-5">
              <div>
                <p className="font-mono text-sm font-semibold text-brand-600">
                  {result.reference_no}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">
                  {result.first_name} {result.last_name}
                </h2>
                <p className="text-sm text-[var(--app-text-muted)]">
                  {result.position_name} · Submitted{' '}
                  {formatDate(result.submitted_at)}
                </p>
              </div>
              <Badge tone={meta?.tone ?? 'neutral'} dot>
                {meta?.label ?? result.status}
              </Badge>
            </div>

            <div className="p-5">
              <p className="text-sm leading-relaxed text-[var(--app-text)]">
                {STATUS_MESSAGES[result.status]}
              </p>

              {result.interview_at && (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-info/25 bg-info-soft p-4">
                  <CalendarClock
                    className="mt-0.5 h-5 w-5 shrink-0 text-info"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-info">
                      Interview scheduled
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--app-text-muted)]">
                      {formatDateTime(result.interview_at)}. Bring your original
                      clearances and valid ID.
                    </p>
                  </div>
                </div>
              )}

              {result.timeline.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold tracking-wide text-[var(--app-text-subtle)] uppercase">
                    Progress
                  </h3>
                  <ol className="mt-3 space-y-0">
                    {result.timeline.map((entry, index) => {
                      const entryMeta = applicantStatusMeta(entry.status)
                      const isLast = index === result.timeline.length - 1
                      return (
                        <li key={`${entry.status}-${entry.at}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500"
                              aria-hidden="true"
                            />
                            {!isLast && (
                              <span
                                className="w-px flex-1 bg-[var(--app-border)]"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <div className={isLast ? 'pb-0' : 'pb-5'}>
                            <p className="text-sm font-medium text-[var(--app-text)]">
                              {entryMeta?.label ?? entry.status}
                            </p>
                            <p className="text-xs text-[var(--app-text-subtle)]">
                              {formatDateTime(entry.at)}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
