import { useEffect, useRef, useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
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
 * Keeps a staff form's unsaved answers in localStorage, so a refresh, a crashed
 * tab or a click away to another page does not cost the work. The staff-side
 * sibling of `useFormDraft` (the public application form).
 *
 * Most staff forms live in a dialog, and a reload closes the dialog — so
 * restoring values alone is not enough. The draft also records *which* dialog
 * was open (create, or edit of record X), and on the next visit `onResume`
 * reopens it before the values are laid back over it.
 *
 * Lifecycle of a draft:
 *   - written (debounced) only when the user changes a field — opening a dialog,
 *     which resets the form, never writes one;
 *   - flushed immediately on `pagehide`, so the last keystrokes before F5 count;
 *   - deleted when the dialog closes, whether by a successful save or by a
 *     deliberate Cancel — both are decisions about the work;
 *   - kept when the page unmounts with the dialog still open, so navigating away
 *     and back resumes it.
 *
 * Privacy: staff forms carry personal data, so drafts are keyed by the signed-in
 * user (another account on the same browser never sees them), expire after
 * `maxAgeMs`, and are all wiped by a deliberate sign-out (`clearAllDrafts` in lib/draftStorage).
 * An expired session keeps them — signing back in should resume the work.
 * Never pass password fields through; list them in `omit`.
 */

const SAVE_DEBOUNCE_MS = 400
const DEFAULT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
const NO_OMISSIONS: readonly never[] = []

interface Options<T extends FieldValues> {
  /** Stable name for this form, unique across the app, e.g. `'branches'`. */
  id: string
  form: UseFormReturn<T>
  /** Whether the form is on screen. A form that is always visible passes true. */
  open: boolean
  /** The record being edited, or null when creating. */
  recordId: string | null
  /**
   * Reopens the dialog for a draft found on load — `openCreate()` for null,
   * `openEdit(record)` otherwise. Return false when the record no longer exists;
   * the draft is then dropped. Called at most once, after `ready`.
   */
  onResume?: (recordId: string | null) => boolean | void
  /**
   * False until whatever `onResume` and the form's own initial values depend on
   * has loaded (usually the list query). Default true.
   */
  ready?: boolean
  /** Field names never written to storage — passwords above all. Stable reference. */
  omit?: readonly (keyof T)[]
  maxAgeMs?: number
}

export interface DialogDraftState {
  /** When unsaved changes were restored into the open form, their save time. */
  restoredAt: string | null
  /** Throws the restored changes away: back to the record (or blank) form. */
  discard: () => void
  /** Deletes the stored draft without touching the form — for always-open forms after a save. */
  clear: () => void
}

export function useDialogDraft<T extends FieldValues>({
  id,
  form,
  open,
  recordId,
  onResume,
  ready = true,
  omit = NO_OMISSIONS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: Options<T>): DialogDraftState {
  const { user } = useAuth()
  const key = user ? `${DRAFT_PREFIX}${user.id}:${id}` : null

  const [restoredAt, setRestoredAt] = useState<string | null>(null)

  // The draft found on load, waiting to be applied. A ref, not state: it is
  // consumed by effects and never rendered.
  const pending = useRef<StoredDraft | null>(null)
  const loadedFor = useRef<string | null>(null)
  const resumed = useRef(false)

  const onResumeRef = useRef(onResume)
  useEffect(() => {
    onResumeRef.current = onResume
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

  // --- reopen the dialog the draft belongs to -------------------------------
  useEffect(() => {
    const draft = pending.current
    if (!key || !draft || !ready || resumed.current) return
    resumed.current = true

    // Already showing the right form (an always-open form, or the user got
    // there first) — nothing to reopen.
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

    // keepDefaultValues: the record's own values stay the baseline, so the form
    // reads as dirty and the dialog still asks before throwing the work away.
    form.reset({ ...form.getValues(), ...draft.values } as T, { keepDefaultValues: true })
    setRestoredAt(draft.savedAt)
    // `form` is stable for the lifetime of its component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, open, recordId])

  // --- save on user edits ----------------------------------------------------
  useEffect(() => {
    if (!key || !open) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty: T | null = null
    const startedIn = draftGeneration()

    const persist = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
      if (!dirty || startedIn !== draftGeneration()) return
      const stored: Record<string, unknown> = { ...dirty }
      for (const field of omit) delete stored[field as string]
      writeDraft(key, { recordId, values: stored, savedAt: new Date().toISOString() })
      dirty = null
    }

    const subscription = form.watch((values, info) => {
      // `reset()` notifies watchers with no field name; only real edits
      // (typing, selecting, setValue) carry one.
      if (!info.name) return
      // A draft still waiting to be applied must not be overwritten by an
      // unrelated dialog the user opened in the meantime.
      if (pending.current) return
      dirty = values as T
      if (timer) clearTimeout(timer)
      timer = setTimeout(persist, SAVE_DEBOUNCE_MS)
    })

    window.addEventListener('pagehide', persist)
    return () => {
      // Flushed rather than dropped: unmounting with the dialog open (clicking
      // to another page) should keep the last edits.
      persist()
      window.removeEventListener('pagehide', persist)
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open, recordId, omit])

  // --- closing the dialog ends the draft -----------------------------------
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open && key) {
      removeDraft(key)
      setRestoredAt(null)
    }
    wasOpen.current = open
  }, [open, key])

  return {
    restoredAt,
    discard: () => {
      if (key) removeDraft(key)
      setRestoredAt(null)
      form.reset(form.formState.defaultValues as T)
    },
    clear: () => {
      if (key) removeDraft(key)
      setRestoredAt(null)
    },
  }
}
