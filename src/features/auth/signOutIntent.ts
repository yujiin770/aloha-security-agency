/**
 * Remembers that the last sign-out was a deliberate one.
 *
 * `<ProtectedRoute>` attaches the page a user was bounced off to the login
 * redirect, so an expired session returns them where they were. That is the
 * right behaviour for an expiry and the wrong one for a sign-out: clicking
 * "Sign out" on Applicants and signing back in should land on the Dashboard.
 *
 * The two cases are indistinguishable by the time login renders, so the intent
 * has to be recorded when it happens. sessionStorage rather than a module
 * variable because Supabase's sign-out can be followed by a full page load, and
 * it is scoped to the tab, so one tab signing out does not redirect another.
 */

const KEY = 'aloha:deliberate-sign-out'

export function markDeliberateSignOut(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* Private-mode storage denial: falling back to "remember the page" is a
       cosmetic regression, not a failure worth surfacing. */
  }
}

export function wasDeliberateSignOut(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function clearDeliberateSignOut(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* See above. */
  }
}
