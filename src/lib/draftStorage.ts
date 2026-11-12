/**
 * localStorage access for staff form drafts (`useDialogDraft`).
 *
 * Separate from the hook so the auth context can wipe drafts on sign-out
 * without importing a hook that itself imports the auth context.
 */

export const DRAFT_PREFIX = 'aloha:draft:'

export interface StoredDraft {
  recordId: string | null
  values: Record<string, unknown>
  savedAt: string
}

/**
 * Bumped by `clearAllDrafts`. A form still mounted at sign-out flushes its
 * pending edits when it unmounts a moment later; comparing generations stops
 * that flush from writing a draft straight back after the wipe.
 */
let generation = 0

export function draftGeneration(): number {
  return generation
}

export function readDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (!parsed || typeof parsed !== 'object' || !parsed.values) return null
    return parsed
  } catch {
    return null
  }
}

export function writeDraft(key: string, draft: StoredDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    /* quota exceeded or private mode — the form carries on regardless */
  }
}

export function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}

/** Wipes every staff draft on this browser. Called on deliberate sign-out. */
export function clearAllDrafts() {
  generation += 1
  try {
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(DRAFT_PREFIX)) doomed.push(key)
    }
    doomed.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    /* storage unavailable — nothing was stored either */
  }
}
