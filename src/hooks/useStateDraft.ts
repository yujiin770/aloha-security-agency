import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  DRAFT_PREFIX,
  draftGeneration,
  readDraft,
  removeDraft,
  writeDraft,
  type StoredDraft,
} from '@/lib/draftStorage'

/**
 * `useDialogDraft` for forms whose fields live in plain `useState` rather than
 * react-hook-form. Same storage, same lifecycle — see that hook for the full
 * rationale:
 *
 *   - keyed by signed-in user + `id`, expired after `maxAgeMs`, wiped by a
 *     deliberate sign-out;
 *   - written (debounced) only once the values differ from what the dialog
 *     opened with — opening a dialog never writes one;
 *   - flushed on `pagehide` and on unmount, so a refresh or a click away keeps
 *     the last edits;
 *   - deleted when the dialog closes (saved or cancelled);
 *   - on load, `onResume` reopens the dialog, then `apply` lays the values back.
 *
 * `values` is a plain object of the fields, rebuilt each render; it must be
 * JSON-serialisable (strings, numbers, booleans, plain objects).
 */

const SAVE_DEBOUNCE_MS = 400
const DEFAULT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

/** JSON with object keys sorted, so equal values always compare equal. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  )
}

interface Options<T extends Record<string, unknown>> {
  /** Stable name for this form, unique across the app. */
  id: string
  /** Whether the form is on screen. A form that is always visible passes true. */
  open: boolean
  /** The record the dialog acts on, or null. */
  recordId: string | null
  /** The dialog's current field values. */
  values: T
  /** Writes restored (or discarded-to) values back into the useState fields. */
  apply: (values: Partial<T>) => void
  /**
   * Reopens the dialog for a draft found on load. Return false when its record
   * no longer exists; the draft is then dropped. Called at most once, after `ready`.
   */
  onResume?: (recordId: string | null) => boolean | void
  /** False until whatever `onResume` depends on has loaded. Default true. */
  ready?: boolean
  maxAgeMs?: number
}

export interface StateDraftState {
  /** When unsaved changes were restored into the open form, their save time. */
  restoredAt: string | null
  /** Throws the restored changes away: back to what the dialog opened with. */
  discard: () => void
  /** Deletes the stored draft without touching the fields — for always-open forms after a save. */
  clear: () => void
}

export function useStateDraft<T extends Record<string, unknown>>({
  id,
  open,
  recordId,
  values,
  apply,
  onResume,
  ready = true,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: Options<T>): StateDraftState {
  const { user } = useAuth()
  const key = user ? `${DRAFT_PREFIX}${user.id}:${id}` : null
  const json = stable(values)

  const [restoredAt, setRestoredAt] = useState<string | null>(null)

  const pending = useRef<StoredDraft | null>(null)
  const loadedFor = useRef<string | null>(null)
  const resumed = useRef(false)
  /** What the dialog opened with — the "not dirty" state, and where discard returns. */
  const baseline = useRef<{ values: T; json: string } | null>(null)
  /** What storage currently holds for this dialog, or null. */
  const lastWritten = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const persistRef = useRef<() => void>(() => {})

  const latest = useRef({ values, json })
  const onResumeRef = useRef(onResume)
  const applyRef = useRef(apply)
  useEffect(() => {
    latest.current = { values, json }
    onResumeRef.current = onResume
    applyRef.current = apply
  })

  // --- load once the user is known -----------------------------------------
  useEffect(() => {
    if (!key || loadedFor.current === key) return
    loadedFor.current = key
    resumed.current = false

    const draft = readDraft(key)
    if (!draft) return
    const age = Date.now() - new Date(draft.savedAt).getTime()
    if (!Number.isFinite(age) || age > maxAgeMs) {
      removeDraft(key)
      return
    }
    pending.current = draft
  }, [key, maxAgeMs])

  // --- remember what the dialog opened with --------------------------------
  useEffect(() => {
    baseline.current = open ? { ...latest.current } : null
    lastWritten.current = null
  }, [key, open, recordId])

  // --- reopen the dialog the draft belongs to -------------------------------
  useEffect(() => {
    const draft = pending.current
    if (!key || !draft || !ready || resumed.current) return
    resumed.current = true

    if (open && recordId === draft.recordId) return

    if (onResumeRef.current?.(draft.recordId) === false) {
      pending.current = null
      removeDraft(key)
    }
  })

  // --- lay the values over the reopened form --------------------------------
  useEffect(() => {
    const draft = pending.current
    if (!draft || !ready || !open || recordId !== draft.recordId) return
    pending.current = null

    const restored = draft.values as Partial<T>
    applyRef.current(restored)
    // Storage already holds exactly these values; no need to write them again.
    lastWritten.current = stable({ ...latest.current.values, ...restored })
    setRestoredAt(draft.savedAt)
  }, [key, ready, open, recordId])

  // --- persistence while open ----------------------------------------------
  useEffect(() => {
    if (!key || !open) return
    const startedIn = draftGeneration()

    const persist = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = undefined
      // A wipe at sign-out, or a draft still waiting to be applied, wins.
      if (startedIn !== draftGeneration() || pending.current) return

      const current = latest.current
      if (current.json === lastWritten.current) return

      // Edited back to what the dialog opened with: nothing left to keep.
      if (current.json === baseline.current?.json) {
        if (lastWritten.current !== null) removeDraft(key)
        lastWritten.current = null
        return
      }

      writeDraft(key, {
        recordId,
        values: current.values,
        savedAt: new Date().toISOString(),
      })
      lastWritten.current = current.json
    }

    persistRef.current = persist
    window.addEventListener('pagehide', persist)
    return () => {
      // Flushed rather than dropped: unmounting with the dialog open keeps the edits.
      persist()
      persistRef.current = () => {}
      window.removeEventListener('pagehide', persist)
    }
  }, [key, open, recordId])

  // --- schedule a write on change -------------------------------------------
  useEffect(() => {
    if (!open || json === lastWritten.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persistRef.current(), SAVE_DEBOUNCE_MS)
  }, [open, json])

  // --- closing the dialog ends the draft -----------------------------------
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open && key) {
      removeDraft(key)
      lastWritten.current = null
      setRestoredAt(null)
    }
    wasOpen.current = open
  }, [open, key])

  return {
    restoredAt,
    discard: () => {
      if (key) removeDraft(key)
      lastWritten.current = null
      setRestoredAt(null)
      if (baseline.current) apply(baseline.current.values)
    },
    clear: () => {
      if (key) removeDraft(key)
      lastWritten.current = null
      baseline.current = { ...latest.current }
      setRestoredAt(null)
    },
  }
}
