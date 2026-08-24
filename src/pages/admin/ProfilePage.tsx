import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { KeyRound, Save, ShieldCheck } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { requestPasswordReset, updateOwnProfile } from '@/features/auth/api/authApi'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, humanize, initials } from '@/utils/format'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Your name is required').max(120),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  job_title: z.string().trim().max(100).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

export default function ProfilePage() {
  const { user, refresh, isAdmin } = useAuth()
  const toast = useToast()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      full_name: user?.profile.full_name ?? '',
      phone: user?.profile.phone ?? '',
      job_title: user?.profile.job_title ?? '',
    },
  })

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      updateOwnProfile(user!.id, {
        full_name: values.full_name.trim(),
        phone: values.phone?.trim() || null,
        job_title: values.job_title?.trim() || null,
      }),
    onSuccess: async () => {
      toast.success('Profile saved')
      await refresh()
    },
    onError: (error) => toast.error('Could not save your profile', errorMessage(error)),
  })

  const resetPassword = useMutation({
    mutationFn: () => requestPasswordReset(user!.email),
    onSuccess: () =>
      toast.success(
        'Reset link sent',
        `Check ${user?.email} for a link to set a new password.`,
      ),
    onError: (error) => toast.error('Could not send reset link', errorMessage(error)),
  })

  if (!user) return null

  /**
   * - Admins see "Settings" to allow navigating back.
   */
  const breadcrumbs = isAdmin 
    ? [{ label: 'Settings', to: '/admin/settings' }] 
    : undefined

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title="My profile"
        description="Your account details and how you sign in."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <CardHeader title="Details" />
            <form
              onSubmit={form.handleSubmit((values) => save.mutate(values))}
              className="space-y-4 p-5"
              noValidate
            >
              <Field
                label="Full name"
                required
                error={form.formState.errors.full_name?.message}
              >
                <Input autoComplete="name" {...form.register('full_name')} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone" error={form.formState.errors.phone?.message}>
                  <Input type="tel" autoComplete="tel" {...form.register('phone')} />
                </Field>
                <Field label="Job title" error={form.formState.errors.job_title?.message}>
                  <Input {...form.register('job_title')} />
                </Field>
              </div>

              <Field
                label="Email address"
                hint="Contact an administrator to change the address on your account."
              >
                <Input value={user.email} readOnly disabled />
              </Field>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  leftIcon={<Save className="h-4 w-4" />}
                  isLoading={save.isPending}
                >
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          <Card padded={false}>
            <CardHeader
              title="Password"
              description="We'll email you a secure link rather than asking for your current password here."
              icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
            />
            <div className="p-5">
              <Button
                variant="secondary"
                onClick={() => resetPassword.mutate()}
                isLoading={resetPassword.isPending}
              >
                Send me a password reset link
              </Button>
              <p className="mt-2 text-xs text-[var(--app-text-subtle)]">
                The link expires after one hour and can only be used once.
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-base font-semibold text-white">
                {initials(user.profile.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--app-text)]">
                  {user.profile.full_name}
                </p>
                <p className="truncate text-sm text-[var(--app-text-muted)]">
                  {user.profile.job_title ?? user.email}
                </p>
              </div>
            </div>

            <dl className="mt-5 space-y-3 border-t border-[var(--app-border)] pt-4 text-sm">
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                  Roles
                </dt>
                <dd className="mt-1.5 flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role} tone={role === 'owner' ? 'brand' : 'info'} size="sm">
                      {humanize(role)}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                  Member since
                </dt>
                <dd className="mt-0.5 text-[var(--app-text)]">
                  {formatDateTime(user.profile.created_at)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="border-info/25 bg-info-soft">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-info"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--app-text-muted)]">
                Sessions expire after 8 hours of inactivity and are forced out
                after 24 hours. Sign out on shared machines.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}