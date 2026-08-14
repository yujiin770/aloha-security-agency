import { useSyncExternalStore } from 'react'

/**
 * Whether the browser currently believes it has a network connection.
 *
 * `navigator.onLine` is honest about being offline and optimistic about being
 * online — it reports true for a machine attached to a captive portal or a
 * router with no upstream. So this is the right signal for "don't even try, and
 * say so", and the wrong signal for "the request will definitely succeed".
 * Request failures are still handled on their own terms; see the NETWORK branch
 * in `toAppError`.
 *
 * `useSyncExternalStore` rather than state plus an effect: the connection can
 * change between first render and an effect running, and this reads the live
 * value at every render without a cascading re-render to correct itself.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const getSnapshot = () => navigator.onLine

/** No network in a server render; assume online so nothing renders as broken. */
const getServerSnapshot = () => true

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
