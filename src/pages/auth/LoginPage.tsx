import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { KeyRound, Mail } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { signInWithMagicLink, signInWithPassword } from '@/features/auth/api/authApi'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/utils/cn'

const passwordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

const magicLinkSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})

type PasswordForm = z.infer<typeof passwordSchema>
type MagicLinkForm = z.infer<typeof magicLinkSchema>

export default function LoginPage() {
  const { session, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [linkSent, setLinkSent] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: '', password: '' },
  })

  const magicForm = useForm<MagicLinkForm>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  })

  if (!isLoading && session) return <Navigate to={from} replace />

  async function onPasswordSubmit(values: PasswordForm) {
    try {
      await signInWithPassword(values.email, values.password)
      navigate(from, { replace: true })
    } catch (error) {
      passwordForm.setError('password', {
        message: errorMessage(error, 'Incorrect email or password.'),
      })
    }
  }

  async function onMagicSubmit(values: MagicLinkForm) {
    try {
      await signInWithMagicLink(values.email)
      setLinkSent(true)
    } catch (error) {
      toast.error('Could not send the link', errorMessage(error))
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-text)]">
        Staff sign in
      </h1>
      <p className="mt-1.5 text-sm text-[var(--app-text-muted)]">
        Access the recruitment and deployment console.
      </p>

      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mt-6 flex rounded-lg border border-[var(--app-border)] p-1"
      >
        {(
          [
            { key: 'password', label: 'Password', icon: KeyRound },
            { key: 'magic', label: 'Email link', icon: Mail },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={mode === tab.key}
            onClick={() => {
              setMode(tab.key)
              setLinkSent(false)
            }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              mode === tab.key
                ? 'bg-ink text-white dark:bg-brand-500'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]',
            )}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'password' ? (
        <form
          onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
          className="mt-6 space-y-4"
          noValidate
        >
          <Field label="Email address" error={passwordForm.formState.errors.email?.message}>
            <Input
              type="email"
              autoComplete="username"
              placeholder="you@alohasecurity.ph"
              {...passwordForm.register('email')}
            />
          </Field>

          <Field
            label="Password"
            error={passwordForm.formState.errors.password?.message}
          >
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              {...passwordForm.register('password')}
            />
          </Field>

          <div className="flex justify-end">
            <Link
              to="/auth/forgot-password"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>

          <Button
            type="submit"
            fullWidth
            size="lg"
            isLoading={passwordForm.formState.isSubmitting}
          >
            Sign in
          </Button>
        </form>
      ) : linkSent ? (
        <div className="mt-6 rounded-lg border border-success/25 bg-success-soft p-4">
          <h2 className="text-sm font-semibold text-success">Check your inbox</h2>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            If <strong>{magicForm.getValues('email')}</strong> belongs to an
            active staff account, a sign-in link is on its way. The link expires
            in one hour.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 -ml-2"
            onClick={() => setLinkSent(false)}
          >
            Use a different address
          </Button>
        </div>
      ) : (
        <form
          onSubmit={magicForm.handleSubmit(onMagicSubmit)}
          className="mt-6 space-y-4"
          noValidate
        >
          <Field
            label="Email address"
            error={magicForm.formState.errors.email?.message}
            hint="We'll email you a one-time sign-in link. No password needed."
          >
            <Input
              type="email"
              autoComplete="username"
              placeholder="you@alohasecurity.ph"
              {...magicForm.register('email')}
            />
          </Field>

          <Button
            type="submit"
            fullWidth
            size="lg"
            isLoading={magicForm.formState.isSubmitting}
          >
            Send sign-in link
          </Button>
        </form>
      )}
    </div>
  )
}