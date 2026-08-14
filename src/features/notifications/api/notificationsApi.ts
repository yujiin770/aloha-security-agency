import { supabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type { NotificationRow } from '@/types/database.types'

export async function listNotifications(limit = 30): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error, 'Could not load notifications.')
  return data ?? []
}

export async function countUnread(): Promise<number> {
  // `head: true` returns only the count header — no rows over the wire.
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  if (error) throw toAppError(error, 'Could not load notifications.')
  return count ?? 0
}

export async function markRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw toAppError(error, 'Could not update the notification.')
}

export async function markAllRead(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read')
  if (error) throw toAppError(error, 'Could not update notifications.')
  return data ?? 0
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  if (error) throw toAppError(error, 'Could not dismiss the notification.')
}
