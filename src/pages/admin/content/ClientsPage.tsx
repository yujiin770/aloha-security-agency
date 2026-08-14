import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Building2, ExternalLink, Pencil, Trash2, Users } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { errorMessage } from '@/lib/errors'
import { ImageUploader } from '@/features/cms/components/ImageUploader'
import { mediaUrl } from '@/features/cms/api/cmsApi'
import {
  useClients,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from '@/features/cms/hooks/useCms'
import { ADMIN_ROLES } from '@/utils/constants'
import type { ClientRow } from '@/types/database.types'
import { ContentToolbar } from './components/ContentToolbar'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  industry: z.string().trim().max(80).optional().or(z.literal('')),
  website_url: z
    .string()
    .trim()
    .url('Include the full address, starting http:// or https://')
    .optional()
    .or(z.literal('')),
  sort_order: z.string(),
  is_published: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  name: '',
  industry: '',
  website_url: '',
  sort_order: '0',
  is_published: false,
}

export default function ClientsPage() {
  const toast = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ClientRow | null>(null)
  const [deleting, setDeleting] = useState<ClientRow | null>(null)
  const [logo, setLogo] = useState<string | null>(null)

  const clients = useClients(false)
  const create = useCreateClient()
  const update = useUpdateClient()
  const remove = useDeleteClient()

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

  function openEdit(row: ClientRow) {
    form.reset({
      name: row.name,
      industry: row.industry ?? '',
      website_url: row.website_url ?? '',
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
      industry: values.industry?.trim() || null,
      website_url: values.website_url?.trim() || null,
      logo_path: logo,
      sort_order: Number(values.sort_order) || 0,
      is_published: values.is_published,
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload })
        toast.success('Client updated', payload.name)
      } else {
        await create.mutateAsync(payload)
        toast.success('Client added', payload.name)
      }
      setDialogOpen(false)
    } catch (error) {
      toast.error('Could not save client', errorMessage(error))
    }
  }

  const columns: Column<ClientRow>[] = [
    {
      key: 'client',
      header: 'Client',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-white">
            {row.logo_path ? (
              <img
                src={mediaUrl(row.logo_path) ?? ''}
                alt=""
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <Building2
                className="h-4 w-4 text-[var(--app-text-subtle)]"
                aria-hidden="true"
              />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--app-text)]">{row.name}</p>
            <p className="truncate text-xs text-[var(--app-text-subtle)]">
              {row.industry ?? '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'website',
      header: 'Website',
      secondary: true,
      render: (row) =>
        row.website_url ? (
          <a
            href={row.website_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
          >
            Visit
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
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
      <ContentToolbar
        icon={Users}
        blurb={
          <>
            Client logos for the trust strip under the hero. Naming a client
            publicly is their call, not ours — publish only with permission.
          </>
        }
        createLabel="Add client"
        onCreate={openCreate}
      />

      <DataTable
        caption="Clients"
        columns={columns}
        rows={clients.data ?? []}
        rowKey={(row) => row.id}
        isLoading={clients.isLoading}
        error={clients.isError ? errorMessage(clients.error) : null}
        onRetry={() => void clients.refetch()}
        emptyTitle="No clients yet"
        emptyDescription="Add client logos to replace the placeholder strip on the landing page."
        emptyAction={
          <Can roles={[...ADMIN_ROLES]}>
            <Button size="sm" onClick={openCreate}>
              Add client
            </Button>
          </Can>
        }
      />

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add client'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              isLoading={create.isPending || update.isPending}
            >
              {editing ? 'Save changes' : 'Add client'}
            </Button>
          </>
        }
      >
        <form className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client name" required error={errors.name?.message}>
              <Input {...form.register('name')} />
            </Field>
            <Field
              label="Industry"
              hint="e.g. Retail"
              error={errors.industry?.message}
            >
              <Input {...form.register('industry')} />
            </Field>
          </div>

          <Field
            label="Website"
            hint="Optional"
            error={errors.website_url?.message}
          >
            <Input placeholder="https://example.com" {...form.register('website_url')} />
          </Field>

          <ImageUploader
            label="Logo"
            hint="SVG or transparent PNG works best"
            folder="clients"
            aspect="video"
            value={logo}
            onChange={setLogo}
            className="max-w-sm"
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
            toast.success('Client deleted')
            setDeleting(null)
          } catch (error) {
            toast.error('Could not delete', errorMessage(error))
          }
        }}
        title="Delete client"
        tone="danger"
        confirmLabel="Delete"
        isLoading={remove.isPending}
        message={
          <>
            <strong>{deleting?.name}</strong> and its logo will be removed
            permanently. Unpublish instead if you may want it back.
          </>
        }
      />
    </>
  )
}
