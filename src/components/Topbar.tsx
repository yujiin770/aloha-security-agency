import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, Monitor, Moon, Sun, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { humanize, initials } from '@/utils/format'
import { cn } from '@/utils/cn'

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, signOut } = useAuth()
  const { mode, setMode } = useTheme()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  async function handleSignOut() {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ]

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenNav}
        className="lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <NotificationBell />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--app-bg)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white dark:bg-brand-500">
              {initials(user?.profile.full_name)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[10rem] truncate text-sm font-medium text-[var(--app-text)]">
                {user?.profile.full_name}
              </span>
              <span className="block text-[11px] text-[var(--app-text-subtle)]">
                {humanize(user?.roles[0])}
              </span>
            </span>
            <ChevronDown
              className="h-4 w-4 text-[var(--app-text-subtle)]"
              aria-hidden="true"
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[var(--radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--shadow-overlay)]"
            >
              <div className="border-b border-[var(--app-border)] px-4 py-3">
                <p className="truncate text-sm font-medium text-[var(--app-text)]">
                  {user?.profile.full_name}
                </p>
                <p className="truncate text-xs text-[var(--app-text-muted)]">
                  {user?.email}
                </p>
              </div>

              <div className="p-1">
                <Link
                  to="/admin/settings/profile"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--app-text)] hover:bg-[var(--app-bg)]"
                >
                  <User className="h-4 w-4" aria-hidden="true" />
                  My profile
                </Link>
              </div>

              <div className="border-t border-[var(--app-border)] p-1">
                <p className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase">
                  Appearance
                </p>
                <div className="flex gap-1 px-2 pb-2">
                  {themeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMode(option.value)}
                      aria-pressed={mode === option.value}
                      className={cn(
                        'flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px]',
                        mode === option.value
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300'
                          : 'border-transparent text-[var(--app-text-muted)] hover:bg-[var(--app-bg)]',
                      )}
                    >
                      <option.icon className="h-4 w-4" aria-hidden="true" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[var(--app-border)] p-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-danger hover:bg-danger-soft"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
