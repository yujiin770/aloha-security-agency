import { NavLink } from 'react-router-dom'
import {
  Building2,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  MapPinned,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Users,
  UsersRound,
  X,
  // New icons for the CMS section
  Quote,
  Handshake,
  Award,
  Newspaper,
  Image as ImageIcon
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils/cn'

/**
 * Black operations sidebar.
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
  end?: boolean
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
      {
        to: '/admin/personnel',
        label: 'Personnel Roster',
        icon: UsersRound,
        permission: 'pages.personnel',
      },
    ],
  },
  {
    heading: 'Operations',
    items: [
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
      {
        to: '/admin/audit',
        label: 'Audit Logs',
        icon: ScrollText,
        permission: 'pages.audit',
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
        label: 'Users',
        icon: Users,
        permission: 'pages.users',
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

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean
  onClose: () => void
}) {
  const { hasPermission, user, isAdmin } = useAuth() // isAdmin here

  const sections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
   
      if (item.to === '/admin/settings') {
        return isAdmin && hasPermission(item.permission)
      }
      return hasPermission(item.permission)
    }),
  })).filter((section) => section.items.length > 0)

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
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--app-sidebar-bg)]',
          'transition-transform duration-200',
          'lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-800 px-4">
          <Logo inverted size="sm" />
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
          {sections.map((section) => (
            <div key={section.heading} className="mb-5">
              <h2 className="px-3 pb-2 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
                {section.heading}
              </h2>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-500 text-white'
                            : 'text-[var(--app-sidebar-text)] hover:bg-[var(--app-sidebar-hover)] hover:text-white',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {user && (
          <div className="shrink-0 border-t border-neutral-800 p-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                {user.profile.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {user.profile.full_name}
                </p>
                <p className="truncate text-[11px] text-neutral-500 capitalize">
                  {user.roles[0]?.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}