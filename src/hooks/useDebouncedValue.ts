import { useEffect, useState } from 'react'

/**
 * Delays propagating a rapidly-changing value.
 *
 * Used by every search box in the admin app so a query isn't fired on each
 * keystroke — at 25 rows a page against a server-side `ilike`, that difference
 * is the whole cost of the feature.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
