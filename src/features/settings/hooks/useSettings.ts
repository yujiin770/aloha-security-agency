import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import type { Json } from '@/types/database.types'
import * as api from '../api/settingsApi'

/**
 * Public settings change rarely and are needed on nearly every public page, so
 * they get a long stale time — refetching company contact details on every
 * navigation would be pure waste.
 */
export function usePublicSettings() {
  return useQuery({
    queryKey: queryKeys.settings.public(),
    queryFn: api.fetchPublicSettings,
    staleTime: 10 * 60_000,
  })
}

export function useAllSettings() {
  return useQuery({
    queryKey: queryKeys.settings.list(),
    queryFn: api.fetchAllSettings,
  })
}

export function useUpdateSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: Json }) =>
      api.updateSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.all }),
  })
}
