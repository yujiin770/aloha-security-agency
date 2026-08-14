import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Newspaper, Pencil, Trash2 } from 'lucide-react'
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
  useCreateNewsPost,
  useDeleteNewsPost,
  useNewsPosts,
  useUpdateNewsPost,
} from '@/features/cms/hooks/useCms'
import { ADMIN_ROLES } from '@/utils/constants'
import { formatDate } from '@/utils/format'
import type { NewsPostRow } from '@/types/database.types'
import { ContentToolbar } from './components/ContentToolbar'

const schema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(160),
    slug: z
      .string()
      .trim()
      .min(3, 'At least 3 characters')
      .max(120)
      .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only'),
    category: z.string().trim().max(60).optional().or(z.literal('')),
    excerpt: z.string().trim().max(300).optional().or(z.literal('')),
    body: z.string().trim().max(20000).optional().or(z.literal('')),
    published_at: z.string().optional().or(z.literal('')),
    is_published: z.boolean(),
  })
  // Mirrors the `news_posts_published_date_chk` constraint — catching it here
  // gives a readable message instead of a database error.
  .refine((values) => !values.is_published || Boolean(values.published_at), {
    message: 'A published post needs a publish date',
    path: ['published_at'],
  })

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  title: '',
  slug: '',
  category: '',
  excerpt: '',
  body: '',
  published_at: new Date().toISOString().slice(0, 10),
  is_published: false,
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export default function NewsPage() {
  const toast = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<NewsPostRow | null>(null)
  const [deleting, setDeleting] = useState<NewsPostRow | null>(null)
  const [cover, setCover] = useState<string | null>(null)

  const posts = useNewsPosts(false)
  const create = useCreateNewsPost()
  const update = useUpdateNewsPost()
  const remove = useDeleteNewsPost()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  function openCreate() {
    form.reset(EMPTY)
    setCover(null)
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(row: NewsPostRow) {
    form.reset({
      title: row.title,
      slug: row.slug,
      category: row.category ?? '',
      excerpt: row.excerpt ?? '',
      body: row.body ?? '',
      published_at: row.published_at ? row.published_at.slice(0, 10) : '',
      is_published: row.is_published,
    })
    setCover(row.cover_path)
    setEditing(row)
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      title: values.title.trim(),
      slug: values.slug.trim(),
      category: values.category?.trim() || null,
      excerpt: values.excerpt?.trim() || null,
      body: values.body?.trim() || null,
      cover_path: cover,
      published_at: values.published_at
        ? new Date(values.published_at).toISOString()
        : null,
      is_published: values.is_published,
      author_id: null,
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload })
        toast.success('Post updated', payload.title)
      } else {
        await create.mutateAsync(payload)
        toast.success('Post created', payload.title)
      }
      setDialogOpen(false)
    } catch (error) {
      toast.error('Could not save post', errorMessage(error))
    }
  }

  const columns: Column<NewsPostRow>[] = [
    {
      key: 'post',
      header: 'Post',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-11 w-16 shrink-0 overflow-hidden rounded border border-[var(--app-border)] bg-[var(--app-bg)]">
            {row.cover_path && (
              <img
                src={mediaUrl(row.cover_path) ?? ''}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--app-text)]">{row.title}</p>
            <p className="truncate font-mono text-xs text-[var(--app-text-subtle)]">
              /{row.slug}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      secondary: true,
      render: (row) =>
        row.category ? (
          <Badge size="sm">{row.category}</Badge>
        ) : (
          <span className="text-sm text-[var(--app-text-subtle)]">—</span>
        ),
    },
    {
      key: 'date',
      header: 'Published',
      render: (row) => (
        <span className="text-sm whitespace-nowrap text-[var(--app-text-muted)]">
          {formatDate(row.published_at)}
        </span>
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
              aria-label={`Edit ${row.title}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleting(row)}
              aria-label={`Delete ${row.title}`}
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
        icon={Newspaper}
        blurb={
          <>
            Announcements, recruitment drives and company updates. The three most
            recent published posts appear on the landing page.
          </>
        }
        createLabel="New post"
        onCreate={openCreate}
      />

      <DataTable
        caption="News posts"
        columns={columns}
        rows={posts.data ?? []}
        rowKey={(row) => row.id}
        isLoading={posts.isLoading}
        error={posts.isError ? errorMessage(posts.error) : null}
        onRetry={() => void posts.refetch()}
        emptyTitle="No posts yet"
        emptyDescription="Write your first announcement to replace the placeholder on the landing page."
        emptyAction={
          <Can roles={[...ADMIN_ROLES]}>
            <Button size="sm" onClick={openCreate}>
              New post
            </Button>
          </Can>
        }
      />

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Edit post' : 'New post'}
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
              {editing ? 'Save changes' : 'Create post'}
            </Button>
          </>
        }
      >
        <form className="space-y-5" noValidate>
          <Field label="Title" required error={errors.title?.message}>
            <Input
              {...form.register('title', {
                // Derive the slug while drafting, but never rewrite an existing
                // one — a published URL that silently changes breaks every link
                // to it.
                onChange: (event) => {
                  if (!editing) form.setValue('slug', toSlug(event.target.value))
                },
              })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="URL slug"
              required
              hint={editing ? 'Changing this breaks existing links' : 'From the title'}
              error={errors.slug?.message}
            >
              <Input className="font-mono" {...form.register('slug')} />
            </Field>
            <Field
              label="Category"
              hint="e.g. Recruitment"
              error={errors.category?.message}
            >
              <Input {...form.register('category')} />
            </Field>
          </div>

          <Field
            label="Excerpt"
            hint="Shown on the landing page card"
            error={errors.excerpt?.message}
          >
            <Textarea rows={2} {...form.register('excerpt')} />
          </Field>

          <Field
            label="Body"
            hint="Plain text. Blank lines separate paragraphs."
            error={errors.body?.message}
          >
            <Textarea rows={8} {...form.register('body')} />
          </Field>

          <ImageUploader
            label="Cover image"
            hint="16:10 works best"
            folder="news"
            aspect="video"
            value={cover}
            onChange={setCover}
            className="max-w-md"
          />

          <div className="grid gap-4 border-t border-[var(--app-border)] pt-5 sm:grid-cols-2">
            <Field
              label="Publish date"
              error={errors.published_at?.message}
            >
              <Input type="date" {...form.register('published_at')} />
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
            toast.success('Post deleted')
            setDeleting(null)
          } catch (error) {
            toast.error('Could not delete', errorMessage(error))
          }
        }}
        title="Delete post"
        tone="danger"
        confirmLabel="Delete"
        isLoading={remove.isPending}
        message={
          <>
            <strong>{deleting?.title}</strong> and its cover image will be
            removed permanently, and any link to it will break. Unpublish
            instead to take it off the site while keeping it.
          </>
        }
      />
    </>
  )
}
