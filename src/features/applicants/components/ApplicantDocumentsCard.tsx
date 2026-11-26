import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Eye, FileImage, FileText } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { ImageViewer } from '@/components/ui/ImageViewer'
import { useToast } from '@/components/ui/Toast'
import { Can } from '@/app/guards'
import { useAuth } from '@/contexts/AuthContext'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { ADMIN_ROLES, documentTypeMeta } from '@/utils/constants'
import { formatFileSize, humanize } from '@/utils/format'
import type { ApplicantDocumentRow } from '@/types/database.types'
import {
  getDocumentUrl,
  listApplicantDocuments,
  verifyDocument,
} from '../api/applicantsApi'

const isImage = (doc: ApplicantDocumentRow) =>
  doc.mime_type?.startsWith('image/') ?? /\.(jpe?g|png|webp|gif)$/i.test(doc.file_name)

/**
 * The documents uploaded with an application. Shown on the applicant page and,
 * once hired, on the personnel page — it is the same person's file either way.
 */
export function ApplicantDocumentsCard({
  applicantId,
  personName,
}: {
  applicantId: string
  /** Used in the preview's caption and alt text. */
  personName: string
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()

  const documents = useQuery({
    queryKey: queryKeys.applicants.documents(applicantId),
    queryFn: () => listApplicantDocuments(applicantId),
    enabled: Boolean(applicantId),
  })

  const verify = useMutation({
    mutationFn: (documentId: string) => verifyDocument(documentId, user!.id),
    onSuccess: () => {
      toast.success('Document verified')
      void qc.invalidateQueries({ queryKey: queryKeys.applicants.documents(applicantId) })
    },
    onError: (error) => toast.error('Could not verify document', errorMessage(error)),
  })

  // Images preview in place; anything else (PDFs) opens in a new tab, where
  // the browser's own viewer does a better job than we could.
  const [preview, setPreview] = useState<{ doc: ApplicantDocumentRow; url: string | null } | null>(
    null,
  )

  async function loadPreview(doc: ApplicantDocumentRow) {
    setPreview({ doc, url: null })
    try {
      // Signed links expire after a minute, so a retry always asks for a new one.
      const url = await getDocumentUrl(doc)
      setPreview((current) => (current?.doc.id === doc.id ? { doc, url } : current))
    } catch (error) {
      setPreview(null)
      toast.error('Could not load preview', errorMessage(error))
    }
  }

  async function openDocument(doc: ApplicantDocumentRow) {
    if (isImage(doc)) {
      void loadPreview(doc)
      return
    }
    try {
      const url = await getDocumentUrl(doc)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error('Could not open document', errorMessage(error))
    }
  }

  const docLabel = (doc: ApplicantDocumentRow) =>
    documentTypeMeta(doc.document_type)?.label ?? humanize(doc.document_type)

  return (
    <>
      <Card padded={false}>
        <CardHeader
          title="Uploaded documents"
          description={`${documents.data?.length ?? 0} uploaded`}
        />
        {documents.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : documents.isError ? (
          <ErrorState
            message={errorMessage(documents.error)}
            onRetry={() => void documents.refetch()}
            className="py-8"
          />
        ) : (documents.data?.length ?? 0) === 0 ? (
          <p className="p-5 text-sm text-[var(--app-text-muted)]">
            No documents were uploaded with this application.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--app-border)]">
            {documents.data!.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--app-bg)] text-[var(--app-text-subtle)]">
                  {isImage(doc) ? (
                    <FileImage className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--app-text)]">
                    {docLabel(doc)}
                  </p>
                  <p className="truncate text-xs text-[var(--app-text-subtle)]">
                    {doc.file_name} · {formatFileSize(doc.size_bytes)}
                  </p>
                </div>

                {doc.verified_at ? (
                  <Badge tone="success" size="sm">
                    Verified
                  </Badge>
                ) : (
                  <Can roles={[...ADMIN_ROLES, 'hr_staff', 'recruitment_officer']}>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<BadgeCheck className="h-3.5 w-3.5" />}
                      onClick={() => verify.mutate(doc.id)}
                      isLoading={verify.isPending && verify.variables === doc.id}
                    >
                      Verify
                    </Button>
                  </Can>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Eye className="h-3.5 w-3.5" />}
                  onClick={() => void openDocument(doc)}
                >
                  {isImage(doc) ? 'Preview' : 'Open'}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-[var(--app-border)] px-5 py-2.5 text-xs text-[var(--app-text-subtle)]">
          Images preview here; other files open in a new tab. Links are signed and expire after 60 seconds.
        </p>
      </Card>

      <ImageViewer
        open={preview !== null}
        onClose={() => setPreview(null)}
        src={preview?.url ?? null}
        alt={preview ? `${docLabel(preview.doc)} for ${personName}` : ''}
        title={preview ? docLabel(preview.doc) : undefined}
        subtitle={preview ? `${preview.doc.file_name} · ${personName}` : undefined}
        onRetry={preview ? () => void loadPreview(preview.doc) : undefined}
      />
    </>
  )
}
