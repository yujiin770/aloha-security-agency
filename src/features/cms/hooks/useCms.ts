import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import * as api from '../api/cmsApi'

/**
 * Website content hooks.
 *
 * Public reads get a long stale time — marketing content changes a few times a
 * year, and refetching a testimonial list on every navigation is pure waste.
 * Admin reads stay fresh so an editor sees their own change immediately.
 */
const PUBLIC_STALE_TIME = 5 * 60_000

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export function useTestimonials(publishedOnly = false) {
  return useQuery({
    queryKey: queryKeys.cms.testimonials(publishedOnly),
    queryFn: () => api.listTestimonials(publishedOnly),
    staleTime: publishedOnly ? PUBLIC_STALE_TIME : 0,
  })
}

export function useClients(publishedOnly = false) {
  return useQuery({
    queryKey: queryKeys.cms.clients(publishedOnly),
    queryFn: () => api.listClients(publishedOnly),
    staleTime: publishedOnly ? PUBLIC_STALE_TIME : 0,
  })
}

export function useAccreditations(publishedOnly = false) {
  return useQuery({
    queryKey: queryKeys.cms.accreditations(publishedOnly),
    queryFn: () => api.listAccreditations(publishedOnly),
    staleTime: publishedOnly ? PUBLIC_STALE_TIME : 0,
  })
}

export function useNewsPosts(publishedOnly = false, limit?: number) {
  return useQuery({
    queryKey: queryKeys.cms.news(publishedOnly, limit),
    queryFn: () => api.listNewsPosts(publishedOnly, limit),
    staleTime: publishedOnly ? PUBLIC_STALE_TIME : 0,
  })
}

export function useNewsPost(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cms.newsPost(slug ?? ''),
    queryFn: () => api.getNewsPost(slug!),
    enabled: Boolean(slug),
  })
}

export function useSiteMedia() {
  return useQuery({
    queryKey: queryKeys.cms.media(),
    queryFn: api.listSiteMedia,
    staleTime: PUBLIC_STALE_TIME,
  })
}

/**
 * Resolves a named image slot to a URL, with a graceful fallback chain:
 * CMS upload → bundled `/images/{key}.jpg` → SmartImage's branded panel.
 *
 * Returning the bundled path rather than null is what lets a site that has
 * never been touched by an editor still look finished.
 */
export function useMediaSlot(key: string) {
  const { data } = useSiteMedia()
  const slot = data?.find((item) => item.key === key)

  return {
    src: api.mediaUrl(slot?.storage_path, slot?.bucket_id) ?? `/images/${key}.jpg`,
    alt: slot?.alt_text ?? '',
    width: slot?.width ?? 1200,
    height: slot?.height ?? 800,
  }
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every content mutation invalidates the whole `cms` key.
 *
 * Publishing a testimonial changes both the admin list and the public one, and
 * the two are cached under different keys. Invalidating the branch is one line;
 * enumerating the pairs is a list that eventually misses one.
 */
function useCmsMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cms.all }),
  })
}

export function useUploadMedia() {
  return useMutation({
    mutationFn: ({ file, folder }: { file: File; folder: string }) =>
      api.uploadMedia(file, folder),
  })
}

export function useUpdateSiteMedia() {
  return useCmsMutation(
    ({
      key,
      patch,
    }: {
      key: string
      patch: { storage_path?: string | null; alt_text?: string | null }
    }) => api.updateSiteMedia(key, patch),
  )
}

export function useCreateTestimonial() {
  return useCmsMutation(api.createTestimonial)
}
export function useUpdateTestimonial() {
  return useCmsMutation(
    ({ id, patch }: { id: string; patch: Partial<api.TestimonialInput> }) =>
      api.updateTestimonial(id, patch),
  )
}
export function useDeleteTestimonial() {
  return useCmsMutation(api.deleteTestimonial)
}

export function useCreateClient() {
  return useCmsMutation(api.createClient)
}
export function useUpdateClient() {
  return useCmsMutation(
    ({ id, patch }: { id: string; patch: Partial<api.ClientInput> }) =>
      api.updateClient(id, patch),
  )
}
export function useDeleteClient() {
  return useCmsMutation(api.deleteClient)
}

export function useCreateAccreditation() {
  return useCmsMutation(api.createAccreditation)
}
export function useUpdateAccreditation() {
  return useCmsMutation(
    ({ id, patch }: { id: string; patch: Partial<api.AccreditationInput> }) =>
      api.updateAccreditation(id, patch),
  )
}
export function useDeleteAccreditation() {
  return useCmsMutation(api.deleteAccreditation)
}

export function useCreateNewsPost() {
  return useCmsMutation(api.createNewsPost)
}
export function useUpdateNewsPost() {
  return useCmsMutation(
    ({ id, patch }: { id: string; patch: Partial<api.NewsPostInput> }) =>
      api.updateNewsPost(id, patch),
  )
}
export function useDeleteNewsPost() {
  return useCmsMutation(api.deleteNewsPost)
}
