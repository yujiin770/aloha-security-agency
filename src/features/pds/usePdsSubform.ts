import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zodResolver'
import { useDialogDraft } from '@/hooks/useDialogDraft'
import type { PdsFields } from '@/types/database.types'
import { pdsFromRow, pdsSchema, type PdsFormValues } from './pdsSchema'

/**
 * The Personal Data Sheet as part of a larger edit dialog, so a person's
 * details and their PDS are edited — and saved — together instead of through
 * two separate buttons. The caller renders <PdsFormSections form={pds.form} />
 * and folds `pdsToPatch(pds.form.getValues())` into its own update.
 */
export function usePdsSubform({
  record,
  open,
  draftId,
  recordId,
  onResume,
}: {
  record: PdsFields
  open: boolean
  /** Unique per record kind, e.g. `pds.personnel`. */
  draftId: string
  recordId: string
  onResume?: () => void
}) {
  const form = useForm<PdsFormValues>({
    resolver: zodResolver(pdsSchema),
    defaultValues: pdsFromRow(record),
  })

  // Start from the saved record each time the dialog opens. Declared before
  // useDialogDraft so a restored draft is laid over these values, not under them.
  useEffect(() => {
    if (open) form.reset(pdsFromRow(record))
    // Only on opening: a background refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const draft = useDialogDraft({
    id: `${draftId}:${recordId}`,
    form,
    open,
    recordId,
    onResume: () => onResume?.(),
  })

  return { form, draft }
}
