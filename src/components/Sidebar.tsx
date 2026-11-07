import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Archive,
  Award,
  Building2,
  ChevronsLeft,
  ClipboardList,
  FileBarChart,
  Handshake,
  Image as ImageIcon,
  LayoutDashboard,
  MapPinned,
  Newspaper,
  Quote,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils/cn'
import { humanize, initials } from '@/utils/format'

/**
 * Console sidebar.
 *
 * Collapses to an icon rail on desktop (the choice is remembered — see
 * DashboardLayout) and becomes a drawer below `lg`.
 *
 * Items are filtered by page permission, so what an administrator ticks on the
 * Roles screen is what appears here. The matching `<PageGuard>` in the router
 * blocks the URL as well — hiding a link alone would only stop the people who
 * do not type addresses. RLS remains what actually protects the data.
 */

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Permission key from `PAGES` in utils/pages.ts. */
  permission: string
  /** Exact-path match only (the dashboard, which is every route's prefix). */
  end?: boolean
  /** Query string the link carries, e.g. `status=archived`. */
  search?: string
}

const SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Overview',
    items: [
      {
        to: '/admin',
        label: 'Dashboard',
        icon: LayoutDashboard,
        permission: 'pages.dashboard',
        end: true,
      },
    ],
  },
  {
    heading: 'Recruitment',
    items: [
      {
        to: '/admin/applicants',
        label: 'Applicants',
        icon: ClipboardList,
        permission: 'pages.applicants',
      },
      // The archive is the applicants list pre-filtered, not a separate page,
      // so it shares the same route, permission and guard.
      {
        to: '/admin/applicants',
        search: 'status=archived',
        label: 'Applicant Archive',
        icon: Archive,
        permission: 'pages.applicants',
      },
    ],
  },
  {
    heading: 'Personnel Management',
    items: [
      {
        to: '/admin/personnel',
        label: 'Personnel Roster',
        icon: UsersRound,
        permission: 'pages.personnel',
      },
      {
        to: '/admin/facilities',
        label: 'Facilities',
        icon: Building2,
        permission: 'pages.facilities',
      },
      {
        to: '/admin/deployments',
        label: 'Deployments',
        icon: MapPinned,
        permission: 'pages.deployments',
      },
    ],
  },
  {
    heading: 'Insight',
    items: [
      {
        to: '/admin/reports',
        label: 'Reports',
        icon: FileBarChart,
        permission: 'pages.reports',
      },
    ],
  },
  // The CMS sections are listed individually rather than behind one "Website
  // Content" link. They are all children of the same route, so they share its
  // permission: granting Website Content grants all five.
  {
    heading: 'Website Content',
    items: [
      {
        to: '/admin/content/testimonials',
        label: 'Testimonials',
        icon: Quote,
        permission: 'pages.content',
      },
      {
        to: '/admin/content/clients',
        label: 'Client Logos',
        icon: Handshake,
        permission: 'pages.content',
      },
      {
        to: '/admin/content/accreditations',
        label: 'Accreditations',
        icon: Award,
        permission: 'pages.content',
      },
      {
        to: '/admin/content/news',
        label: 'News & Posts',
        icon: Newspaper,
        permission: 'pages.content',
      },
      {
        to: '/admin/content/media',
        label: 'Site Images',
        icon: ImageIcon,
        permission: 'pages.content',
      },
    ],
  },
  {
    heading: 'Administration',
    items: [
      {
        to: '/admin/users',
        label: 'User Management',
        icon: Users,
        permission: 'pages.users',
      },
      {
        to: '/admin/audit',
        label: 'Audit Logs',
        icon: ScrollText,
        permission: 'pages.audit',
      },
      {
        to: '/admin/config',
        label: 'Data Configuration',
        icon: SlidersHorizontal,
        permission: 'pages.config',
      },
      {
        to: '/admin/settings',
        label: 'Settings',
        icon: Settings,
        permission: 'pages.settings',
      },
    ],
  },
]

/**
 * NavLink matches on the path alone, so "Applicants" and "Applicant Archive"
 * would both light up. Items that share a path are told apart by the query.
 */
function isItemActive(item: NavItem, pathname: string, search: URLSearchParams) {
  const pathMatches = item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`)
  if (!pathMatches) return false

  const onArchive = pathname === '/admin/applicants' && search.get('status') === 'archived'
  if (item.search === 'status=archived') return onArchive
  if (item.to === '/admin/applicants') return !onArchive
  return true
}

export function Sidebar({
  mobileOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
}: {
  mobileOpen: boolean
  onClose: () => void
  /** Desktop icon-rail mode. Ignored in the mobile drawer, which is always full. */
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const { hasPermission, user, isAdmin } = useAuth()
  const location = useLocation()
  const search = new URLSearchParams(location.search)

  // Escape closes the drawer, matching every other overlay in the console.
  useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, onClose])

  const sections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.to === '/admin/settings') {
        return isAdmin && hasPermission(item.permission)
      }
      return hasPermission(item.permission)
    }),
  })).filter((section) => section.items.length > 0)

  // Labels hide only on desktop; the drawer below `lg` always shows them.
  const hideWhenCollapsed = collapsed ? 'lg:hidden' : undefined

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'sidebar-dark fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--app-sidebar-bg)]',
          'transition-[transform,width] duration-200 ease-out',
          'lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          collapsed && 'lg:w-[4.5rem]',
          mobileOpen ? 'translate-x-0 shadow-[var(--shadow-overlay)]' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] px-4',
            collapsed && 'lg:justify-center lg:px-2',
          )}
        >
          <Link to="/admin" onClick={onClose} className={cn('min-w-0', hideWhenCollapsed)}>
            <Logo inverted size="sm" />
          </Link>
          {collapsed && (
            <Link to="/admin" aria-label="Dashboard" className="hidden lg:block">
              <Logo inverted size="sm" showWordmark={false} />
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-neutral-400 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, index) => (
            <div key={section.heading} className="mb-5 last:mb-0">
              <h2
                className={cn(
                  'px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase',
                  hideWhenCollapsed,
                )}
              >
                {section.heading}
              </h2>
              {/* In the rail, a hairline stands in for the heading. */}
              {collapsed && index > 0 && (
                <div
                  className="mx-2 mb-3 hidden border-t border-[var(--app-border)] lg:block"
                  aria-hidden="true"
                />
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isItemActive(item, location.pathname, search)
                  return (
                    <li key={`${item.to}?${item.search ?? ''}`}>
                      <Link
                        to={item.search ? `${item.to}?${item.search}` : item.to}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        // The rail hides the text visually, so the name moves to
                        // a tooltip and the accessible label.
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          collapsed && 'lg:justify-center lg:px-0',
                          active
                            ? 'bg-[var(--app-sidebar-active)] text-white'
                            : 'text-[var(--app-sidebar-text)] hover:bg-[var(--app-sidebar-hover)] hover:text-[var(--app-text)]',
                        )}
                      >
                        {/* Active marker on the inner edge, so the state reads
                            by shape as well as by colour. */}
                        {active && (
                          <span
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-white/80"
                            aria-hidden="true"
                          />
                        )}
                        <item.icon
                          className={cn(
                            'h-[18px] w-[18px] shrink-0',
                            !active &&
                              'text-[var(--app-text-subtle)] group-hover:text-[var(--app-text-muted)]',
                          )}
                          aria-hidden="true"
                        />
                        <span className={cn('truncate', hideWhenCollapsed)}>{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--app-border)] p-3">
          {user && (
            <Link
              to="/admin/settings/profile"
              onClick={onClose}
              title={collapsed ? user.profile.full_name : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--app-sidebar-hover)]',
                collapsed && 'lg:justify-center lg:px-0',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                {initials(user.profile.full_name)}
              </span>
              <span className={cn('min-w-0', hideWhenCollapsed)}>
                <span className="block truncate text-sm font-medium text-[var(--app-text)]">
                  {user.profile.full_name}
                </span>
                <span className="block truncate text-xs text-[var(--app-text-subtle)]">
                  {humanize(user.roles[0])}
                </span>
              </span>
            </Link>
          )}

          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={cn(
              'mt-1 hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--app-text-subtle)] transition-colors hover:bg-[var(--app-sidebar-hover)] hover:text-[var(--app-text)] lg:flex',
              collapsed && 'justify-center px-0',
            )}
          >
            <ChevronsLeft
              className={cn('h-4 w-4 shrink-0 transition-transform', collapsed && 'rotate-180')}
              aria-hidden="true"
            />
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>
    </>
  )
}
