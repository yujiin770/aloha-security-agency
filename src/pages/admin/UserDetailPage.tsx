import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  assignRole,
  getStaffUser,
  revokeRole,
  setUserActive,
} from '@/features/users/api/usersApi'
import { useAuth } from '@/contexts/AuthContext'
import { useRoles } from '@/features/config/hooks/useConfig'
import { formatDateTime, formatRelative, humanize, initials } from '@/utils/format'

export default function UserDetailPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const qc = useQueryClient()
  const { user: currentUser, hasRole } = useAuth()

  const [deactivateOpen, setDeactivateOpen] = useState(false)

  const user = useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => getStaffUser(id),
    enabled: Boolean(id),
  })

  const roles = useRoles()

  const changeRole = useMutation({
    mutationFn: ({ role, grant }: { role: string; grant: boolean }) =>
      grant ? assignRole(id, role) : revokeRole(id, role),
    onSuccess: (_data, { role, grant }) => {
      toast.success(
        grant ? 'Access granted' : 'Access revoked',
        `${humanize(role)} ${grant ? 'added to' : 'removed from'} this account.`,
      )
      void qc.invalidateQueries({ queryKey: queryKeys.users.all })
    },
    onError: (error) => toast.error('Could not update access', errorMessage(error)),
  })

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => setUserActive(id, isActive),
    onSuccess: () => {
      toast.success('User updated')
      setDeactivateOpen(false)
      void qc.invalidateQueries({ queryKey: queryKeys.users.all })
    },
    onError: (error) => toast.error('Could not update user', errorMessage(error)),
  })

  if (user.isLoading) return <LoadingState label="Loading user…" />

  if (user.isError || !user.data) {
    return (
      <Card>
        <ErrorState
          title="User not found"
          message={
            user.error
              ? errorMessage(user.error)
              : 'This account does not exist, or you do not have access to it.'
          }
        />
        <div className="flex justify-center pb-6">
          <Link to="/admin/users">
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back to users
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  const u = user.data
  const isSelf = u.id === currentUser?.id

  // Sourced from the database, so a label or description edited under Data
  // Configuration shows through here rather than drifting from a constant.
  const assignableRoles = (roles.data ?? [])
    .filter((role) => role.is_assignable)
    .filter((role) => role.key !== 'owner' || hasRole('owner'))

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Users', to: '/admin/users' },
          { label: u.full_name || u.email },
        ]}
        title={u.full_name || u.email}
        description={u.email}
        actions={
          <>
            <Badge tone={u.is_active ? 'success' : 'neutral'} dot>
              {u.is_active ? 'Active' : 'Deactivated'}
            </Badge>
            {/* Deactivating yourself would lock you out of the console. */}
            {!isSelf &&
              (u.is_active ? (
                <Button
                  variant="secondary"
                  leftIcon={<UserX className="h-4 w-4" />}
                  onClick={() => setDeactivateOpen(true)}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  leftIcon={<UserCheck className="h-4 w-4" />}
                  isLoading={toggleActive.isPending}
                  onClick={() => toggleActive.mutate(true)}
                >
                  Reactivate
                </Button>
              ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card padded={false}>
            <CardHeader
              title="Access"
              description="Grant or revoke a role and it takes effect on this account immediately."
              icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            />

            {roles.isLoading ? (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">Loading roles…</p>
            ) : assignableRoles.length === 0 ? (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">
                No assignable roles are defined.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {assignableRoles.map((role) => {
                  const granted = u.roles.includes(role.key)
                  return (
                    <li
                      key={role.key}
                      className="flex items-start justify-between gap-4 px-5 py-4"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-[var(--app-text)]">
                          {role.label}
                          {granted && (
                            <Badge tone="success" size="sm">
                              Granted
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                          {role.description}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={granted ? 'secondary' : 'primary'}
                        isLoading={
                          changeRole.isPending && changeRole.variables?.role === role.key
                        }
                        onClick={() =>
                          changeRole.mutate({ role: role.key, grant: !granted })
                        }
                      >
                        {granted ? 'Revoke' : 'Grant'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            {isSelf && (
              <p className="border-t border-[var(--app-border)] px-5 py-3 text-xs text-[var(--app-text-muted)]">
                This is your own account — revoking your administrator role here
                will end your access to this page.
              </p>
            )}
          </Card>

          <Card padded={false}>
            <CardHeader title="Account" />
            <dl className="grid gap-x-6 p-5 sm:grid-cols-2">
              {(
                [
                  ['Full name', u.full_name || '—'],
                  ['Email', u.email],
                  ['Phone', u.phone ?? '—'],
                  ['Status', u.is_active ? 'Active' : 'Deactivated'],
                  [
                    'Last seen',
                    u.last_seen_at ? formatRelative(u.last_seen_at) : 'Never',
                  ],
                  ['Created', formatDateTime(u.created_at)],
                ] as [string, string][]
              ).map(([term, value]) => (
                <div key={term} className="py-2.5">
                  <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
                    {term}
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--app-text)]">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white">
                {initials(u.full_name || u.email)}
              </span>
              <div>
                <p className="font-medium text-[var(--app-text)]">
                  {u.full_name || '—'}
                  {isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-[var(--app-text-subtle)]">
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-sm text-[var(--app-text-subtle)]">{u.email}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                {u.roles.length === 0 ? (
                  <Badge tone="warning" size="sm">
                    No role
                  </Badge>
                ) : (
                  u.roles.map((role) => (
                    <Badge
                      key={role}
                      size="sm"
                      tone={
                        role === 'owner' ? 'brand' : role === 'admin' ? 'info' : 'neutral'
                      }
                    >
                      {humanize(role)}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card className="border-info/25 bg-info-soft">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-info"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--app-text-muted)]">
                What each role <em>means</em> — its label, rank and permissions —
                is defined under{' '}
                <Link
                  to="/admin/config/roles"
                  className="font-medium text-brand-600 hover:underline"
                >
                  Data Configuration → Roles
                </Link>
                . What this account can actually read or write is enforced by Row
                Level Security in the database, not by this screen.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={() => toggleActive.mutate(false)}
        title="Deactivate user"
        tone="danger"
        confirmLabel="Deactivate"
        isLoading={toggleActive.isPending}
        message={
          <>
            <strong>{u.full_name || u.email}</strong> will lose access immediately
            — every RLS policy checks the active flag. Their history and audit
            trail are preserved.
          </>
        }
      />
    </>
  )
}
