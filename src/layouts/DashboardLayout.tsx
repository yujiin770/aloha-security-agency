import { Suspense, useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/Topbar'
import { useNotificationsRealtime } from '@/features/notifications/hooks/useNotifications'
import { useConsoleTheme } from '@/hooks/useConsoleTheme'

import { motion } from 'framer-motion'

/** Per-browser preference only — nothing depends on it surviving. */
const COLLAPSED_KEY = 'aloha.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function DashboardLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  useNotificationsRealtime()
  useConsoleTheme()

  const closeNav = useCallback(() => setNavOpen(false), [])

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* private mode — the toggle still works for this visit */
      }
      return next
    })
  }

  return (
    <div className="flex min-h-dvh bg-[var(--app-bg)]">
      <Sidebar
        mobileOpen={navOpen}
        onClose={closeNav}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />

        <main
          id="admin-main"
          className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <Suspense fallback={
            <div className="flex h-64 flex-col items-center justify-center gap-4">
              {/* Branded loading bar for internal pages */}
              <div className="h-1 w-32 overflow-hidden rounded-full bg-[var(--app-border)]">
                <motion.div
                  className="h-full bg-brand-500"
                  animate={{ x: [-128, 128] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                />
              </div>
              <p className="text-xs text-[var(--app-text-subtle)]">Loading…</p>
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
