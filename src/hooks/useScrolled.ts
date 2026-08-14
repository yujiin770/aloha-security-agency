import { useEffect, useState } from 'react'

/**
 * True once the page has scrolled past `threshold` pixels.
 *
 * Drives the header's transparent → solid transition. The listener is passive
 * so it never blocks scrolling, and state is only set when the boolean actually
 * flips — a naive version re-renders the whole header on every scroll frame.
 */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(
    () => typeof window !== 'undefined' && window.scrollY > threshold,
  )

  useEffect(() => {
    function onScroll() {
      setScrolled((current) => {
        const next = window.scrollY > threshold
        return next === current ? current : next
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return scrolled
}
