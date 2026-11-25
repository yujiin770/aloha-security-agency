import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { zodResolver } from '@/lib/zodResolver'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { DraftNotice } from '@/components/ui/DraftNotice'
import { errorMessage } from '@/lib/errors'
import { useDialogDraft } from '@/hooks/useDialogDraft'
import type { PdsFields } from '@/types/database.types'
import { PdsFormSections } from './PdsFormSections'
import {
  ALL_PDS_SECTIONS,
  pdsFromRow,
  pdsSchema,
  pdsToPatch,
  type PdsFormValues,
} from './pdsSchema'

/**
 * Edits a Personal Data Sheet — an applicant's or a guard's. The caller
 * supplies the save (updateApplicant / updatePersonnel) and what to refresh.
 */
export function EditPdsDialog({
  open,
  draftId,
  recordId,
  record,
  description,
  onSave,
  onSaved,
  onClose,
  onResume,
}: {
  open: boolean
  /** Unique per record kind, e.g. `pds.personnel`. */
  draftId: string
  recordId: string
  record: PdsFields
  description?: string
  onSave: (patch: Partial<PdsFields>) => Promise<unknown>
  onSaved: () => void
  onClose: () => void
  onResume?: () => void
}) {
  const toast = useToast()
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

  const save = useMutation({
    mutationFn: (values: PdsFormValues) => onSave(pdsToPatch(values)),
    onSuccess: () => {
      toast.success('Personal Data Sheet saved')
      onSaved()
      onClose()
    },
    onError: (error) => toast.error('Could not save changes', errorMessage(error)),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      confirmClose={form.formState.isDirty}
      size="xl"
      title="Edit Personal Data Sheet"
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((values) => save.mutate(values))}
            isLoading={save.isPending}
            disabled={!form.formState.isDirty}
          >
            Save changes
          </Button>
        </>
      }
    >
      <DraftNotice restoredAt={draft.restoredAt} onDiscard={draft.discard} />
      <form noValidate onSubmit={(e) => e.preventDefault()}>
        <PdsFormSections form={form} sections={ALL_PDS_SECTIONS} />
      </form>
    </Modal>
  )
}
