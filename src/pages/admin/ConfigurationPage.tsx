import { NavLink, Outlet } from 'react-router-dom'
import { Briefcase, Layers, Settings2, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { usePositions, useRanks, useRoles } from '@/features/config/hooks/useConfig'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils/cn'
import { ADMIN_ROLES } from '@/utils/constants'

/**
 * Data Configuration hub.
 *
 * A layout route: it owns the page header and the section tabs, and renders the
 * active section through `<Outlet />`. Each section keeps its own URL, so a
 * link to a specific tab still works and each table paginates independently.
 *
 * New reference data (shift patterns, document types, client types) belongs
 * here as another tab rather than as another top-level sidebar entry.
 */

interface Section {
  to: string
  label: string
  icon: LucideIcon
  description: string
  count?: number
}

export default function ConfigurationPage() {
  const { hasRole } = useAuth()
  const canEdit = hasRole(...ADMIN_ROLES)

  const positions = usePositions(true)
  const ranks = useRanks(true)
  const roles = useRoles()

  const sections: Section[] = [
    {
      to: 'positions',
      label: 'Positions',
      icon: Briefcase,
      description: 'Job positions applicants apply for and personnel hold',
      count: positions.data?.length,
    },
    {
      to: 'ranks',
      label: 'Ranks',
      icon: Layers,
      description: 'Seniority titles assigned on hire or promotion',
      count: ranks.data?.length,
    },
    {
      to: 'roles',
      label: 'Roles',
      icon: ShieldCheck,
      description: 'Staff role definitions and their permissions',
      count: roles.data?.length,
    },
  ]

  return (
    <>
      <PageHeader
        title="Data Configuration"
        description="Reference data the rest of the system is built from. Changes take effect immediately."
      />

      {!canEdit && (
        <Card className="mb-4 border-info/25 bg-info-soft">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-info"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--app-text-muted)]">
              You can view this configuration but not change it. Editing is
              limited to the owner, administrators and system administrators —
              and that limit is enforced by the database, not just hidden here.
            </p>
          </div>
        </Card>
      )}

      {/* Section tabs -------------------------------------------------- */}
      <nav
        aria-label="Configuration sections"
        className="mb-6 flex flex-wrap gap-2"
      >
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) =>
              cn(
                'group flex min-w-[15rem] flex-1 items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors',
                isActive
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:border-brand-300',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'rounded-lg p-2 transition-colors',
                    isActive
                      ? 'bg-brand-500 text-white'
                      : 'bg-[var(--app-bg)] text-[var(--app-text-muted)] group-hover:text-brand-600',
                  )}
                >
                  <section.icon className="h-4 w-4" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        isActive ? 'text-brand-700 dark:text-brand-300' : 'text-[var(--app-text)]',
                      )}
                    >
                      {section.label}
                    </span>
                    {section.count !== undefined && (
                      <Badge size="sm" tone={isActive ? 'brand' : 'neutral'}>
                        {section.count}
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--app-text-muted)]">
                    {section.description}
                  </span>
                </span>
              </>
            )}
          </NavLink>
        ))}

        {/* Placeholder tile: shows this hub is where future reference data
            goes, without pretending anything is there yet. */}
        <div className="flex min-w-[15rem] flex-1 items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--app-border)] p-4 opacity-60">
          <span className="rounded-lg bg-[var(--app-bg)] p-2 text-[var(--app-text-subtle)]">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--app-text-muted)]">
              More to come
            </span>
            <span className="mt-0.5 block text-xs text-[var(--app-text-subtle)]">
              Shift patterns, document types and client categories
            </span>
          </span>
        </div>
      </nav>

      <Outlet />
    </>
  )
}
