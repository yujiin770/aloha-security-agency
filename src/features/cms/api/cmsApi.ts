import { supabase, BUCKETS } from '@/lib/supabase'
import { toAppError, AppError } from '@/lib/errors'
import type {
  AccreditationRow,
  ClientRow,
  NewsPostRow,
  SiteMediaRow,
  TestimonialRow,
} from '@/types/database.types'

/**
 * Website content repository.
 *
 * Everything the marketing site shows that isn't structural — testimonials,
 * client logos, accreditations, news and the image slots.
 *
 * Note the read functions take a `publishedOnly` flag. The public site passes
 * true, the admin passes false. That is a convenience, not the security
 * boundary: RLS already refuses unpublished rows to anyone without a staff
 * session, so a tampered client gets nothing extra.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]

/* -------------------------------------------------------------------------- */
/* Media                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a stored path to a URL the browser can load.
 *
 * Accepts three shapes so call sites don't have to care which they hold:
 *   - already a URL (http…)          → returned unchanged
 *   - a bundled asset (/images/x.jpg) → returned unchanged
 *   - a storage object key            → resolved to its public URL
 *
 * `company-assets` is a public bucket, so marketing images need no signed URL
 * and no per-render round trip.
 */
export function mediaUrl(
  path: string | null | undefined,
  bucket: string = BUCKETS.companyAssets,
): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('/')) return path

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

function extensionOf(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? (parts.pop() ?? 'bin').toLowerCase() : 'bin'
}

/**
 * Uploads an image to the public brand bucket and returns its object key.
 *
 * The key is server-generated rather than taken from the filename: user-supplied
 * names are an injection surface, and two people uploading `logo.png` should not
 * collide.
 */
export async function uploadMedia(file: File, folder: string): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError('That image is larger than the 5 MB limit.')
  }
  if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new AppError('Upload a JPG, PNG, WebP or SVG image.')
  }

  const path = `${folder}/${crypto.randomUUID()}.${extensionOf(file.name)}`

  const { error } = await supabase.storage
    .from(BUCKETS.companyAssets)
    .upload(path, file, { cacheControl: '31536000', upsert: false })

  if (error) throw toAppError(error, 'Could not upload that image.')
  return path
}

export async function deleteMedia(path: string | null | undefined): Promise<void> {
  // Only remove objects we own — a bundled asset or external URL is not ours.
  if (!path || path.startsWith('/') || path.startsWith('http')) return
  await supabase.storage.from(BUCKETS.companyAssets).remove([path])
}

/* -------------------------------------------------------------------------- */
/* Site media slots                                                            */
/* -------------------------------------------------------------------------- */

export async function listSiteMedia(): Promise<SiteMediaRow[]> {
  const { data, error } = await supabase
    .from('site_media')
    .select('*')
    .order('sort_order')

  if (error) throw toAppError(error, 'Could not load site images.')
  return data ?? []
}

export async function updateSiteMedia(
  key: string,
  patch: Partial<Pick<SiteMediaRow, 'storage_path' | 'alt_text'>>,
): Promise<SiteMediaRow> {
  const { data, error } = await supabase
    .from('site_media')
    .update(patch)
    .eq('key', key)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that image.')
  return data
}

/* -------------------------------------------------------------------------- */
/* Testimonials                                                                */
/* -------------------------------------------------------------------------- */

export async function listTestimonials(publishedOnly = false): Promise<TestimonialRow[]> {
  let query = supabase.from('testimonials').select('*').order('sort_order')
  if (publishedOnly) query = query.eq('is_published', true)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load testimonials.')
  return data ?? []
}

export type TestimonialInput = Omit<
  TestimonialRow,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>

export async function createTestimonial(
  input: TestimonialInput,
): Promise<TestimonialRow> {
  const { data, error } = await supabase
    .from('testimonials')
    .insert({ ...input, created_by: null })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that testimonial.')
  return data
}

export async function updateTestimonial(
  id: string,
  patch: Partial<TestimonialInput>,
): Promise<TestimonialRow> {
  const { data, error } = await supabase
    .from('testimonials')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that testimonial.')
  return data
}

export async function deleteTestimonial(row: TestimonialRow): Promise<void> {
  const { error } = await supabase.from('testimonials').delete().eq('id', row.id)
  if (error) throw toAppError(error, 'Could not delete that testimonial.')
  await deleteMedia(row.avatar_path)
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

export async function listClients(publishedOnly = false): Promise<ClientRow[]> {
  let query = supabase.from('clients').select('*').order('sort_order')
  if (publishedOnly) query = query.eq('is_published', true)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load clients.')
  return data ?? []
}

export type ClientInput = Omit<
  ClientRow,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>

export async function createClient(input: ClientInput): Promise<ClientRow> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, created_by: null })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that client.')
  return data
}

export async function updateClient(
  id: string,
  patch: Partial<ClientInput>,
): Promise<ClientRow> {
  const { data, error } = await supabase
    .from('clients')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that client.')
  return data
}

export async function deleteClient(row: ClientRow): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', row.id)
  if (error) throw toAppError(error, 'Could not delete that client.')
  await deleteMedia(row.logo_path)
}

/* -------------------------------------------------------------------------- */
/* Accreditations                                                              */
/* -------------------------------------------------------------------------- */

export async function listAccreditations(
  publishedOnly = false,
): Promise<AccreditationRow[]> {
  let query = supabase.from('accreditations').select('*').order('sort_order')
  if (publishedOnly) query = query.eq('is_published', true)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load accreditations.')
  return data ?? []
}

export type AccreditationInput = Omit<
  AccreditationRow,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>

export async function createAccreditation(
  input: AccreditationInput,
): Promise<AccreditationRow> {
  const { data, error } = await supabase
    .from('accreditations')
    .insert({ ...input, created_by: null })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that accreditation.')
  return data
}

export async function updateAccreditation(
  id: string,
  patch: Partial<AccreditationInput>,
): Promise<AccreditationRow> {
  const { data, error } = await supabase
    .from('accreditations')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that accreditation.')
  return data
}

export async function deleteAccreditation(row: AccreditationRow): Promise<void> {
  const { error } = await supabase.from('accreditations').delete().eq('id', row.id)
  if (error) throw toAppError(error, 'Could not delete that accreditation.')
  await deleteMedia(row.logo_path)
}

/* -------------------------------------------------------------------------- */
/* News                                                                        */
/* -------------------------------------------------------------------------- */

export async function listNewsPosts(
  publishedOnly = false,
  limit?: number,
): Promise<NewsPostRow[]> {
  let query = supabase
    .from('news_posts')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (publishedOnly) query = query.eq('is_published', true)
  if (limit) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw toAppError(error, 'Could not load news posts.')
  return data ?? []
}

export async function getNewsPost(slug: string): Promise<NewsPostRow | null> {
  const { data, error } = await supabase
    .from('news_posts')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw toAppError(error, 'Could not load that post.')
  return data
}

export type NewsPostInput = Omit<
  NewsPostRow,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>

export async function createNewsPost(input: NewsPostInput): Promise<NewsPostRow> {
  const { data, error } = await supabase
    .from('news_posts')
    .insert({ ...input, created_by: null })
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that post.')
  return data
}

export async function updateNewsPost(
  id: string,
  patch: Partial<NewsPostInput>,
): Promise<NewsPostRow> {
  const { data, error } = await supabase
    .from('news_posts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toAppError(error, 'Could not save that post.')
  return data
}

export async function deleteNewsPost(row: NewsPostRow): Promise<void> {
  const { error } = await supabase.from('news_posts').delete().eq('id', row.id)
  if (error) throw toAppError(error, 'Could not delete that post.')
  await deleteMedia(row.cover_path)
}
