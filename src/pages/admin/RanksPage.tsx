import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Layers, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { errorMessage } from '@/lib/errors'
import {
  useCreateRank,
  useDeleteRank,
  usePositions,
  useRankPositions,
  useRanks,
  useSetRankPositions,
  useUpdateRank,
} from '@/features/config/hooks/useConfig'
import type { RankRow } from '@/types/database.types'
import { ADMIN_ROLES } from '@/utils/constants'

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'At least 2 characters')
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only'),
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  level: z.string(),
  sort_order: z.string(),
  is_active: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  code: '',
  name: '',
  description: '',
  level: '100',
  sort_order: '0',
  is_active: true,
}

function toCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export default function RanksPage() {
  const toast = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RankRow | null>(null)
  const [deleting, setDeleting] = useState<RankRow | null>(null)
  const [mapping, setMapping] = useState<RankRow | null>(null)
  // Null until the operator touches a checkbox; the saved mapping shows through
  // until then. Deriving rather than copying the fetched value into state means
  // no effect has to keep the two in sync.
  const [positionDraft, setPositionDraft] = useState<string[] | null>(null)

  const ranks = useRanks(true)
  const positions = usePositions(true)
  const rankPositions = useRankPositions(mapping?.id)

  const create = useCreateRank()
  const update = useUpdateRank()
  const remove = useDeleteRank()
  const setPositions = useSetRankPositions()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  const selectedPositions = positionDraft ?? rankPositions.data ?? []

  function togglerPosition(positionId: string, checked: boolean) {
    setPositionDraft(
      checked
        ? [...selectedPositions, positionId]
        : selectedPositions.filter((id) => id !== positionId),
    )
  }

  function openMapping(rank: RankRow) {
    setPositionDraft(null)
    setMapping(rank)
  }

  function openCreate() {
    form.reset(EMPTY)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(rank: RankRow) {
    form.reset({
      code: rank.code,
      name: rank.name,
      description: rank.description ?? '',
      level: String(rank.level),
      sort_order: String(rank.sort_order),
      is_active: rank.is_active,
    })
    setEditing(rank)
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      code: values.code.trim(),
      name: values.name.trim(),
      description: values.description?.trim() || null,
      level: Number(values.level) || 100,
      sort_order: Number(values.sort_order) || 0,
      is_active: values.is_active,
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload })
        toast.success('Rank updated', payload.name)
      } else {
        await create.mutateAsync(payload)
        toast.success('Rank created', payload.name)
      }
      setDialogOpen(false)
    } catch (error) {
      toast.error('Could not save rank', errorMessage(error))
    }
  }

  const columns: Column<RankRow>[] = [
    {
      key: 'rank',
      header: 'Rank',
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--app-text)]">{row.name}</span>
            {!row.is_active && (
              <Badge tone="neutral" size="sm">
                Inactive
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-[var(--app-text-subtle)]">
            {row.code}
          </p>
        </div>
      ),
    },
    {
      key: 'level',
      header: 'Seniority',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-[var(--app-text)]">
            {row.level}
          </span>
          <span className="text-xs text-[var(--app-text-subtle)]">
            {row.level <= 20 ? 'Senior' : row.level <= 40 ? 'Mid' : 'Junior'}
          </span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      secondary: true,
      render: (row) => (
        <span className="text-sm text-[var(--app-text-muted)]">
          {row.description ?? '—'}
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
              onClick={() => openMapping(row)}
              aria-label={`Set which positions ${row.name} applies to`}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
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
          <Layers
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-500"
            aria-hidden="true"
          />
          <p className="max-w-2xl text-sm text-[var(--app-text-muted)]">
            <strong>Seniority</strong> orders ranks, with 1 the most senior. Use
            the link button to restrict a rank to particular positions — a rank
            with no restriction is offered for every position.
          </p>
        </div>

        <Can roles={[...ADMIN_ROLES]}>
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New rank
          </Button>
        </Can>
      </div>

      <DataTable
        caption="Ranks"
        columns={columns}
        rows={ranks.data ?? []}
        rowKey={(row) => row.id}
        isLoading={ranks.isLoading}
        error={ranks.isError ? errorMessage(ranks.error) : null}
        onRetry={() => void ranks.refetch()}
        emptyTitle="No ranks configured"
        emptyDescription="Add ranks so personnel can be given a title on hire."
        emptyAction={
          <Can roles={[...ADMIN_ROLES]}>
            <Button size="sm" onClick={openCreate}>
              New rank
            </Button>
          </Can>
        }
      />

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New rank'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              isLoading={create.isPending || update.isPending}
            >
              {editing ? 'Save changes' : 'Create rank'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name?.message}>
              <Input
                {...form.register('name', {
                  onChange: (event) => {
                    if (!editing) form.setValue('code', toCode(event.target.value))
                  },
                })}
              />
            </Field>
            <Field label="Code" required error={errors.code?.message}>
              <Input className="font-mono" {...form.register('code')} />
            </Field>
          </div>

          <Field label="Description" error={errors.description?.message}>
            <Textarea rows={2} {...form.register('description')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Seniority level"
              required
              hint="1 is most senior; 999 the most junior"
              error={errors.level?.message}
            >
              <Input type="number" min={1} max={999} {...form.register('level')} />
            </Field>
            <Field
              label="Sort order"
              hint="Tie-break within the same level"
              error={errors.sort_order?.message}
            >
              <Input type="number" {...form.register('sort_order')} />
            </Field>
          </div>

          <Checkbox
            label="Active"
            description="Inactive ranks are hidden from pickers but keep their history."
            {...form.register('is_active')}
          />
        </form>
      </Modal>

      {/* Position mapping ------------------------------------------------- */}
      <Modal
        open={mapping !== null}
        onClose={() => setMapping(null)}
        title="Applies to positions"
        description={mapping?.name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMapping(null)}>
              Cancel
            </Button>
            <Button
              isLoading={setPositions.isPending}
              onClick={async () => {
                if (!mapping) return
                try {
                  await setPositions.mutateAsync({
                    rankId: mapping.id,
                    positionIds: selectedPositions,
                  })
                  toast.success('Mapping saved', mapping.name)
                  setMapping(null)
                } catch (error) {
                  toast.error('Could not save mapping', errorMessage(error))
                }
              }}
            >
              Save mapping
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--app-text-muted)]">
            Tick the positions this rank applies to. Leave every box clear to
            offer it for all positions.
          </p>

          {rankPositions.isLoading ? (
            <p className="text-sm text-[var(--app-text-subtle)]">Loading…</p>
          ) : (
            <div className="space-y-2">
              {(positions.data ?? []).map((position) => (
                <Checkbox
                  key={position.id}
                  label={position.name}
                  description={position.category ?? undefined}
                  checked={selectedPositions.includes(position.id)}
                  onChange={(event) =>
                    togglerPosition(position.id, event.target.checked)
                  }
                />
              ))}
            </div>
          )}

          {selectedPositions.length === 0 && (
            <p className="rounded-lg bg-[var(--app-bg)] p-3 text-xs text-[var(--app-text-muted)]">
              Nothing selected — this rank will be offered for every position.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            toast.success('Rank deleted', deleting.name)
            setDeleting(null)
          } catch (error) {
            toast.error('Could not delete rank', errorMessage(error))
          }
        }}
        title="Delete rank"
        tone="danger"
        confirmLabel="Delete"
        isLoading={remove.isPending}
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed permanently. Any
            personnel holding it will simply have no rank — their records are not
            deleted. Deactivate instead to retire it while keeping the history.
          </>
        }
      />
    </>
  )
}
