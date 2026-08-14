import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { RefreshCw, ShieldCheck, UserCog, UserPlus, UserX, UserCheck } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  createStaffUser,
  listUsers,
  setUserActive,
  type StaffUser,
} from '@/features/users/api/usersApi'
import { useAuth } from '@/contexts/AuthContext'
import { useRoles } from '@/features/config/hooks/useConfig'
import { formatRelative, humanize, initials } from '@/utils/format'

const createSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  full_name: z.string().trim().min(1, 'Full name is required').max(120),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(72, 'Use at most 72 characters'),
  role: z.enum([
    'owner',
    'admin',
    'system_administrator',
    'hr_staff',
    'recruitment_officer',
    'deployment_officer',
    'branch_coordinator',
  ]),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
})

type CreateValues = z.infer<typeof createSchema>

/**
 * A readable throwaway password for the admin to hand over. Kept in plain
 * sight in the form on purpose — there is no confirmation email, so this is
 * the only moment the credential can be copied.
 */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('')
}

export default function UsersPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user: currentUser, hasRole } = useAuth()

  const [createOpen, setCreateOpen] = useState(false)
  const [activeTarget, setActiveTarget] = useState<StaffUser | null>(null)

  const users = useQuery({
    queryKey: queryKeys.users.list({ all: true }),
    queryFn: () => listUsers(true),
  })

  const roles = useRoles()

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      email: '',
      full_name: '',
      password: '',
      role: 'recruitment_officer',
      phone: '',
    },
  })

  // `useWatch` rather than `form.watch()` — the latter returns a new function
  // each render, which makes React Compiler skip memoizing this component.
  const selectedRole = useWatch({ control: form.control, name: 'role' })

  function openCreate() {
    form.reset({
      email: '',
      full_name: '',
      password: generatePassword(),
      role: 'recruitment_officer',
      phone: '',
    })
    setCreateOpen(true)
  }

  const create = useMutation({
    mutationFn: (values: CreateValues) =>
      createStaffUser({
        email: values.email.trim().toLowerCase(),
        full_name: values.full_name.trim(),
        password: values.password,
        role: values.role,
        phone: values.phone?.trim() || undefined,
      }),
    onSuccess: (_data, values) => {
      toast.success(
        'User created',
        `${values.email} can sign in now — share the password with them.`,
      )
      setCreateOpen(false)
      form.reset()
      void qc.invalidateQueries({ queryKey: queryKeys.users.all })
    },
    onError: (error) => toast.error('Could not create user', errorMessage(error)),
  })

  const toggleActive = useMutation({
    mutationFn: (user: StaffUser) => setUserActive(user.id, !user.is_active),
    onSuccess: () => {
      toast.success('User updated')
      setActiveTarget(null)
      void qc.invalidateQueries({ queryKey: queryKeys.users.all })
    },
    onError: (error) => toast.error('Could not update user', errorMessage(error)),
  })

  const columns: Column<StaffUser>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
            {initials(row.full_name || row.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--app-text)]">
              {row.full_name || '—'}
              {row.id === currentUser?.id && (
                <span className="ml-1.5 text-xs font-normal text-[var(--app-text-subtle)]">
                  (you)
                </span>
              )}
            </p>
            <p className="truncate text-xs text-[var(--app-text-subtle)]">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (row) =>
        row.roles.length === 0 ? (
          <Badge tone="warning" size="sm">
            No role
          </Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.roles.map((role) => (
              <Badge
                key={role}
                size="sm"
                tone={role === 'owner' ? 'brand' : role === 'admin' ? 'info' : 'neutral'}
              >
                {humanize(role)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.is_active ? 'success' : 'neutral'} size="sm" dot>
          {row.is_active ? 'Active' : 'Deactivated'}
        </Badge>
      ),
    },
    {
      key: 'seen',
      header: 'Last seen',
      secondary: true,
      render: (row) => (
        <span className="text-sm whitespace-nowrap text-[var(--app-text-muted)]">
          {row.last_seen_at ? formatRelative(row.last_seen_at) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (row) => (
        // The row itself opens the detail page; these buttons must not also
        // trigger it, hence the stopPropagation.
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/admin/users/${row.id}`)}
            aria-label={`Open ${row.full_name || row.email}`}
          >
            <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {/* Deactivating yourself would lock you out of the console. */}
          {row.id !== currentUser?.id && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveTarget(row)}
              aria-label={
                row.is_active
                  ? `Deactivate ${row.full_name || row.email}`
                  : `Reactivate ${row.full_name || row.email}`
              }
            >
              {row.is_active ? (
                <UserX className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
              ) : (
                <UserCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      ),
    },
  ]

  // Sourced from the database, so a label or description edited under Data
  // Configuration shows through here rather than drifting from a constant.
  const assignableRoles = (roles.data ?? [])
    .filter((role) => role.is_assignable)
    .filter((role) => role.key !== 'owner' || hasRole('owner'))

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts, and which roles each of them holds."
        actions={
          <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={openCreate}>
            Create user
          </Button>
        }
      />

      <Card className="mb-4 border-info/25 bg-info-soft">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
          <p className="text-sm text-[var(--app-text-muted)]">
            This page assigns roles to people. What each role <em>means</em> —
            its label, rank and permissions — is defined under{' '}
            <Link
              to="/admin/config/roles"
              className="font-medium text-brand-600 hover:underline"
            >
              Data Configuration → Roles
            </Link>
            . Either way, what an account can actually read or write is enforced
            by Row Level Security in the database, not by this screen.
          </p>
        </div>
      </Card>

      <DataTable
        caption="Staff users"
        columns={columns}
        rows={users.data ?? []}
        rowKey={(row) => row.id}
        isLoading={users.isLoading}
        error={users.isError ? errorMessage(users.error) : null}
        onRetry={() => void users.refetch()}
        onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
        emptyTitle="No users yet"
        emptyDescription="Create your first staff member to get started."
      />

      {/* Create ----------------------------------------------------------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a staff member"
        description="The account is created and confirmed straight away — no email is sent."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit((values) => create.mutate(values))}
              isLoading={create.isPending}
            >
              Create user
            </Button>
          </>
        }
      >
        <form className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              required
              error={form.formState.errors.full_name?.message}
            >
              <Input autoComplete="name" {...form.register('full_name')} />
            </Field>
            <Field
              label="Email address"
              required
              error={form.formState.errors.email?.message}
            >
              <Input type="email" {...form.register('email')} />
            </Field>
          </div>

          <Field
            label="Role"
            required
            hint={
              assignableRoles.find((r) => r.key === selectedRole)?.description
            }
            error={form.formState.errors.role?.message}
          >
            <Select
              options={assignableRoles.map((r) => ({
                value: r.key,
                label: r.label,
              }))}
              {...form.register('role')}
            />
          </Field>

          <Field
            label="Temporary password"
            required
            hint="Shown in the clear so you can copy it — share it with the user, who can change it from their profile."
            error={form.formState.errors.password?.message}
          >
            <div className="flex gap-2">
              <Input
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                {...form.register('password')}
              />
              <Button
                type="button"
                variant="secondary"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() =>
                  form.setValue('password', generatePassword(), {
                    shouldValidate: true,
                  })
                }
              >
                Generate
              </Button>
            </div>
          </Field>

          <Field label="Phone" error={form.formState.errors.phone?.message}>
            <Input type="tel" {...form.register('phone')} />
          </Field>

          <p className="rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
            This goes through the <code>admin-create-user</code> Edge Function,
            which holds the service_role key server-side. If creation fails,
            deploy it with{' '}
            <code className="font-mono">
              supabase functions deploy admin-create-user
            </code>
            .
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={activeTarget !== null}
        onClose={() => setActiveTarget(null)}
        onConfirm={() => activeTarget && toggleActive.mutate(activeTarget)}
        title={activeTarget?.is_active ? 'Deactivate user' : 'Reactivate user'}
        tone={activeTarget?.is_active ? 'danger' : 'primary'}
        confirmLabel={activeTarget?.is_active ? 'Deactivate' : 'Reactivate'}
        isLoading={toggleActive.isPending}
        message={
          activeTarget?.is_active ? (
            <>
              <strong>{activeTarget.full_name || activeTarget.email}</strong> will
              lose access immediately — every RLS policy checks the active flag.
              Their history and audit trail are preserved.
            </>
          ) : (
            <>
              <strong>{activeTarget?.full_name || activeTarget?.email}</strong>{' '}
              will regain access with their existing roles.
            </>
          )
        }
      />
    </>
  )
}
