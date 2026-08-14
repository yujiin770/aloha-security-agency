import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { requestPasswordReset } from '@/features/auth/api/authApi'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})

type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: FormValues) {
    // The confirmation is shown whether or not the address exists. Reporting
    // "no such account" here would let anyone test which staff emails are real.
    try {
      await requestPasswordReset(values.email)
    } catch {
      /* swallowed on purpose — see above */
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div>
        <div className="inline-flex rounded-full bg-success-soft p-3 text-success">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--app-text)]">
          Check your email
        </h1>
        <p className="mt-1.5 text-sm text-[var(--app-text-muted)]">
          If an account exists for <strong>{form.getValues('email')}</strong>,
          we've sent a link to reset your password. It expires in one hour.
        </p>
        <Link to="/auth/login" className="mt-6 inline-block">
          <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to sign in
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-text)]">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-[var(--app-text-muted)]">
        Enter the email address on your staff account and we'll send you a reset
        link.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="Email address" error={form.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="username"
            placeholder="you@alohasecurity.ph"
            {...form.register('email')}
          />
        </Field>

        <Button type="submit" fullWidth size="lg" isLoading={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>

      <Link
        to="/auth/login"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to sign in
      </Link>
    </div>
  )
}
