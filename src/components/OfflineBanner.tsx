import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useToast } from '@/components/ui/Toast'

/**
 * A persistent strip while the browser is offline, and a toast when the
 * connection comes back.
 *
 * The two are complementary: the strip answers "why did that just fail?" for
 * as long as the problem lasts, and the toast is the one moment worth
 * interrupting for, because it is the cue to retry whatever was abandoned.
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  const toast = useToast()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      return
    }
    if (wasOffline.current) {
      wasOffline.current = false
      toast.success('Back online', 'Your connection has returned. You can try again.')
    }
  }, [online, toast])

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-medium text-ink shadow-md"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>You're offline. Nothing will save until the connection returns.</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
