import { useLayoutEffect } from 'react'

/**
 * Puts `.console` on <html> while an admin-side layout is mounted, which swaps
 * the brand scale to the console's navy palette (see index.css).
 *
 * On <html> rather than a wrapper div because dialogs and toasts portal to
 * <body> and would otherwise render in the public site's red. A layout effect
 * so the class lands before the first paint — no red flash on load.
 */
export function useConsoleTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add('console')
    return () => root.classList.remove('console')
  }, [])
}
