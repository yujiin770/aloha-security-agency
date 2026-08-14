import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '../api/notificationsApi'

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => api.listNotifications(),
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: api.countUnread,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.markRead,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.markAllRead,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteNotification,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  })
}

/**
 * Live notification stream.
 *
 * The server-side filter matters: without it every staff member's channel would
 * receive every INSERT and rely on RLS to drop them, which wastes bandwidth on
 * rows the client will never show. RLS still applies — this just avoids the
 * round trip.
 *
 * Invalidating rather than pushing the payload into the cache keeps one source
 * of truth for ordering and unread counts.
 */
export function useNotificationsRealtime() {
  const { user } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, qc])
}
