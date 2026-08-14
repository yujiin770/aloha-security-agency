import { useEffect } from 'react'
import { APP_NAME } from '@/lib/env'

/**
 * Sets the document title and meta description for a route.
 *
 * A deliberately small alternative to react-helmet: this app has a handful of
 * public routes and no SSR, so a hook that writes two tags is the whole
 * requirement. It restores the previous values on unmount, which keeps
 * client-side navigation from leaving a stale description behind.
 *
 * Note: structured data (JSON-LD) is intentionally absent. `script-src 'self'`
 * in the CSP blocks inline `application/ld+json`, and weakening a security
 * header on a site handling applicant PII is a poor trade for rich snippets.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title.includes(APP_NAME) ? title : `${title} — ${APP_NAME}`

    let previousDescription: string | null = null
    let tag: HTMLMetaElement | null = null

    if (description) {
      tag = document.querySelector('meta[name="description"]')
      if (tag) {
        previousDescription = tag.getAttribute('content')
        tag.setAttribute('content', description)
      }
    }

    return () => {
      document.title = previousTitle
      if (tag && previousDescription !== null) {
        tag.setAttribute('content', previousDescription)
      }
    }
  }, [title, description])
}
