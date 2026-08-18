import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/Topbar'
import { useNotificationsRealtime } from '@/features/notifications/hooks/useNotifications'

import { motion } from 'framer-motion'

export function DashboardLayout() {
  const [navOpen, setNavOpen] = useState(false)
  useNotificationsRealtime()

  return (
    <div className="flex min-h-dvh bg-[var(--app-bg)]">
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />

        <main id="admin-main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
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
              <p className="text-xs text-[var(--app-text-subtle)]">Updating view...</p>
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
