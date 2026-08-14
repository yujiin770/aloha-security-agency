import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Info, KeyRound, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { errorMessage } from '@/lib/errors'
import {
  useCreateRole,
  useDeleteRole,
  useRolePermissions,
  useRoles,
  useTogglePermission,
  useUpdateRole,
} from '@/features/config/hooks/useConfig'
import { useAuth } from '@/contexts/AuthContext'
import { PAGES } from '@/utils/pages'
import { cn } from '@/utils/cn'
import type { AppRole, RoleRow } from '@/types/database.types'
import { ADMIN_ROLES } from '@/utils/constants'

/**
 * Roles, and which pages each one opens.
 *
 * Two separate things are configured here and it is worth keeping them apart:
 *
 *   Page access — the checkboxes. Freely editable, and genuinely enforced: the
 *   sidebar and the route guards read these grants live.
 *
 *   Database access — `inherits_from`. RLS is written against the seven
 *   built-in roles, so a new role carries the privileges of whichever one it
 *   names. Ticking a page does not widen what the database will return, and it
 *   was never meant to.
 */

/** The built-ins a custom role may borrow its database privileges from. */
const BASE_ROLES: { value: AppRole; label: string; blurb: string }[] = [
  { value: 'owner', label: 'Owner', blurb: 'Everything, including minting other owners.' },
  { value: 'admin', label: 'Administrator', blurb: 'Full read and write across the system.' },
  {
    value: 'system_administrator',
    label: 'System Administrator',
    blurb: 'Equivalent to Administrator, except granting the Owner role.',
  },
  {
    value: 'hr_staff',
    label: 'HR Staff',
    blurb: 'Read and write applicants, personnel and deployments.',
  },
  {
    value: 'recruitment_officer',
    label: 'Recruitment Officer',
    blurb: 'Read and write applicants; read personnel.',
  },
  {
    value: 'deployment_officer',
    label: 'Deployment Officer',
    blurb: 'Read and write deployments and facilities.',
  },
  {
    value: 'branch_coordinator',
    label: 'Branch Coordinator',
    blurb: 'Read and write limited to their own assigned facility.',
  },
]

const editSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60),
  description: z.string().trim().max(400).optional().or(z.literal('')),
  rank: z.string(),
  is_assignable: z.boolean(),
})

const createSchema = editSchema.extend({
  key: z
    .string()
    .trim()
    .min(2, 'Key is required')
    .max(40)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Lowercase letters, digits and underscores only, starting with a letter.',
    ),
  inherits_from: z.string().min(1, 'Choose the access this role is based on'),
})

type EditValues = z.infer<typeof editSchema>
type CreateValues = z.infer<typeof createSchema>

/** `Recruitment Lead` → `recruitment_lead`. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export default function RolesPage() {
  const toast = useToast()
  const { hasRole } = useAuth()
  const canEdit = hasRole(...ADMIN_ROLES)

  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<RoleRow | null>(null)
  /** Keyed `roleKey:permissionKey` so one pending cell doesn't freeze the rest. */
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())

  const roles = useRoles()
  const rolePermissions = useRolePermissions()
  const updateRole = useUpdateRole()
  const createRole = useCreateRole()
  const deleteRole = useDeleteRole()
  const togglePermission = useTogglePermission()

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { label: '', description: '', rank: '50', is_assignable: true },
  })

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      key: '',
      label: '',
      description: '',
      rank: '50',
      is_assignable: true,
      inherits_from: 'hr_staff',
    },
  })

  const selectedBase = useWatch({
    control: createForm.control,
    name: 'inherits_from',
  })

  const closeEdit = useCallback(() => setEditing(null), [])
  const closeCreate = useCallback(() => setCreating(false), [])
  const closeDelete = useCallback(() => setDeleting(null), [])

  function openEdit(role: RoleRow) {
    editForm.reset({
      label: role.label,
      description: role.description,
      rank: String(role.rank),
      is_assignable: role.is_assignable,
    })
    setEditing(role)
  }

  function openCreate() {
    createForm.reset({
      key: '',
      label: '',
      description: '',
      rank: '50',
      is_assignable: true,
      inherits_from: 'hr_staff',
    })
    setCreating(true)
  }

  async function onEditSubmit(values: EditValues) {
    if (!editing) return
    try {
      await updateRole.mutateAsync({
        key: editing.key,
        patch: {
          label: values.label.trim(),
          description: values.description?.trim() ?? '',
          rank: Number(values.rank) || 50,
          is_assignable: values.is_assignable,
        },
      })
      toast.success('Role updated', values.label)
      setEditing(null)
    } catch (error) {
      toast.error('Could not save role', errorMessage(error))
    }
  }

  async function onCreateSubmit(values: CreateValues) {
    const key = values.key.trim() || slugify(values.label)
    try {
      await createRole.mutateAsync({
        key,
        label: values.label.trim(),
        description: values.description?.trim() ?? '',
        rank: Number(values.rank) || 50,
        is_assignable: values.is_assignable,
        inherits_from: values.inherits_from as AppRole,
      })
      toast.success(
        'Role created',
        `${values.label} has no pages yet — tick the ones it should open.`,
      )
      setCreating(false)
    } catch (error) {
      toast.error('Could not create role', errorMessage(error))
    }
  }

  async function onDelete() {
    if (!deleting) return
    try {
      await deleteRole.mutateAsync(deleting.key)
      toast.success('Role deleted', deleting.label)
      setDeleting(null)
    } catch (error) {
      // The FK is `on delete restrict`, so this is usually "someone still holds it".
      toast.error('Could not delete role', errorMessage(error))
    }
  }

  async function toggle(roleKey: string, permissionKey: string, granted: boolean) {
    const cell = `${roleKey}:${permissionKey}`
    setPendingCells((current) => new Set(current).add(cell))
    try {
      await togglePermission.mutateAsync({
        roleKey,
        permissionKey,
        grant: !granted,
      })
    } catch (error) {
      toast.error('Could not update permission', errorMessage(error))
    } finally {
      setPendingCells((current) => {
        const next = new Set(current)
        next.delete(cell)
        return next
      })
    }
  }

  const isLoading = roles.isLoading || rolePermissions.isLoading
  const error = roles.error ?? rolePermissions.error

  if (error) {
    return (
      <Card>
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => {
            void roles.refetch()
            void rolePermissions.refetch()
          }}
        />
      </Card>
    )
  }

  const roleList = roles.data ?? []

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-500"
            aria-hidden="true"
          />
          <p className="max-w-3xl text-sm text-[var(--app-text-muted)]">
            Role definitions and the pages each one can open. Assigning a role to a
            person is done on{' '}
            <Link
              to="/admin/users"
              className="font-medium text-brand-600 hover:underline"
            >
              Users &amp; Roles
            </Link>
            .
          </p>
        </div>

        <Can roles={[...ADMIN_ROLES]}>
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add role
          </Button>
        </Can>
      </div>

      {/* Role definitions --------------------------------------------------- */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roleList.map((role) => {
            const granted = rolePermissions.data?.[role.key] ?? []
            const base = BASE_ROLES.find((b) => b.value === role.inherits_from)
            return (
              <li key={role.key}>
                <Card className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-[var(--app-text)]">
                          {role.label}
                        </h3>
                        <Badge
                          size="sm"
                          tone={
                            role.rank <= 1 ? 'brand' : role.rank <= 2 ? 'info' : 'neutral'
                          }
                        >
                          Rank {role.rank}
                        </Badge>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-[var(--app-text-subtle)]">
                        {role.key}
                      </p>
                    </div>

                    <Can roles={[...ADMIN_ROLES]}>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(role)}
                          aria-label={`Edit ${role.label}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        {!role.is_system && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleting(role)}
                            aria-label={`Delete ${role.label}`}
                          >
                            <Trash2
                              className="h-3.5 w-3.5 text-danger"
                              aria-hidden="true"
                            />
                          </Button>
                        )}
                      </div>
                    </Can>
                  </div>

                  <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                    {role.description}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--app-border)] pt-3">
                    <Badge size="sm" tone="laurel">
                      <KeyRound className="h-3 w-3" aria-hidden="true" />
                      {granted.length} page{granted.length === 1 ? '' : 's'}
                    </Badge>
                    {role.is_system ? (
                      <Badge size="sm" tone="neutral">
                        Built-in
                      </Badge>
                    ) : (
                      base && (
                        <Badge size="sm" tone="info">
                          Access of {base.label}
                        </Badge>
                      )
                    )}
                    {!role.is_assignable && (
                      <Badge size="sm" tone="warning">
                        Not assignable
                      </Badge>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {/* Page access -------------------------------------------------------- */}
      <Card padded={false} className="mt-6">
        <div className="border-b border-[var(--app-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--app-text)]">Page access</h2>
          <p className="mt-0.5 text-sm text-[var(--app-text-muted)]">
            {canEdit
              ? 'Tick the pages each role can open. Changes take effect the next time that person signs in or reloads.'
              : 'Read-only for your role.'}
          </p>
        </div>

        <div className="flex items-start gap-3 border-b border-[var(--app-border)] bg-info-soft px-5 py-3 dark:bg-info/10">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p className="text-xs text-[var(--app-text-muted)]">
            These boxes control which pages appear and which addresses open. What a
            role can read or write once inside a page is decided by Row Level
            Security in the database, which follows the role's underlying access —
            shown on each card above.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="table-sticky w-full border-collapse text-sm">
              <caption className="sr-only">Pages each role can open</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 min-w-[18rem] bg-[var(--app-surface)] px-4 py-3 text-left text-xs font-semibold text-[var(--app-text-muted)] uppercase"
                  >
                    Page
                  </th>
                  {roleList.map((role) => (
                    <th
                      key={role.key}
                      scope="col"
                      className="px-3 py-3 text-center text-xs font-semibold text-[var(--app-text-muted)]"
                    >
                      <span className="block max-w-[7rem] truncate" title={role.label}>
                        {role.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {PAGES.map((page) => (
                  <tr key={page.key} className="border-t border-[var(--app-border)]">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-[var(--app-surface)] px-4 py-2.5 text-left font-normal"
                    >
                      <span className="block text-sm font-medium text-[var(--app-text)]">
                        {page.label}
                      </span>
                      <span className="block text-xs text-[var(--app-text-subtle)]">
                        {page.description}
                      </span>
                    </th>

                    {roleList.map((role) => {
                      const granted = (rolePermissions.data?.[role.key] ?? []).includes(
                        page.key,
                      )
                      const cell = `${role.key}:${page.key}`
                      const busy = pendingCells.has(cell)
                      // Dashboard and Settings stay on for everyone: a user with
                      // no landing page has nowhere to go after signing in.
                      const locked = page.alwaysGranted

                      return (
                        <td key={role.key} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={granted}
                            disabled={!canEdit || busy || locked}
                            onChange={() => void toggle(role.key, page.key, granted)}
                            aria-label={`${granted ? 'Revoke' : 'Grant'} ${page.label} for ${role.label}`}
                            title={
                              locked
                                ? 'Every role needs this page'
                                : `${granted ? 'Revoke' : 'Grant'} ${page.label}`
                            }
                            className={cn(
                              'h-4 w-4 rounded border-[var(--app-border)] text-brand-500',
                              'focus:ring-2 focus:ring-brand-500 focus:ring-offset-1',
                              busy && 'opacity-50',
                              (locked || !canEdit) && 'cursor-not-allowed',
                            )}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit role ---------------------------------------------------------- */}
      <Modal
        open={editing !== null}
        onClose={closeEdit}
        title={`Edit ${editing?.label ?? 'role'}`}
        description={editing?.key}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              onClick={editForm.handleSubmit(onEditSubmit)}
              isLoading={updateRole.isPending}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form className="space-y-4" noValidate>
          <p className="rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
            A role's key is referenced by every grant already made, so it cannot be
            changed after creation. Page access is edited from the table behind
            this dialog.
          </p>

          <Field label="Label" required error={editForm.formState.errors.label?.message}>
            <Input {...editForm.register('label')} />
          </Field>

          <Field
            label="Description"
            error={editForm.formState.errors.description?.message}
          >
            <Textarea rows={3} {...editForm.register('description')} />
          </Field>

          <Field
            label="Rank"
            required
            hint="Lower is more authority. Used for ordering and for limiting who may assign whom."
            error={editForm.formState.errors.rank?.message}
          >
            <Input type="number" min={1} max={99} {...editForm.register('rank')} />
          </Field>

          <Checkbox
            label="Assignable to users"
            description="Untick to retire a role without removing it from anyone who already holds it."
            {...editForm.register('is_assignable')}
          />
        </form>
      </Modal>

      {/* Create role -------------------------------------------------------- */}
      <Modal
        open={creating}
        onClose={closeCreate}
        title="Add role"
        description="A new role starts with no pages. Tick them on the table afterwards."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              onClick={createForm.handleSubmit(onCreateSubmit)}
              isLoading={createRole.isPending}
            >
              Create role
            </Button>
          </>
        }
      >
        <form className="space-y-4" noValidate>
          <Field
            label="Label"
            required
            hint="How the role appears throughout the app."
            error={createForm.formState.errors.label?.message}
          >
            <Input
              {...createForm.register('label', {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  // Keep the key in step with the label until it is edited by hand.
                  if (!createForm.formState.dirtyFields.key) {
                    createForm.setValue('key', slugify(e.target.value))
                  }
                },
              })}
              placeholder="Recruitment Lead"
            />
          </Field>

          <Field
            label="Key"
            required
            hint="Permanent identifier. Lowercase, no spaces."
            error={createForm.formState.errors.key?.message}
          >
            <Input {...createForm.register('key')} placeholder="recruitment_lead" />
          </Field>

          <Field
            label="Database access based on"
            required
            hint="Row Level Security is written against the built-in roles. This role will read and write exactly what the one you pick can."
            error={createForm.formState.errors.inherits_from?.message}
          >
            <Select
              {...createForm.register('inherits_from')}
              options={BASE_ROLES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>

          <p className="rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
            {BASE_ROLES.find((r) => r.value === selectedBase)?.blurb ?? ''} Which
            pages this role can open is a separate, freely editable setting.
          </p>

          <Field
            label="Description"
            error={createForm.formState.errors.description?.message}
          >
            <Textarea rows={2} {...createForm.register('description')} />
          </Field>

          <Field
            label="Rank"
            required
            hint="Lower is more authority."
            error={createForm.formState.errors.rank?.message}
          >
            <Input type="number" min={1} max={99} {...createForm.register('rank')} />
          </Field>

          <Checkbox
            label="Assignable to users"
            {...createForm.register('is_assignable')}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={closeDelete}
        onConfirm={() => void onDelete()}
        title={`Delete ${deleting?.label ?? 'role'}?`}
        message="This cannot be undone. If anyone still holds this role, the database will refuse rather than silently removing their access — revoke it from them first."
        confirmLabel="Delete role"
        tone="danger"
        isLoading={deleteRole.isPending}
      />
    </>
  )
}
