import { useRef, useState, type DragEvent } from 'react'
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/utils/cn'
import { errorMessage } from '@/lib/errors'
import { mediaUrl } from '../api/cmsApi'
import { useUploadMedia } from '../hooks/useCms'

/**
 * Upload control for CMS images.
 *
 * Uploads straight to the public `company-assets` bucket and hands the caller
 * back the object key, which is what gets stored on the content row. The
 * preview reads through `mediaUrl`, so it works identically whether the value
 * is a fresh upload, an existing key or a bundled path.
 *
 * Deliberately does not delete the previous object on replace: the row may not
 * be saved, and orphaning a 40 KB logo is a much smaller problem than deleting
 * an image that is still referenced.
 */
export function ImageUploader({
  value,
  onChange,
  folder,
  label,
  hint,
  aspect = 'video',
  className,
}: {
  value: string | null
  onChange: (path: string | null) => void
  /** Storage folder, e.g. `testimonials`. Keeps the bucket browsable. */
  folder: string
  label?: string
  hint?: string
  aspect?: 'video' | 'square' | 'wide' | 'portrait'
  className?: string
}) {
  const toast = useToast()
  const upload = useUploadMedia()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const preview = mediaUrl(value)

  const ASPECTS = {
    video: 'aspect-[16/10]',
    square: 'aspect-square',
    wide: 'aspect-[21/9]',
    portrait: 'aspect-[3/4]',
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    try {
      const path = await upload.mutateAsync({ file, folder })
      onChange(path)
      toast.success('Image uploaded')
    } catch (error) {
      toast.error('Upload failed', errorMessage(error))
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void handleFile(event.dataTransfer.files[0])
  }

  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-[var(--app-text)]">{label}</span>
          {hint && (
            <span className="text-xs text-[var(--app-text-subtle)]">{hint}</span>
          )}
        </div>
      )}

      {preview ? (
        <div className="relative overflow-hidden rounded-lg border border-[var(--app-border)]">
          <img
            src={preview}
            alt=""
            className={cn('w-full bg-[var(--app-bg)] object-cover', ASPECTS[aspect])}
          />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              isLoading={upload.isPending}
              leftIcon={<ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Replace
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onChange(null)}
              aria-label="Remove image"
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors',
            ASPECTS[aspect],
            dragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-[var(--app-border)] bg-[var(--app-bg)]',
          )}
        >
          {upload.isPending ? (
            <Loader2
              className="h-6 w-6 animate-spin text-brand-500"
              aria-hidden="true"
            />
          ) : (
            <UploadCloud
              className="h-6 w-6 text-[var(--app-text-subtle)]"
              aria-hidden="true"
            />
          )}
          <p className="text-sm text-[var(--app-text-muted)]">
            Drag an image here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="font-medium text-brand-600 underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-[var(--app-text-subtle)]">
            JPG, PNG, WebP or SVG · up to 5 MB
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
    </div>
  )
}
