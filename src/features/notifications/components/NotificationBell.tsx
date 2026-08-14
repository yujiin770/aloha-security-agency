import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CheckCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  useDeleteNotification,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '../hooks/useNotifications'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const { data: unread = 0 } = useUnreadCount()
  const { data: notifications = [], isLoading } = useNotifications()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()
  const remove = useDeleteNotification()

  // Close on outside click or Escape — a panel you can't dismiss with the
  // keyboard is a trap for anyone not using a mouse.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
        }
        className="relative"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 flex max-h-[28rem] w-80 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--shadow-overlay)] sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--app-text)]">
                Notifications
              </h2>
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllRead.mutate()}
                  isLoading={markAllRead.isPending}
                  leftIcon={<CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Mark all read
                </Button>
              )}
            </div>

            <div className="scrollbar-slim flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--app-text-muted)]">
                  Loading…
                </p>
              ) : notifications.length === 0 ? (
                <EmptyState
                  title="You're all caught up"
                  description="Applicant and deployment activity will appear here."
                  className="py-10"
                />
              ) : (
                <ul>
                  {notifications.map((n) => {
                    const body = (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'text-sm leading-snug',
                              n.read_at
                                ? 'text-[var(--app-text-muted)]'
                                : 'font-medium text-[var(--app-text)]',
                            )}
                          >
                            {n.title}
                          </p>
                          {!n.read_at && (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                        {n.body && (
                          <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-[var(--app-text-subtle)]">
                          {formatRelative(n.created_at)}
                        </p>
                      </>
                    )

                    return (
                      <li
                        key={n.id}
                        className="group relative border-b border-[var(--app-border)] last:border-0"
                      >
                        {n.link ? (
                          <Link
                            to={n.link}
                            onClick={() => {
                              if (!n.read_at) markRead.mutate(n.id)
                              setOpen(false)
                            }}
                            className="block px-4 py-3 pr-9 hover:bg-[var(--app-bg)]"
                          >
                            {body}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => !n.read_at && markRead.mutate(n.id)}
                            className="block w-full px-4 py-3 pr-9 text-left hover:bg-[var(--app-bg)]"
                          >
                            {body}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => remove.mutate(n.id)}
                          aria-label="Dismiss notification"
                          className="absolute top-3 right-2 rounded p-1 text-[var(--app-text-subtle)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--app-text)]"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
