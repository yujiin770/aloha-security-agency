import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from './Button'

/**
 * Accessible dialog.
 *
 * Handles the three things a hand-rolled modal usually gets wrong:
 *   - focus moves into the dialog on open and returns to the trigger on close;
 *   - Tab is trapped inside while open;
 *   - Escape closes, and background scroll is locked.
 */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Set false for destructive confirmations that must be answered deliberately. */
  dismissOnOverlayClick?: boolean
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnOverlayClick = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // `onClose` is very often an inline arrow or a plain function declaration in
  // the caller's body, so its identity changes on every parent render. Keeping
  // it in a ref lets the keydown listener and the focus effect below stay
  // stable, which is what stops a controlled input inside the dialog from
  // having focus yanked out from under it on every keystroke.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCloseRef.current()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return

    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => el.offsetParent !== null)
    if (items.length === 0) return

    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement

    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  // Depends on `open` alone. It used to depend on `handleKeyDown`, which
  // depended on `onClose` — so an unmemoised `onClose` from the caller made
  // this effect tear down and re-run on every parent render. The cleanup
  // restores focus to the trigger and the setup re-focuses the first focusable
  // node in the panel, which is the header's close button; typing in a
  // controlled field therefore moved focus to "Close dialog" after every
  // character. Keeping the dependency list to `[open]` means the focus dance
  // happens exactly twice per dialog: once on open, once on close.
  useEffect(() => {
    if (!open) return

    returnFocusRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown, true)

    // Wait a frame so the panel is mounted before we reach into it.
    const raf = requestAnimationFrame(() => {
      // If something inside the panel already holds focus — an autofocused
      // field, or a re-render that happened to land here — leave it alone.
      const active = document.activeElement
      if (active && panelRef.current?.contains(active)) return

      const target =
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current
      target?.focus()
    })

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = previousOverflow
      // The trigger can be gone by now (a row deleted by the dialog itself, a
      // route change); focusing a detached node silently moves focus to body.
      const trigger = returnFocusRef.current
      if (trigger && document.body.contains(trigger)) trigger.focus()
    }
  }, [open, handleKeyDown])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-ink/60"
            onClick={dismissOnOverlayClick ? onClose : undefined}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'relative flex max-h-[90dvh] w-full flex-col overflow-hidden',
              'rounded-[var(--radius-card)] border border-[var(--app-border)]',
              'bg-[var(--app-surface)] shadow-[var(--shadow-overlay)]',
              SIZES[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--app-text)]">
                  {title}
                </h2>
                {description && (
                  <p className="mt-0.5 text-sm text-[var(--app-text-muted)]">
                    {description}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-2 -mt-1 shrink-0"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="scrollbar-slim flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>

            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissOnOverlayClick={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-[var(--app-text-muted)]">{message}</div>
    </Modal>
  )
}
