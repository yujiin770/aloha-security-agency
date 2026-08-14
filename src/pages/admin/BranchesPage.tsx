import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Building2, Pencil, Plus, PowerOff, Power } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  createBranch,
  listBranchStaffing,
  listBranches,
  setBranchActive,
  updateBranch,
  type BranchInput,
} from '@/features/branches/api/branchesApi'
import { listUsers } from '@/features/users/api/usersApi'
import { formatPercent } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { BranchRow } from '@/types/database.types'
import { ADMIN_ROLES } from '@/utils/constants'

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'At least 2 characters')
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Capital letters, digits and hyphens only'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  address_line: z.string().trim().max(200).optional().or(z.literal('')),
  barangay: z.string().trim().max(100).optional().or(z.literal('')),
  city_municipality: z.string().trim().min(1, 'City or municipality is required'),
  province: z.string().trim().max(100).optional().or(z.literal('')),
  region: z.string().trim().max(100).optional().or(z.literal('')),
  postal_code: z.string().trim().max(10).optional().or(z.literal('')),
  contact_person: z.string().trim().max(120).optional().or(z.literal('')),
  contact_phone: z.string().trim().max(20).optional().or(z.literal('')),
  contact_email: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .optional()
    .or(z.literal('')),
  coordinator_id: z.string().optional().or(z.literal('')),
  required_headcount: z.string(),
  is_active: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  code: '',
  name: '',
  description: '',
  address_line: '',
  barangay: '',
  city_municipality: '',
  province: '',
  region: '',
  postal_code: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  coordinator_id: '',
  required_headcount: '0',
  is_active: true,
}

export default function BranchesPage() {
  const toast = useToast()
  const qc = useQueryClient()

  const [editing, setEditing] = useState<BranchRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<BranchRow | null>(null)

  const branches = useQuery({
    queryKey: queryKeys.branches.list({ all: true }),
    queryFn: () => listBranches(true),
  })

  const staffing = useQuery({
    queryKey: queryKeys.branches.staffing(),
    queryFn: listBranchStaffing,
  })

  const coordinators = useQuery({
    queryKey: queryKeys.users.list({ active: true }),
    queryFn: () => listUsers(false),
    staleTime: 5 * 60_000,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: BranchInput = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        description: values.description?.trim() || null,
        address_line: values.address_line?.trim() || null,
        barangay: values.barangay?.trim() || null,
        city_municipality: values.city_municipality.trim(),
        province: values.province?.trim() || null,
        region: values.region?.trim() || null,
        postal_code: values.postal_code?.trim() || null,
        contact_person: values.contact_person?.trim() || null,
        contact_phone: values.contact_phone?.trim() || null,
        contact_email: values.contact_email?.trim() || null,
        coordinator_id: values.coordinator_id || null,
        required_headcount: Number(values.required_headcount) || 0,
        is_active: values.is_active,
      }
      return editing ? updateBranch(editing.id, payload) : createBranch(payload)
    },
    onSuccess: (branch) => {
      toast.success(editing ? 'Branch updated' : 'Branch created', branch.name)
      closeDialog()
      void qc.invalidateQueries({ queryKey: queryKeys.branches.all })
    },
    onError: (error) => toast.error('Could not save branch', errorMessage(error)),
  })

  const toggleActive = useMutation({
    mutationFn: (branch: BranchRow) => setBranchActive(branch.id, !branch.is_active),
    onSuccess: () => {
      toast.success('Branch updated')
      setToggling(null)
      void qc.invalidateQueries({ queryKey: queryKeys.branches.all })
    },
    onError: (error) => toast.error('Could not update branch', errorMessage(error)),
  })

  function openCreate() {
    form.reset(EMPTY)
    setEditing(null)
    setCreating(true)
  }

  function openEdit(branch: BranchRow) {
    form.reset({
      code: branch.code,
      name: branch.name,
      description: branch.description ?? '',
      address_line: branch.address_line ?? '',
      barangay: branch.barangay ?? '',
      city_municipality: branch.city_municipality,
      province: branch.province ?? '',
      region: branch.region ?? '',
      postal_code: branch.postal_code ?? '',
      contact_person: branch.contact_person ?? '',
      contact_phone: branch.contact_phone ?? '',
      contact_email: branch.contact_email ?? '',
      coordinator_id: branch.coordinator_id ?? '',
      required_headcount: String(branch.required_headcount),
      is_active: branch.is_active,
    })
    setEditing(branch)
    setCreating(true)
  }

  function closeDialog() {
    setCreating(false)
    setEditing(null)
  }

  const staffingFor = (branchId: string) =>
    staffing.data?.find((s) => s.branch_id === branchId)

  const errors = form.formState.errors

  return (
    <>
      <PageHeader
        title="Facilities"
        description="Client posts and detachments where personnel are deployed."
        actions={
          <Can roles={[...ADMIN_ROLES]}>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              New facility
            </Button>
          </Can>
        }
      />

      {branches.isError ? (
        <Card>
          <ErrorState
            message={errorMessage(branches.error)}
            onRetry={() => void branches.refetch()}
          />
        </Card>
      ) : branches.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (branches.data?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            title="No Facilities yet"
            description="Add your first client post so personnel can be deployed to it."
            icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
            action={
              <Can roles={[...ADMIN_ROLES]}>
                <Button size="sm" onClick={openCreate}>
                  New facilities
                </Button>
              </Can>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branches.data!.map((branch) => {
            const stats = staffingFor(branch.id)
            const fill = stats?.fill_rate_pct ?? 0
            return (
              <li key={branch.id}>
                <Card className={cn('h-full', !branch.is_active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-[var(--app-text-subtle)]">
                        {branch.code}
                      </p>
                      <h2 className="truncate text-base font-semibold text-[var(--app-text)]">
                        {branch.name}
                      </h2>
                      <p className="truncate text-sm text-[var(--app-text-muted)]">
                        {[branch.city_municipality, branch.province]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                    <Badge tone={branch.is_active ? 'success' : 'neutral'} size="sm" dot>
                      {branch.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-[var(--app-text-muted)]">Staffing</span>
                      <span className="tabular-nums text-[var(--app-text)]">
                        {stats?.deployed_count ?? 0}/{branch.required_headcount}
                        <span className="ml-1.5 text-xs text-[var(--app-text-subtle)]">
                          {formatPercent(stats?.fill_rate_pct)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          fill >= 100
                            ? 'bg-success'
                            : fill >= 70
                              ? 'bg-warning'
                              : 'bg-danger',
                        )}
                        style={{ width: `${Math.min(fill, 100)}%` }}
                      />
                    </div>
                    {(stats?.vacancy_count ?? 0) > 0 && (
                      <p className="mt-1.5 text-xs font-medium text-warning">
                        {stats!.vacancy_count} post(s) unfilled
                      </p>
                    )}
                  </div>

                  <dl className="mt-4 space-y-1 border-t border-[var(--app-border)] pt-3 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--app-text-subtle)]">Coordinator</dt>
                      <dd className="truncate text-[var(--app-text)]">
                        {stats?.coordinator_name ?? 'Unassigned'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--app-text-subtle)]">Contact</dt>
                      <dd className="truncate text-[var(--app-text)]">
                        {branch.contact_person ?? '—'}
                      </dd>
                    </div>
                  </dl>

                  <Can roles={[...ADMIN_ROLES, 'deployment_officer']}>
                    <div className="mt-4 flex gap-2 border-t border-[var(--app-border)] pt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => openEdit(branch)}
                      >
                        Edit
                      </Button>
                      <Can roles={[...ADMIN_ROLES]}>
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={
                            branch.is_active ? (
                              <PowerOff className="h-3.5 w-3.5" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )
                          }
                          onClick={() => setToggling(branch)}
                        >
                          {branch.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </Can>
                    </div>
                  </Can>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {/* Create / edit ---------------------------------------------------- */}
      <Modal
        open={creating}
        onClose={closeDialog}
        title={editing ? `Edit ${editing.name}` : 'New facility'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit((values) => save.mutate(values))}
              isLoading={save.isPending}
            >
              {editing ? 'Save changes' : 'Create branch'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Code"
              required
              hint="e.g. MKT-01"
              error={errors.code?.message}
            >
              <Input className="font-mono uppercase" {...form.register('code')} />
            </Field>
            <Field
              label="Facility name"
              required
              className="sm:col-span-2"
              error={errors.name?.message}
            >
              <Input {...form.register('name')} />
            </Field>
          </div>

          <Field label="Description" error={errors.description?.message}>
            <Textarea rows={2} {...form.register('description')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" error={errors.address_line?.message}>
              <Input {...form.register('address_line')} />
            </Field>
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
              <Input {...form.register('region')} />
            </Field>
            <Field label="Postal code" error={errors.postal_code?.message}>
              <Input {...form.register('postal_code')} />
            </Field>
          </div>

          <div className="grid gap-4 border-t border-[var(--app-border)] pt-4 sm:grid-cols-3">
            <Field label="Contact person" error={errors.contact_person?.message}>
              <Input {...form.register('contact_person')} />
            </Field>
            <Field label="Contact phone" error={errors.contact_phone?.message}>
              <Input {...form.register('contact_phone')} />
            </Field>
            <Field label="Contact email" error={errors.contact_email?.message}>
              <Input type="email" {...form.register('contact_email')} />
            </Field>
          </div>

          <div className="grid gap-4 border-t border-[var(--app-border)] pt-4 sm:grid-cols-2">
            <Field
              label="Branch coordinator"
              hint="Grants this user read access to the branch."
              error={errors.coordinator_id?.message}
            >
              <Select
                placeholder="Unassigned"
                options={(coordinators.data ?? []).map((u) => ({
                  value: u.id,
                  label: u.full_name || u.email,
                }))}
                {...form.register('coordinator_id')}
              />
            </Field>
            <Field
              label="Required headcount"
              hint="Drives the staffing gap report."
              error={errors.required_headcount?.message}
            >
              <Input type="number" min={0} {...form.register('required_headcount')} />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        onConfirm={() => toggling && toggleActive.mutate(toggling)}
        title={toggling?.is_active ? 'Deactivate facility' : 'Activate facility'}
        tone={toggling?.is_active ? 'danger' : 'primary'}
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Activate'}
        isLoading={toggleActive.isPending}
        message={
          toggling?.is_active ? (
            <>
              <strong>{toggling.name}</strong> will be hidden from new deployment
              assignments and excluded from staffing reports. Existing
              deployments are not affected.
            </>
          ) : (
            <>
              <strong>{toggling?.name}</strong> will become available for new
              deployments again.
            </>
          )
        }
      />
    </>
  )
}
