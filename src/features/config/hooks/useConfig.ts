import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import type { PositionRow, RankRow, ToneToken } from '@/types/database.types'
import * as api from '../api/configApi'

/**
 * Configuration data changes rarely and is read on almost every screen — the
 * apply form, every applicant table, every badge. A long stale time keeps it
 * out of the request path without making edits feel unresponsive, because the
 * mutations below invalidate the whole `config` key on success.
 */
const CONFIG_STALE_TIME = 5 * 60_000

export function usePositions(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.config.positions({ includeInactive }),
    queryFn: () => api.listPositions(includeInactive),
    staleTime: CONFIG_STALE_TIME,
  })
}

export function usePublicPositions() {
  return useQuery({
    queryKey: queryKeys.config.publicPositions(),
    queryFn: api.listPublicPositions,
    staleTime: CONFIG_STALE_TIME,
  })
}

export function useRanks(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.config.ranks({ includeInactive }),
    queryFn: () => api.listRanks(includeInactive),
    staleTime: CONFIG_STALE_TIME,
  })
}

export function useRanksForPosition(positionId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.config.ranksForPosition(positionId ?? ''),
    queryFn: () => api.listRanksForPosition(positionId!),
    enabled: Boolean(positionId),
    staleTime: CONFIG_STALE_TIME,
  })
}

export function useRankPositions(rankId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.config.rankPositions(rankId ?? ''),
    queryFn: () => api.getRankPositions(rankId!),
    enabled: Boolean(rankId),
  })
}

/**
 * Every configuration mutation invalidates the whole `config` key.
 *
 * Renaming a position changes what a dozen unrelated screens render, so
 * surgical invalidation would be a long list of chances to miss one.
 */
function useConfigMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.config.all }),
  })
}

export function useCreatePosition() {
  return useConfigMutation(api.createPosition)
}

export function useUpdatePosition() {
  return useConfigMutation(
    ({ id, patch }: { id: string; patch: Partial<api.PositionInput> }) =>
      api.updatePosition(id, patch),
  )
}

export function useDeletePosition() {
  return useConfigMutation(api.deletePosition)
}

export function useCreateRank() {
  return useConfigMutation(api.createRank)
}

export function useUpdateRank() {
  return useConfigMutation(
    ({ id, patch }: { id: string; patch: Partial<api.RankInput> }) =>
      api.updateRank(id, patch),
  )
}

export function useDeleteRank() {
  return useConfigMutation(api.deleteRank)
}

export function useSetRankPositions() {
  return useConfigMutation(
    ({ rankId, positionIds }: { rankId: string; positionIds: string[] }) =>
      api.setRankPositions(rankId, positionIds),
  )
}

/* -------------------------------------------------------------------------- */
/* Roles and permissions                                                       */
/* -------------------------------------------------------------------------- */

export function useRoles() {
  return useQuery({
    queryKey: queryKeys.config.roles(),
    queryFn: api.listRoles,
    staleTime: CONFIG_STALE_TIME,
  })
}

export function usePermissions() {
  return useQuery({
    queryKey: queryKeys.config.permissions(),
    queryFn: api.listPermissions,
    staleTime: CONFIG_STALE_TIME,
  })
}

export function useRolePermissions() {
  return useQuery({
    queryKey: queryKeys.config.rolePermissions(),
    queryFn: api.listRolePermissions,
    staleTime: CONFIG_STALE_TIME,
  })
}

export function useUpdateRole() {
  return useConfigMutation(
    ({ key, patch }: { key: string; patch: Partial<api.RoleInput> }) =>
      api.updateRole(key, patch),
  )
}

export function useCreateRole() {
  return useConfigMutation(api.createRole)
}

export function useDeleteRole() {
  return useConfigMutation(api.deleteRole)
}

/**
 * Optimistic, and scoped to the one key it changes.
 *
 * The permission matrix is ~11 rows × however many roles exist, and every cell
 * shares this mutation. Waiting for a round trip plus a full config refetch
 * before the tick moved made the grid feel broken — the click appeared to do
 * nothing, so people clicked again. The cache is patched immediately and rolled
 * back if the write fails.
 */
export function useTogglePermission() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      roleKey,
      permissionKey,
      grant,
    }: {
      roleKey: string
      permissionKey: string
      grant: boolean
    }) =>
      grant
        ? api.grantPermission(roleKey, permissionKey)
        : api.revokePermission(roleKey, permissionKey),

    onMutate: async ({ roleKey, permissionKey, grant }) => {
      const key = queryKeys.config.rolePermissions()
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Record<string, string[]>>(key)

      qc.setQueryData<Record<string, string[]>>(key, (current) => {
        const next = { ...(current ?? {}) }
        const held = next[roleKey] ?? []
        next[roleKey] = grant
          ? held.includes(permissionKey)
            ? held
            : [...held, permissionKey]
          : held.filter((p) => p !== permissionKey)
        return next
      })

      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.config.rolePermissions(), context.previous)
      }
    },

    onSettled: () =>
      qc.invalidateQueries({ queryKey: queryKeys.config.rolePermissions() }),
  })
}

/* -------------------------------------------------------------------------- */
/* Lookup helpers                                                              */
/* -------------------------------------------------------------------------- */

export interface PositionLookup {
  byId: (id: string | null | undefined) => PositionRow | undefined
  name: (id: string | null | undefined) => string
  tone: (id: string | null | undefined) => ToneToken
  options: { value: string; label: string }[]
  isLoading: boolean
}

/**
 * Replaces the old `positionMeta()` constant lookup.
 *
 * Screens that render a position badge from an id use this; screens reading a
 * view already receive `position_name` and `position_tone` joined in and do not
 * need it.
 */
export function usePositionLookup(includeInactive = true): PositionLookup {
  const { data, isLoading } = usePositions(includeInactive)
  const positions = data ?? []
  const map = new Map(positions.map((p) => [p.id, p]))

  return {
    byId: (id) => (id ? map.get(id) : undefined),
    name: (id) => (id ? (map.get(id)?.name ?? '—') : '—'),
    tone: (id) => (id ? (map.get(id)?.tone ?? 'neutral') : 'neutral'),
    options: positions.map((p) => ({ value: p.id, label: p.name })),
    isLoading,
  }
}

export function useRankLookup(includeInactive = true) {
  const { data, isLoading } = useRanks(includeInactive)
  const ranks = data ?? []
  const map = new Map(ranks.map((r) => [r.id, r]))

  return {
    byId: (id: string | null | undefined) => (id ? map.get(id) : undefined),
    name: (id: string | null | undefined) => (id ? (map.get(id)?.name ?? '—') : '—'),
    options: ranks.map((r: RankRow) => ({ value: r.id, label: r.name })),
    isLoading,
  }
}
