import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Pencil, Quote, Star, Trash2 } from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { errorMessage } from '@/lib/errors'
import { ImageUploader } from '@/features/cms/components/ImageUploader'
import { mediaUrl } from '@/features/cms/api/cmsApi'
import {
  useCreateTestimonial,
  useDeleteTestimonial,
  useTestimonials,
  useUpdateTestimonial,
} from '@/features/cms/hooks/useCms'
import { ADMIN_ROLES } from '@/utils/constants'
import { initials } from '@/utils/format'
import type { TestimonialRow } from '@/types/database.types'
import { ContentToolbar } from './components/ContentToolbar'

const schema = z.object({
  quote: z
    .string()
    .trim()
    .min(10, 'A little more detail, please')
    .max(1000, 'Keep it under 1000 characters'),
  author_name: z.string().trim().min(1, 'Name is required').max(120),
  author_role: z.string().trim().max(120).optional().or(z.literal('')),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  rating: z.string().optional().or(z.literal('')),
  sort_order: z.string(),
  is_published: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  quote: '',
  author_name: '',
  author_role: '',
  company: '',
  rating: '5',
  sort_order: '0',
  is_published: false,
}

export default function TestimonialsPage() {
  const toast = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TestimonialRow | null>(null)
  const [deleting, setDeleting] = useState<TestimonialRow | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)

  const testimonials = useTestimonials(false)
  const create = useCreateTestimonial()
  const update = useUpdateTestimonial()
  const remove = useDeleteTestimonial()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  function openCreate() {
    form.reset(EMPTY)
    setAvatar(null)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(row: TestimonialRow) {
    form.reset({
      quote: row.quote,
      author_name: row.author_name,
      author_role: row.author_role ?? '',
      company: row.company ?? '',
      rating: row.rating == null ? '' : String(row.rating),
      sort_order: String(row.sort_order),
      is_published: row.is_published,
    })
    setAvatar(row.avatar_path)
    setEditing(row)
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      quote: values.quote.trim(),
      author_name: values.author_name.trim(),
      author_role: values.author_role?.trim() || null,
      company: values.company?.trim() || null,
      avatar_path: avatar,
      rating: values.rating ? Number(values.rating) : null,
      sort_order: Number(values.sort_order) || 0,
      is_published: values.is_published,
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload })
        toast.success('Testimonial updated', payload.author_name)
      } else {
        await create.mutateAsync(payload)
        toast.success('Testimonial added', payload.author_name)
      }
      setDialogOpen(false)
    } catch (error) {
      toast.error('Could not save testimonial', errorMessage(error))
    }
  }

  const columns: Column<TestimonialRow>[] = [
    {
      key: 'author',
      header: 'Author',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.avatar_path ? (
            <img
              src={mediaUrl(row.avatar_path) ?? ''}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
              {initials(row.author_name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--app-text)]">
              {row.author_name}
            </p>
            <p className="truncate text-xs text-[var(--app-text-subtle)]">
              {[row.author_role, row.company].filter(Boolean).join(', ') || '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'quote',
      header: 'Quote',
      render: (row) => (
        <p className="line-clamp-2 max-w-md text-sm text-[var(--app-text-muted)]">
          {row.quote}
        </p>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      secondary: true,
      render: (row) =>
        row.rating ? (
          <span
            className="flex items-center gap-0.5"
            aria-label={`${row.rating} out of 5`}
          >
            {Array.from({ length: row.rating }).map((_, index) => (
              <Star
                key={index}
                className="h-3.5 w-3.5 fill-warning text-warning"
                aria-hidden="true"
              />
            ))}
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
              aria-label={`Edit testimonial from ${row.author_name}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleting(row)}
              aria-label={`Delete testimonial from ${row.author_name}`}
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
        icon={Quote}
        blurb={
          <>
            Client quotes shown on the landing page. Publish only what you have
            permission to attribute — a testimonial names a real person and a
            real company.
          </>
        }
        createLabel="Add testimonial"
        onCreate={openCreate}
      />

      <DataTable
        caption="Testimonials"
        columns={columns}
        rows={testimonials.data ?? []}
        rowKey={(row) => row.id}
        isLoading={testimonials.isLoading}
        error={testimonials.isError ? errorMessage(testimonials.error) : null}
        onRetry={() => void testimonials.refetch()}
        emptyTitle="No testimonials yet"
        emptyDescription="Add a client quote to replace the placeholder on the landing page."
        emptyAction={
          <Can roles={[...ADMIN_ROLES]}>
            <Button size="sm" onClick={openCreate}>
              Add testimonial
            </Button>
          </Can>
        }
      />

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Edit testimonial' : 'Add testimonial'}
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
              {editing ? 'Save changes' : 'Add testimonial'}
            </Button>
          </>
        }
      >
        <form className="space-y-5" noValidate>
          <Field
            label="Quote"
            required
            hint="Their words, not a paraphrase."
            error={errors.quote?.message}
          >
            <Textarea rows={4} {...form.register('quote')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Author name" required error={errors.author_name?.message}>
              <Input {...form.register('author_name')} />
            </Field>
            <Field
              label="Role"
              hint="e.g. Operations Manager"
              error={errors.author_role?.message}
            >
              <Input {...form.register('author_role')} />
            </Field>
            <Field label="Company" error={errors.company?.message}>
              <Input {...form.register('company')} />
            </Field>
            <Field label="Rating" error={errors.rating?.message}>
              <Select
                placeholder="No rating"
                options={[5, 4, 3, 2, 1].map((n) => ({
                  value: String(n),
                  label: `${n} star${n === 1 ? '' : 's'}`,
                }))}
                {...form.register('rating')}
              />
            </Field>
          </div>

          <ImageUploader
            label="Author photo"
            hint="Optional · square works best"
            folder="testimonials"
            aspect="square"
            value={avatar}
            onChange={setAvatar}
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
            toast.success('Testimonial deleted')
            setDeleting(null)
          } catch (error) {
            toast.error('Could not delete', errorMessage(error))
          }
        }}
        title="Delete testimonial"
        tone="danger"
        confirmLabel="Delete"
        isLoading={remove.isPending}
        message={
          <>
            The testimonial from <strong>{deleting?.author_name}</strong> and its
            photo will be removed permanently. Unpublish it instead if you may
            want it back.
          </>
        }
      />
    </>
  )
}
