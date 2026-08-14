import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Toast notifications.
 *
 * The viewport is an aria-live region so screen readers announce results of
 * actions (saved, failed) that are otherwise only visible. Errors use
 * `role="alert"` for immediate announcement; successes are polite.
 */

type ToastTone = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const TONE_STYLES: Record<ToastTone, { icon: ReactNode; ring: string }> = {
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />,
    ring: 'border-l-success',
  },
  error: {
    icon: <XCircle className="h-5 w-5 text-danger" aria-hidden="true" />,
    ring: 'border-l-danger',
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />,
    ring: 'border-l-warning',
  },
  info: {
    icon: <Info className="h-5 w-5 text-info" aria-hidden="true" />,
    ring: 'border-l-info',
  },
}

const DURATIONS: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  // Errors stay long enough to be read and acted on.
  error: 8000,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current.slice(-3), { ...input, id }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATIONS[input.tone]),
      )
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      warning: (title, description) => toast({ tone: 'warning', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 p-3.5',
                'border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--shadow-raised)]',
                TONE_STYLES[t.tone].ring,
              )}
            >
              <div className="mt-0.5 shrink-0">{TONE_STYLES[t.tone].icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--app-text)]">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-[var(--app-text-subtle)] hover:text-[var(--app-text)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
