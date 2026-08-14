import { useState } from 'react'
import { Image as ImageIcon, Save } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { ImageUploader } from '@/features/cms/components/ImageUploader'
import { useSiteMedia, useUpdateSiteMedia } from '@/features/cms/hooks/useCms'
import { useAuth } from '@/contexts/AuthContext'
import type { SiteMediaRow } from '@/types/database.types'
import { ADMIN_ROLES } from '@/utils/constants'

/**
 * Site images.
 *
 * A fixed set of named slots rather than a free-form media library. The
 * marketing site has specific image positions with specific crops; asking an
 * editor to "upload to the library and remember which one is the hero" is how
 * those positions end up with a portrait photo in a 21:9 band.
 */
export default function MediaPage() {
  const media = useSiteMedia()
  const { hasRole } = useAuth()
  const canEdit = hasRole(...ADMIN_ROLES)

  if (media.isError) {
    return (
      <Card>
        <ErrorState
          message={errorMessage(media.error)}
          onRetry={() => void media.refetch()}
        />
      </Card>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <ImageIcon
          className="mt-0.5 h-5 w-5 shrink-0 text-brand-500"
          aria-hidden="true"
        />
        <p className="max-w-2xl text-sm text-[var(--app-text-muted)]">
          Photography for the public site. Each slot has a fixed position and
          crop — the description tells you what works. An empty slot falls back
          to a branded panel, so the site never shows a broken image.
        </p>
      </div>

      {media.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-80 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(media.data ?? []).map((slot) => (
            <MediaSlotCard key={slot.key} slot={slot} canEdit={canEdit} />
          ))}
        </div>
      )}
    </>
  )
}

function MediaSlotCard({
  slot,
  canEdit,
}: {
  slot: SiteMediaRow
  canEdit: boolean
}) {
  const toast = useToast()
  const update = useUpdateSiteMedia()

  // Null until touched, so the saved value shows through without an effect
  // syncing fetched data into local state.
  const [pathDraft, setPathDraft] = useState<string | null | undefined>(undefined)
  const [altDraft, setAltDraft] = useState<string | undefined>(undefined)

  const path = pathDraft === undefined ? slot.storage_path : pathDraft
  const alt = altDraft === undefined ? (slot.alt_text ?? '') : altDraft
  const dirty = path !== slot.storage_path || alt !== (slot.alt_text ?? '')

  async function save() {
    try {
      await update.mutateAsync({
        key: slot.key,
        patch: { storage_path: path, alt_text: alt.trim() || null },
      })
      setPathDraft(undefined)
      setAltDraft(undefined)
      toast.success('Image saved', slot.label)
    } catch (error) {
      toast.error('Could not save image', errorMessage(error))
    }
  }

  const aspect =
    slot.width && slot.height && slot.height > slot.width ? 'portrait' : 'video'

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-[var(--app-text)]">{slot.label}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--app-text-subtle)]">
            {slot.key}
            {slot.width && slot.height && ` · ${slot.width}×${slot.height}`}
          </p>
        </div>
        <Badge tone={slot.storage_path ? 'success' : 'neutral'} size="sm" dot>
          {slot.storage_path ? 'Set' : 'Empty'}
        </Badge>
      </div>

      {slot.description && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--app-text-muted)]">
          {slot.description}
        </p>
      )}

      <div className="mt-4 flex-1">
        <ImageUploader
          folder="site"
          aspect={aspect}
          value={path}
          onChange={setPathDraft}
        />
      </div>

      <Field
        label="Alt text"
        className="mt-4"
        hint="Describe the image for screen readers. Leave blank if purely decorative."
      >
        <Input
          value={alt}
          disabled={!canEdit}
          onChange={(event) => setAltDraft(event.target.value)}
        />
      </Field>

      {dirty && canEdit && (
        <div className="mt-4 flex gap-2 border-t border-[var(--app-border)] pt-4">
          <Button
            size="sm"
            leftIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={save}
            isLoading={update.isPending}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPathDraft(undefined)
              setAltDraft(undefined)
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </Card>
  )
}
