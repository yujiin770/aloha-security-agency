import { useEffect, useRef, useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

/**
 * Keeps a react-hook-form's answers in localStorage so a refresh, a closed tab
 * or a flat battery does not cost the user their work.
 *
 * Deliberately narrow:
 *   - values only, never files (a `File` cannot be serialised, and re-reading
 *     one from disk without a fresh user gesture is not something the browser
 *     will allow anyway);
 *   - `omit` lets the caller keep fields out of storage entirely — consent
 *     checkboxes have to be given again, not remembered on the user's behalf;
 *   - every localStorage call is guarded. Safari's private mode throws on
 *     `setItem`, and a form that crashes because it could not save a draft
 *     would be worse than one that never saved.
 *
 * Storage is not a safe place for the volume of personal data an application
 * form collects, so `maxAgeMs` bounds how long it lingers and a successful
 * submit clears it immediately.
 */

interface Draft<T> {
  step: number
  values: Partial<T>
  savedAt: string
}

interface Options<T extends FieldValues> {
  key: string
  form: UseFormReturn<T>
  /** Current wizard step, restored alongside the values. */
  step: number
  onRestoreStep: (step: number) => void
  /** Field names never written to storage. Must be a stable reference. */
  omit?: readonly (keyof T)[]
  /** Drafts older than this are discarded on load. Default 7 days. */
  maxAgeMs?: number
  /** Set false to suspend saving (e.g. after a successful submit). */
  enabled?: boolean
}

interface DraftState {
  /** When a draft was found and applied, the time it was saved. Else null. */
  restoredAt: string | null
  /** Wipes storage and forgets the restore banner. */
  discard: () => void
  /** Wipes storage without touching the form — for use after a real submit. */
  clear: () => void
}

const SAVE_DEBOUNCE_MS = 500
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const NO_OMISSIONS: readonly never[] = []

function readDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Draft<T>
    if (!parsed || typeof parsed !== 'object' || !parsed.values) return null
    return parsed
  } catch {
    return null
  }
}

function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}

export function useFormDraft<T extends FieldValues>({
  key,
  form,
  step,
  onRestoreStep,
  omit = NO_OMISSIONS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  enabled = true,
}: Options<T>): DraftState {
  // Read during the initial render rather than in an effect, so the restore
  // banner is right on the first paint instead of appearing a frame later.
  const [initialDraft] = useState(() => {
    const draft = readDraft<T>(key)
    if (!draft) return null
    const age = Date.now() - new Date(draft.savedAt).getTime()
    if (!Number.isFinite(age) || age > maxAgeMs) {
      removeDraft(key)
      return null
    }
    return draft
  })

  const [discarded, setDiscarded] = useState(false)

  // Assigned inside an effect: mutating a ref during render is not safe under
  // concurrent rendering, and this only needs to be current by the time an
  // event or a later effect reads it.
  const onRestoreStepRef = useRef(onRestoreStep)
  useEffect(() => {
    onRestoreStepRef.current = onRestoreStep
  })

  // --- apply the draft once --------------------------------------------------
  useEffect(() => {
    if (!initialDraft) return

    // `reset` rather than per-field `setValue`: it keeps the form pristine, so
    // restoring a draft does not light up every field's validation state.
    form.reset({ ...form.getValues(), ...initialDraft.values } as T)

    if (typeof initialDraft.step === 'number' && initialDraft.step > 0) {
      onRestoreStepRef.current(initialDraft.step)
    }
    // `form` is stable for the lifetime of the component that created it, and
    // this must run exactly once — re-running would overwrite live typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft])

  // --- save on change, debounced --------------------------------------------
  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const persist = (values: T) => {
      const stored: Record<string, unknown> = { ...values }
      for (const field of omit) delete stored[field as string]

      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            step,
            values: stored,
            savedAt: new Date().toISOString(),
          }),
        )
      } catch {
        /* quota exceeded or private mode — the form carries on regardless */
      }
    }

    // Depending on `step` re-subscribes when the user moves between steps,
    // which is also what keeps the stored step current: a refresh returns them
    // to where they were, not to where they last typed.
    const subscription = form.watch((values) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => persist(values as T), SAVE_DEBOUNCE_MS)
    })

    return () => {
      if (timer) clearTimeout(timer)
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, step, omit])

  const forget = () => {
    removeDraft(key)
    setDiscarded(true)
  }

  return {
    restoredAt: discarded ? null : (initialDraft?.savedAt ?? null),
    clear: forget,
    discard: forget,
  }
}
