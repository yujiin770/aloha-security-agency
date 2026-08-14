import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Can } from '@/app/guards'
import { ADMIN_ROLES } from '@/utils/constants'

/**
 * Shared header row for each content section.
 *
 * The Website Content hub owns the page header, so each section only needs its
 * own explanatory line and a create button.
 */
export function ContentToolbar({
  icon: Icon,
  blurb,
  createLabel,
  onCreate,
}: {
  icon: LucideIcon
  blurb: ReactNode
  createLabel: string
  onCreate: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
        <p className="max-w-2xl text-sm text-[var(--app-text-muted)]">{blurb}</p>
      </div>

      <Can roles={[...ADMIN_ROLES]}>
        <Button leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={onCreate}>
          {createLabel}
        </Button>
      </Can>
    </div>
  )
}
