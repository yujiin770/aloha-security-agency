import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Award, Pencil, ShieldAlert, Trash2 } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { errorMessage } from '@/lib/errors'
import { ImageUploader } from '@/features/cms/components/ImageUploader'
import { mediaUrl } from '@/features/cms/api/cmsApi'
import {
  useAccreditations,
  useCreateAccreditation,
  useDeleteAccreditation,
  useUpdateAccreditation,
} from '@/features/cms/hooks/useCms'
import { ADMIN_ROLES } from '@/utils/constants'
import { formatDate } from '@/utils/format'
import type { AccreditationRow } from '@/types/database.types'
import { ContentToolbar } from './components/ContentToolbar'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  issuer: z.string().trim().max(120).optional().or(z.literal('')),
  reference_no: z.string().trim().max(80).optional().or(z.literal('')),
  valid_until: z.string().optional().or(z.literal('')),
  description: z.string().trim().max(400).optional().or(z.literal('')),
  sort_order: z.string(),
  is_published: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  name: '',
  issuer: '',
  reference_no: '',
  valid_until: '',
  description: '',
  sort_order: '0',
  is_published: false,
}

/** Expiry inside 90 days is worth flagging — a lapsed licence on a public page
 *  is a compliance problem, not a cosmetic one. */
function isExpiringSoon(validUntil: string | null): boolean {
  if (!validUntil) return false
  const date = new Date(validUntil)
  const threshold = new Date()
  threshold.setDate(threshold.getDate() + 90)
  return date <= threshold
}

export default function AccreditationsPage() {
  const toast = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AccreditationRow | null>(null)
  const [deleting, setDeleting] = useState<AccreditationRow | null>(null)
  const [logo, setLogo] = useState<string | null>(null)

  const accreditations = useAccreditations(false)
  const create = useCreateAccreditation()
  const update = useUpdateAccreditation()
  const remove = useDeleteAccreditation()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  function openCreate() {
    form.reset(EMPTY)
    setLogo(null)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(row: AccreditationRow) {
    form.reset({
      name: row.name,
      issuer: row.issuer ?? '',
      reference_no: row.reference_no ?? '',
      valid_until: row.valid_until ?? '',
      description: row.description ?? '',
      sort_order: String(row.sort_order),
      is_published: row.is_published,
    })
    setLogo(row.logo_path)
    setEditing(row)
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name.trim(),
      issuer: values.issuer?.trim() || null,
      reference_no: values.reference_no?.trim() || null,
      valid_until: values.valid_until || null,
      description: values.description?.trim() || null,
      logo_path: logo,
      sort_order: Number(values.sort_order) || 0,
      is_published: values.is_published,
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload })
        toast.success('Accreditation updated', payload.name)
      } else {
        await create.mutateAsync(payload)
        toast.success('Accreditation added', payload.name)
      }
      setDialogOpen(false)
    } catch (error) {
      toast.error('Could not save accreditation', errorMessage(error))
    }
  }

  const columns: Column<AccreditationRow>[] = [
    {
      key: 'credential',
      header: 'Credential',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-white">
            {row.logo_path ? (
              <img
                src={mediaUrl(row.logo_path) ?? ''}
                alt=""
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <Award
                className="h-4 w-4 text-[var(--app-text-subtle)]"
                aria-hidden="true"
              />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--app-text)]">{row.name}</p>
            <p className="truncate text-xs text-[var(--app-text-subtle)]">
              {row.issuer ?? '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      secondary: true,
      render: (row) => (
        <span className="font-mono text-xs text-[var(--app-text-muted)]">
          {row.reference_no ?? '—'}
        </span>
      ),
    },
    {
      key: 'valid',
      header: 'Valid until',
      render: (row) =>
        row.valid_until ? (
          <span
            className={
              isExpiringSoon(row.valid_until)
                ? 'flex items-center gap-1.5 text-sm font-medium text-warning'
                : 'text-sm text-[var(--app-text-muted)]'
            }
          >
            {isExpiringSoon(row.valid_until) && (
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {formatDate(row.valid_until)}
          </span>
        ) : (
          <span className="text-sm text-[var(--app-text-subtle)]">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.is_published ? 'success' : 'neutral'} size="sm" dot>
          {row.is_published ? 'Live' : 'Draft'}
        </Badge>
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
      <ContentToolbar
        icon={Award}
        blurb={
          <>
            Licences, registrations and memberships — PNP-SOSIA, DOLE, SEC/DTI,
            PADPAO. Publish only credentials the agency actually holds; an
            unearned one is a serious claim to make in public.
          </>
        }
        createLabel="Add accreditation"
        onCreate={openCreate}
      />

      <DataTable
        caption="Accreditations"
        columns={columns}
        rows={accreditations.data ?? []}
        rowKey={(row) => row.id}
        isLoading={accreditations.isLoading}
        error={accreditations.isError ? errorMessage(accreditations.error) : null}
        onRetry={() => void accreditations.refetch()}
        emptyTitle="No accreditations yet"
        emptyDescription="Add your licences and registrations to replace the placeholder on the landing page."
        emptyAction={
          <Can roles={[...ADMIN_ROLES]}>
            <Button size="sm" onClick={openCreate}>
              Add accreditation
            </Button>
          </Can>
        }
      />

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add accreditation'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              isLoading={create.isPending || update.isPending}
            >
              {editing ? 'Save changes' : 'Add accreditation'}
            </Button>
          </>
        }
      >
        <form className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              required
              hint="e.g. PNP-SOSIA Licence to Operate"
              error={errors.name?.message}
            >
              <Input {...form.register('name')} />
            </Field>
            <Field
              label="Issued by"
              hint="e.g. PNP-SOSIA"
              error={errors.issuer?.message}
            >
              <Input {...form.register('issuer')} />
            </Field>
            <Field
              label="Reference number"
              error={errors.reference_no?.message}
            >
              <Input className="font-mono" {...form.register('reference_no')} />
            </Field>
            <Field
              label="Valid until"
              hint="Flagged 90 days before expiry"
              error={errors.valid_until?.message}
            >
              <Input type="date" {...form.register('valid_until')} />
            </Field>
          </div>

          <Field label="Description" error={errors.description?.message}>
            <Textarea rows={2} {...form.register('description')} />
          </Field>

          <ImageUploader
            label="Logo or seal"
            hint="Optional"
            folder="accreditations"
            aspect="square"
            value={logo}
            onChange={setLogo}
            className="max-w-[12rem]"
          />

          <div className="grid gap-4 border-t border-[var(--app-border)] pt-5 sm:grid-cols-2">
            <Field
              label="Sort order"
              hint="Lower shows first"
              error={errors.sort_order?.message}
            >
              <Input type="number" {...form.register('sort_order')} />
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox
                label="Published"
                description="Visible on the public site."
                {...form.register('is_published')}
              />
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting)
            toast.success('Accreditation deleted')
            setDeleting(null)
          } catch (error) {
            toast.error('Could not delete', errorMessage(error))
          }
        }}
        title="Delete accreditation"
        tone="danger"
        confirmLabel="Delete"
        isLoading={remove.isPending}
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed permanently.
            Unpublish instead if the credential is simply lapsed.
          </>
        }
      />
    </>
  )
}
