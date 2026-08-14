import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/Topbar'
import { LoadingState } from '@/components/ui/Feedback'
import { useNotificationsRealtime } from '@/features/notifications/hooks/useNotifications'

// src/layouts/DashboardLayout.tsx

export function DashboardLayout() {
  const [navOpen, setNavOpen] = useState(false)
  useNotificationsRealtime()

  return (
    // min-h-dvh here allows the sticky sidebar to anchor correctly
    <div className="flex min-h-dvh bg-[var(--app-bg)]">
      <a href="#admin-main" className="skip-link">
        Skip to main content
      </a>

      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />

        <main id="admin-main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
