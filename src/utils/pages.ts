/**
 * The pages an administrator can grant or withhold, and the permission key that
 * governs each.
 *
 * One list, read by three places: the sidebar (which links to show), the route
 * guards (which URLs to admit), and the Roles screen (which boxes to tick).
 * Keeping them in one file is what stops a page from being hidden in the
 * sidebar but reachable by typing its URL — the failure this list replaced.
 *
 * Keys match the `pages.*` rows seeded in migration 0020. Adding a page means
 * adding a row here *and* a row there.
 */

export interface PageDefinition {
  /** Permission key — `pages.<slug>`. */
  key: string
  label: string
  description: string
  /**
   * Pages nobody can be locked out of. A signed-in user with no landing page
   * and no way to reach their own profile is a support ticket, not a policy.
   */
  alwaysGranted?: boolean
}

export const PAGES: PageDefinition[] = [
  {
    key: 'pages.dashboard',
    label: 'Dashboard',
    description: 'Agency-wide overview and KPI tiles',
    alwaysGranted: true,
  },
  {
    key: 'pages.applicants',
    label: 'Applicants',
    description: 'Recruitment pipeline and applicant records',
  },
  {
    key: 'pages.personnel',
    label: 'Personnel Roster',
    description: 'Employed guards and their records',
  },
  {
    key: 'pages.facilities',
    label: 'Facilities',
    description: 'Client sites, coordinators and headcount',
  },
  {
    key: 'pages.deployments',
    label: 'Deployments',
    description: 'Postings, transfers and shift coverage',
  },
  {
    key: 'pages.reports',
    label: 'Reports',
    description: 'Analytics and CSV exports',
  },
  {
    key: 'pages.audit',
    label: 'Audit Logs',
    description: 'Record of every change made in the system',
  },
  {
    key: 'pages.users',
    label: 'Users',
    description: 'Staff accounts and role grants',
  },
  {
    key: 'pages.content',
    label: 'Website Content',
    description: 'Public site CMS — testimonials, clients, news',
  },
  {
    key: 'pages.config',
    label: 'Data Configuration',
    description: 'Positions, ranks and roles',
  },
  {
    key: 'pages.settings',
    label: 'Settings',
    description: 'Own profile and preferences',
    alwaysGranted: true,
  },
]

export const PAGE_KEYS = PAGES.map((p) => p.key)

export function pageLabel(key: string): string {
  return PAGES.find((p) => p.key === key)?.label ?? key
}
