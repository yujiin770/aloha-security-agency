/**
 * Central query-key factory.
 *
 * Every TanStack Query key in the app comes from here. Keeping them in one file
 * means invalidation is provable: `queryKeys.applicants.all` reliably covers
 * every applicant list and detail query, because there is no other place a key
 * could have been spelled differently.
 */

export type ListParams = Record<string, unknown>

export const queryKeys = {
  auth: {
    session: ['auth', 'session'] as const,
    profile: (userId: string) => ['auth', 'profile', userId] as const,
    roles: (userId: string) => ['auth', 'roles', userId] as const,
  },

  applicants: {
    all: ['applicants'] as const,
    lists: () => [...queryKeys.applicants.all, 'list'] as const,
    list: (params: ListParams) => [...queryKeys.applicants.lists(), params] as const,
    details: () => [...queryKeys.applicants.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.applicants.details(), id] as const,
    documents: (id: string) => [...queryKeys.applicants.detail(id), 'documents'] as const,
    history: (id: string) => [...queryKeys.applicants.detail(id), 'history'] as const,
    statusCheck: (ref: string, lastName: string) =>
      ['applicants', 'status-check', ref, lastName] as const,
  },

  personnel: {
    all: ['personnel'] as const,
    lists: () => [...queryKeys.personnel.all, 'list'] as const,
    list: (params: ListParams) => [...queryKeys.personnel.lists(), params] as const,
    detail: (id: string) => [...queryKeys.personnel.all, 'detail', id] as const,
    deployments: (id: string) =>
      [...queryKeys.personnel.all, 'detail', id, 'deployments'] as const,
  },

  branches: {
    all: ['branches'] as const,
    lists: () => [...queryKeys.branches.all, 'list'] as const,
    list: (params: ListParams) => [...queryKeys.branches.lists(), params] as const,
    detail: (id: string) => [...queryKeys.branches.all, 'detail', id] as const,
    staffing: () => [...queryKeys.branches.all, 'staffing'] as const,
    options: () => [...queryKeys.branches.all, 'options'] as const,
  },

  deployments: {
    all: ['deployments'] as const,
    lists: () => [...queryKeys.deployments.all, 'list'] as const,
    list: (params: ListParams) => [...queryKeys.deployments.lists(), params] as const,
    detail: (id: string) => [...queryKeys.deployments.all, 'detail', id] as const,
    history: (id: string) =>
      [...queryKeys.deployments.all, 'detail', id, 'history'] as const,
  },

  users: {
    all: ['users'] as const,
    list: (params: ListParams) => [...queryKeys.users.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
  },

  audit: {
    all: ['audit'] as const,
    list: (params: ListParams) => [...queryKeys.audit.all, 'list', params] as const,
    activity: (params: ListParams) => [...queryKeys.audit.all, 'activity', params] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: () => [...queryKeys.notifications.all, 'list'] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unread-count'] as const,
  },

  reports: {
    all: ['reports'] as const,
    dashboard: () => [...queryKeys.reports.all, 'dashboard'] as const,
    funnel: (params: ListParams) => [...queryKeys.reports.all, 'funnel', params] as const,
    recruitment: (params: ListParams) =>
      [...queryKeys.reports.all, 'recruitment', params] as const,
    deployment: (params: ListParams) =>
      [...queryKeys.reports.all, 'deployment', params] as const,
  },

  config: {
    all: ['config'] as const,
    positions: (params: ListParams = {}) =>
      [...queryKeys.config.all, 'positions', params] as const,
    publicPositions: () => [...queryKeys.config.all, 'positions', 'public'] as const,
    ranks: (params: ListParams = {}) =>
      [...queryKeys.config.all, 'ranks', params] as const,
    ranksForPosition: (positionId: string) =>
      [...queryKeys.config.all, 'ranks', 'for-position', positionId] as const,
    rankPositions: (rankId: string) =>
      [...queryKeys.config.all, 'rank-positions', rankId] as const,
    roles: () => [...queryKeys.config.all, 'roles'] as const,
    permissions: () => [...queryKeys.config.all, 'permissions'] as const,
    rolePermissions: () => [...queryKeys.config.all, 'role-permissions'] as const,
  },

  cms: {
    all: ['cms'] as const,
    testimonials: (publishedOnly: boolean) =>
      [...queryKeys.cms.all, 'testimonials', publishedOnly] as const,
    clients: (publishedOnly: boolean) =>
      [...queryKeys.cms.all, 'clients', publishedOnly] as const,
    accreditations: (publishedOnly: boolean) =>
      [...queryKeys.cms.all, 'accreditations', publishedOnly] as const,
    news: (publishedOnly: boolean, limit?: number) =>
      [...queryKeys.cms.all, 'news', publishedOnly, limit ?? 'all'] as const,
    newsPost: (slug: string) => [...queryKeys.cms.all, 'news', 'post', slug] as const,
    media: () => [...queryKeys.cms.all, 'media'] as const,
  },

  settings: {
    all: ['settings'] as const,
    list: () => [...queryKeys.settings.all, 'list'] as const,
    public: () => [...queryKeys.settings.all, 'public'] as const,
  },
} as const
