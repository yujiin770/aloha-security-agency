import { useRef, useState, type DragEvent } from 'react'
import { FileText, Paperclip, Trash2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { formatFileSize } from '@/utils/format'
import { MAX_UPLOAD_BYTES } from '@/utils/constants'
import type { DocumentType } from '@/types/database.types'

export interface PendingFile {
  documentType: DocumentType
  file: File
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx'
const ACCEPTED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

/**
 * Drag-and-drop file picker for the application form.
 *
 * Files are held in memory and uploaded only after the applicant record exists
 * — storage paths are keyed on the applicant id, and the RLS policy in 0010
 * requires a real, pending application before it will accept an object.
 *
 * Client-side type and size checks are courtesy validation; the bucket's own
 * `allowed_mime_types` and `file_size_limit` are the real gate.
 */
export function FileUpload({
  documentType,
  label,
  description,
  required,
  value,
  onChange,
}: {
  documentType: DocumentType
  label: string
  description?: string
  required?: boolean
  value: File | null
  onChange: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function accept(file: File | undefined) {
    if (!file) return

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${formatFileSize(file.size)}. The limit is 10 MB.`)
      return
    }
    if (file.type && !ACCEPTED_MIME.includes(file.type)) {
      setError('Upload a PDF, Word document or image (JPG, PNG, WebP).')
      return
    }

    setError(null)
    onChange(file)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer.files[0])
  }

  const inputId = `upload-${documentType}`

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--app-text)]">
          {label}
          {required && (
            <span className="ml-1 text-brand-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {description && (
          <span className="text-xs text-[var(--app-text-subtle)]">{description}</span>
        )}
      </div>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
          <FileText className="h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--app-text)]">
              {value.name}
            </p>
            <p className="text-xs text-[var(--app-text-subtle)]">
              {formatFileSize(value.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            aria-label={`Remove ${value.name}`}
          >
            <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors',
            dragging
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
              : 'border-[var(--app-border)] bg-[var(--app-surface)]',
          )}
        >
          <UploadCloud
            className="h-6 w-6 text-[var(--app-text-subtle)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--app-text-muted)]">
            Drag a file here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="font-medium text-brand-600 underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-[var(--app-text-subtle)]">
            PDF, Word or image · up to 10 MB
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-danger">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
