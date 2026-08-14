import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { BadgeCheck, Briefcase, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { errorMessage } from '@/lib/errors'
import {
  useCreatePosition,
  useDeletePosition,
  usePositions,
  useUpdatePosition,
} from '@/features/config/hooks/useConfig'
import { ADMIN_ROLES, TONE_OPTIONS } from '@/utils/constants'
import { formatCurrency } from '@/utils/format'
import type { PositionRow, ToneToken } from '@/types/database.types'

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'At least 2 characters')
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only'),
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  category: z.string().trim().max(60).optional().or(z.literal('')),
  min_age: z.string(),
  max_age: z.string().optional().or(z.literal('')),
  min_height_cm: z.string().optional().or(z.literal('')),
  min_years_experience: z.string(),
  requires_license: z.boolean(),
  default_daily_rate: z.string().optional().or(z.literal('')),
  tone: z.enum(['neutral', 'info', 'warning', 'success', 'danger', 'brand', 'laurel']),
  sort_order: z.string(),
  is_active: z.boolean(),
  is_public: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  code: '',
  name: '',
  description: '',
  category: '',
  min_age: '18',
  max_age: '',
  min_height_cm: '',
  min_years_experience: '0',
  requires_license: false,
  default_daily_rate: '',
  tone: 'brand',
  sort_order: '0',
  is_active: true,
  is_public: true,
}

/** Slugifies a name into the code shape the CHECK constraint requires. */
function toCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export default function PositionsPage() {
  const toast = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PositionRow | null>(null)
  const [deleting, setDeleting] = useState<PositionRow | null>(null)

  const positions = usePositions(true)
  const create = useCreatePosition()
  const update = useUpdatePosition()
  const remove = useDeletePosition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  function openCreate() {
    form.reset(EMPTY)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(position: PositionRow) {
    form.reset({
      code: position.code,
      name: position.name,
      description: position.description ?? '',
      category: position.category ?? '',
      min_age: String(position.min_age),
      max_age: position.max_age == null ? '' : String(position.max_age),
      min_height_cm:
        position.min_height_cm == null ? '' : String(position.min_height_cm),
      min_years_experience: String(position.min_years_experience),
      requires_license: position.requires_license,
      default_daily_rate:
        position.default_daily_rate == null ? '' : String(position.default_daily_rate),
      tone: position.tone,
      sort_order: String(position.sort_order),
      is_active: position.is_active,
      is_public: position.is_public,
    })
    setEditing(position)
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      code: values.code.trim(),
      name: values.name.trim(),
      description: values.description?.trim() || null,
      category: values.category?.trim() || null,
      min_age: Number(values.min_age) || 18,
      max_age: values.max_age ? Number(values.max_age) : null,
      min_height_cm: values.min_height_cm ? Number(values.min_height_cm) : null,
      min_years_experience: Number(values.min_years_experience) || 0,
      requires_license: values.requires_license,
      default_daily_rate: values.default_daily_rate
        ? Number(values.default_daily_rate)
        : null,
      tone: values.tone as ToneToken,
      sort_order: Number(values.sort_order) || 0,
      is_active: values.is_active,
      is_public: values.is_public,
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload })
        toast.success('Position updated', payload.name)
      } else {
        await create.mutateAsync(payload)
        toast.success('Position created', payload.name)
      }
      setDialogOpen(false)
    } catch (error) {
      toast.error('Could not save position', errorMessage(error))
    }
  }

  const columns: Column<PositionRow>[] = [
    {
      key: 'position',
      header: 'Position',
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={row.tone}>{row.name}</Badge>
            {!row.is_active && (
              <Badge tone="neutral" size="sm">
                Inactive
              </Badge>
            )}
            {row.is_active && !row.is_public && (
              <Badge tone="warning" size="sm">
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                Internal
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-[var(--app-text-subtle)]">
            {row.code}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      secondary: true,
      render: (row) => (
        <span className="text-sm text-[var(--app-text-muted)]">
          {row.category ?? '—'}
        </span>
      ),
    },
    {
      key: 'requirements',
      header: 'Requirements',
      render: (row) => (
        <div className="flex flex-wrap gap-1 text-xs">
          <Badge size="sm">Age {row.min_age}+</Badge>
          {row.min_years_experience > 0 && (
            <Badge size="sm">{row.min_years_experience}y exp</Badge>
          )}
          {row.min_height_cm && <Badge size="sm">{row.min_height_cm} cm</Badge>}
          {row.requires_license && (
            <Badge size="sm" tone="info">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
              Licensed
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Default rate',
      secondary: true,
      render: (row) => (
        <span className="text-sm tabular-nums text-[var(--app-text-muted)]">
          {row.default_daily_rate == null
            ? '—'
            : `${formatCurrency(row.default_daily_rate)}/day`}
        </span>
      ),
    },
    {
      key: 'order',
      header: 'Order',
      secondary: true,
      render: (row) => (
        <span className="text-sm tabular-nums text-[var(--app-text-subtle)]">
          {row.sort_order}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (row) => (
        <Can roles={[...ADMIN_ROLES]}>
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openEdit(row)}
              aria-label={`Edit ${row.name}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleting(row)}
              aria-label={`Delete ${row.name}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
            </Button>
          </div>
        </Can>
      ),
    },
  ]

  const errors = form.formState.errors

  return (
    <>
      {/* The Data Configuration hub owns the page header; this section owns
          its own toolbar. */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Briefcase
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-500"
            aria-hidden="true"
          />
          <p className="max-w-2xl text-sm text-[var(--app-text-muted)]">
            A position marked <strong>public</strong> appears on the application
            form. Marking one <strong>inactive</strong> hides it everywhere
            without touching the applicants and personnel already assigned to it
            — which is why deleting a position in use is refused.
          </p>
        </div>

        <Can roles={[...ADMIN_ROLES]}>
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New position
          </Button>
        </Can>
      </div>

      <DataTable
        caption="Positions"
        columns={columns}
        rows={positions.data ?? []}
        rowKey={(row) => row.id}
        isLoading={positions.isLoading}
        error={positions.isError ? errorMessage(positions.error) : null}
        onRetry={() => void positions.refetch()}
        emptyTitle="No positions configured"
        emptyDescription="Add the first position so applicants have something to apply for."
        emptyAction={
          <Can roles={[...ADMIN_ROLES]}>
            <Button size="sm" onClick={openCreate}>
              New position
            </Button>
          </Can>
        }
      />

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New position'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              isLoading={create.isPending || update.isPending}
            >
              {editing ? 'Save changes' : 'Create position'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name?.message}>
              <Input
                {...form.register('name', {
                  // Derive the code from the name while creating; never rewrite
                  // an existing code, since rows already reference it.
                  onChange: (event) => {
                    if (!editing) {
                      form.setValue('code', toCode(event.target.value))
                    }
                  },
                })}
              />
            </Field>
            <Field
              label="Code"
              required
              hint={editing ? 'Changing this can break saved reports' : 'Generated from the name'}
              error={errors.code?.message}
            >
              <Input className="font-mono" {...form.register('code')} />
            </Field>
          </div>

          <Field label="Description" error={errors.description?.message}>
            <Textarea rows={2} {...form.register('description')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Category"
              hint="e.g. Guarding"
              error={errors.category?.message}
            >
              <Input {...form.register('category')} />
            </Field>
            <Field label="Badge colour" error={errors.tone?.message}>
              <Select
                options={TONE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
                {...form.register('tone')}
              />
            </Field>
            <Field
              label="Sort order"
              hint="Lower shows first"
              error={errors.sort_order?.message}
            >
              <Input type="number" {...form.register('sort_order')} />
            </Field>
          </div>

          <fieldset className="border-t border-[var(--app-border)] pt-4">
            <legend className="text-sm font-semibold text-[var(--app-text)]">
              Eligibility
            </legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-4">
              <Field
                label="Min age"
                required
                hint="18 or above"
                error={errors.min_age?.message}
              >
                <Input type="number" min={18} max={70} {...form.register('min_age')} />
              </Field>
              <Field label="Max age" error={errors.max_age?.message}>
                <Input type="number" min={18} max={70} {...form.register('max_age')} />
              </Field>
              <Field label="Min height (cm)" error={errors.min_height_cm?.message}>
                <Input type="number" min={100} max={250} {...form.register('min_height_cm')} />
              </Field>
              <Field
                label="Min experience (yrs)"
                error={errors.min_years_experience?.message}
              >
                <Input
                  type="number"
                  min={0}
                  max={60}
                  {...form.register('min_years_experience')}
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Default daily rate (₱)" error={errors.default_daily_rate?.message}>
                <Input
                  type="number"
                  min={0}
                  step={10}
                  {...form.register('default_daily_rate')}
                />
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox
                  label="Requires a security licence"
                  description="LESP / SOSIA licence must be held"
                  {...form.register('requires_license')}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-[var(--app-border)] pt-4">
            <legend className="text-sm font-semibold text-[var(--app-text)]">
              Visibility
            </legend>
            <Checkbox
              label="Active"
              description="Inactive positions are hidden everywhere but keep their history."
              {...form.register('is_active')}
            />
            <Checkbox
              label="Show on the public application form"
              description="Untick for internal-only posts that staff assign directly."
              {...form.register('is_public')}
            />
          </fieldset>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            toast.success('Position deleted', deleting.name)
            setDeleting(null)
          } catch (error) {
            toast.error('Could not delete position', errorMessage(error))
          }
        }}
        title="Delete position"
        tone="danger"
        confirmLabel="Delete"
        isLoading={remove.isPending}
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed permanently. If any
            applicant or personnel record still uses it the database will refuse
            — deactivate it instead to retire it while keeping the history.
          </>
        }
      />
    </>
  )
}
