import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ShieldCheck } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { updatePassword } from '@/features/auth/api/authApi'
import { errorMessage } from '@/lib/errors'

/**
 * Password requirements mirror `password_requirements` in supabase/config.toml
 * (`lower_upper_letters_digits_symbols`, minimum 10). Checking client-side is a
 * courtesy so the user isn't bounced by the server after submitting.
 */
const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number')
      .regex(/[^A-Za-z0-9]/, 'Include a symbol'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type FormValues = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [ready, setReady] = useState<boolean | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  // Supabase exchanges the recovery link for a session on load
  // (`detectSessionInUrl`). Without one, there is nothing to update.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setReady(Boolean(data.session))
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(values: FormValues) {
    try {
      await updatePassword(values.password)
      toast.success('Password updated', 'You can now sign in with your new password.')
      navigate('/admin', { replace: true })
    } catch (error) {
      form.setError('password', { message: errorMessage(error) })
    }
  }

  if (ready === null) {
    return <p className="text-sm text-[var(--app-text-muted)]">Checking your link…</p>
  }

  if (!ready) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-text)]">
          This link is no longer valid
        </h1>
        <p className="mt-1.5 text-sm text-[var(--app-text-muted)]">
          Reset links expire after an hour and can only be used once. Request a
          new one to continue.
        </p>
        <Button className="mt-6" onClick={() => navigate('/auth/forgot-password')}>
          Request a new link
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="inline-flex rounded-full bg-brand-50 p-3 text-brand-600 dark:bg-brand-900/25">
        <ShieldCheck className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--app-text)]">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-sm text-[var(--app-text-muted)]">
        At least 10 characters, mixing upper and lower case, a number and a
        symbol.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="New password" error={form.formState.errors.password?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
        </Field>

        <Field label="Confirm password" error={form.formState.errors.confirm?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            {...form.register('confirm')}
          />
        </Field>

        <Button type="submit" fullWidth size="lg" isLoading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </div>
  )
}
