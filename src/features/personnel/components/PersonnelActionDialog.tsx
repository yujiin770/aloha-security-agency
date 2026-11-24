import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import {
  blocklistPersonnel,
  liftSuspension,
  recordViolation,
  rehirePersonnel,
  separatePersonnel,
  suspendPersonnel,
} from '@/features/personnel/api/personnelApi'
import { COMMON_OFFENSES } from '@/utils/constants'
import { formatDate, fullName, humanize } from '@/utils/format'
import type { DeploymentRow, PersonnelRow } from '@/types/database.types'

export type PersonnelActionKind =
  | 'violation'
  | 'suspend'
  | 'lift'
  | 'resign'
  | 'terminate'
  | 'blocklist'
  | 'rehire'

type OpenDeployment = DeploymentRow & { branch_name: string | null }

interface KindConfig {
  title: string
  confirm: string
  variant: 'primary' | 'danger'
  intro: string
  reasonLabel: string
  reasonPlaceholder: string
  /** Resignation is the only event where the reason may be left blank. */
  reasonRequired: boolean
  dateLabel: string
  success: string
  /** Whether this action ends the person's open deployments. */
  closesDeployments: boolean
}

const CONFIG: Record<PersonnelActionKind, KindConfig> = {
  violation: {
    title: 'Record violation / offense',
    confirm: 'Record violation',
    variant: 'primary',
    intro: 'Adds the offense to this person’s disciplinary record. Their status does not change.',
    reasonLabel: 'Reason / details',
    reasonPlaceholder: 'What happened, where, and any action taken (e.g. written warning).',
    reasonRequired: true,
    dateLabel: 'Date of offense',
    success: 'Violation recorded',
    closesDeployments: false,
  },
  suspend: {
    title: 'Suspend',
    confirm: 'Suspend',
    variant: 'danger',
    intro:
      'Marks the person as suspended. Their current post counts as vacant until the suspension is lifted.',
    reasonLabel: 'Reason for suspension',
    reasonPlaceholder: 'e.g. Sleeping on post — 2nd offense, 15-day suspension.',
    reasonRequired: true,
    dateLabel: 'Effectivity date',
    success: 'Suspension recorded',
    closesDeployments: false,
  },
  lift: {
    title: 'Lift suspension',
    confirm: 'Lift suspension',
    variant: 'primary',
    intro: 'Returns the person to active status.',
    reasonLabel: 'Reason',
    reasonPlaceholder: 'e.g. Suspension period served.',
    reasonRequired: true,
    dateLabel: 'Effectivity date',
    success: 'Suspension lifted',
    closesDeployments: false,
  },
  resign: {
    title: 'Record resignation',
    confirm: 'Record resignation',
    variant: 'danger',
    intro:
      'Marks the person as resigned. They stay on the roster under “Resigned” and can be re-hired later.',
    reasonLabel: 'Reason (optional)',
    reasonPlaceholder: 'e.g. Personal reasons, relocated abroad.',
    reasonRequired: false,
    dateLabel: 'Effectivity date',
    success: 'Resignation recorded',
    closesDeployments: true,
  },
  terminate: {
    title: 'Terminate',
    confirm: 'Terminate',
    variant: 'danger',
    intro: 'Ends this person’s employment.',
    reasonLabel: 'Reason for termination',
    reasonPlaceholder: 'e.g. AWOL since 10 August 2025 after repeated notices.',
    reasonRequired: true,
    dateLabel: 'Effectivity date',
    success: 'Termination recorded',
    closesDeployments: true,
  },
  blocklist: {
    title: 'Blocklist — remove from company',
    confirm: 'Blocklist',
    variant: 'danger',
    intro:
      'Removes the person from the company permanently. A blocklisted person cannot be re-hired and cannot apply again with the same email address. This cannot be undone from the app.',
    reasonLabel: 'Reason for blocklisting',
    reasonPlaceholder: 'e.g. Theft of client property, confirmed by investigation.',
    reasonRequired: true,
    dateLabel: 'Effectivity date',
    success: 'Person blocklisted',
    closesDeployments: true,
  },
  rehire: {
    title: 'Re-hire',
    confirm: 'Re-hire',
    variant: 'primary',
    intro:
      'Brings this person back as active personnel. Their employee number, IDs, violations and deployment history are kept. The date hired becomes the re-hire date; the previous employment period is saved in the history.',
    reasonLabel: 'Reason / remarks',
    reasonPlaceholder: 'e.g. Re-applied; cleared by HR interview.',
    reasonRequired: true,
    dateLabel: 'Re-hire date',
    success: 'Re-hired',
    closesDeployments: false,
  },
}

const today = () => new Date().toISOString().slice(0, 10)

/** The earliest effectivity date the database will accept for each action. */
function minDate(kind: PersonnelActionKind, p: PersonnelRow): string | undefined {
  switch (kind) {
    case 'violation':
      return undefined
    case 'lift':
      return p.status_effective_date ?? undefined
    case 'rehire':
      return p.date_separated ?? undefined
    case 'blocklist':
      return p.date_separated ?? p.date_hired
    default:
      return p.date_hired
  }
}

export interface PersonnelActionDialogProps {
  kind: PersonnelActionKind | null
  person: PersonnelRow
  openDeployments: OpenDeployment[]
  onClose: () => void
}

/**
 * One dialog for every disciplinary and status action. Mount it with
 * `key={kind}` so each open starts from a clean form.
 */
export function PersonnelActionDialog({
  kind,
  person,
  openDeployments,
  onClose,
}: PersonnelActionDialogProps) {
  const toast = useToast()
  const qc = useQueryClient()

  const [date, setDate] = useState(today())
  const [until, setUntil] = useState('')
  const [offense, setOffense] = useState('')
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const cfg = kind ? CONFIG[kind] : null
  // Blocklisting someone who already left does not touch deployments.
  const stillEmployed = ['active', 'on_leave', 'suspended'].includes(person.employment_status)
  const willClose =
    cfg?.closesDeployments && stillEmployed && openDeployments.length > 0

  const reasonError =
    touched && cfg?.reasonRequired && !reason.trim() ? 'A reason is required.' : undefined
  const offenseError =
    touched && kind === 'violation' && !offense.trim() ? 'Enter the offense.' : undefined
  const dateError = touched && !date ? 'Choose a date.' : undefined

  const mutation = useMutation({
    mutationFn: async () => {
      const id = person.id
      const r = reason.trim()
      switch (kind) {
        case 'violation':
          return recordViolation({ id, offense: offense.trim(), reason: r, date })
        case 'suspend':
          return suspendPersonnel({ id, reason: r, date, until: until || null })
        case 'lift':
          return liftSuspension({ id, reason: r, date })
        case 'resign':
          return separatePersonnel({ id, status: 'resigned', dateSeparated: date, note: r })
        case 'terminate':
          return separatePersonnel({ id, status: 'terminated', dateSeparated: date, note: r })
        case 'blocklist':
          return blocklistPersonnel({ id, reason: r, date })
        case 'rehire':
          return rehirePersonnel({ id, reason: r, date })
        default:
          throw new Error('No action selected.')
      }
    },
    onSuccess: () => {
      toast.success(
        cfg?.success ?? 'Saved',
        willClose ? `${openDeployments.length} open deployment(s) were ended.` : undefined,
      )
      // Status changes feed the roster, staffing views and dashboard counts.
      void qc.invalidateQueries({ queryKey: queryKeys.personnel.all })
      void qc.invalidateQueries({ queryKey: queryKeys.deployments.all })
      void qc.invalidateQueries({ queryKey: queryKeys.branches.all })
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all })
      onClose()
    },
    onError: (error) => toast.error('Could not save', errorMessage(error)),
  })

  function submit() {
    setTouched(true)
    if (!cfg || !date) return
    if (cfg.reasonRequired && !reason.trim()) return
    if (kind === 'violation' && !offense.trim()) return
    mutation.mutate()
  }

  if (!kind || !cfg) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={cfg.title}
      description={`${fullName(person)} · ${person.employee_no}`}
      size="sm"
      dismissOnOverlayClick={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={cfg.variant} onClick={submit} isLoading={mutation.isPending}>
            {cfg.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--app-text-muted)]">{cfg.intro}</p>

        {willClose && (
          <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 dark:bg-warning/10">
            <p className="text-sm font-medium text-[var(--app-text)]">
              {openDeployments.length === 1
                ? 'One open deployment will be ended:'
                : `${openDeployments.length} open deployments will be ended:`}
            </p>
            <ul className="mt-1 list-inside list-disc text-sm text-[var(--app-text-muted)]">
              {openDeployments.map((d) => (
                <li key={d.id}>
                  {d.branch_name ?? 'Facility'} — {humanize(d.shift)} shift
                </li>
              ))}
            </ul>
          </div>
        )}

        {kind === 'violation' && (
          <Field label="Offense" required error={offenseError} hint="Pick a common offense or type your own.">
            <Input
              list="personnel-offenses"
              value={offense}
              onChange={(e) => setOffense(e.target.value)}
              placeholder="e.g. Habitual tardiness"
              maxLength={200}
            />
          </Field>
        )}
        <datalist id="personnel-offenses">
          {COMMON_OFFENSES.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>

        <Field
          label={cfg.reasonLabel}
          required={cfg.reasonRequired}
          error={reasonError}
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={cfg.reasonPlaceholder}
            maxLength={2000}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={cfg.dateLabel}
            required
            error={dateError}
            hint={
              minDate(kind, person)
                ? `Not before ${formatDate(minDate(kind, person))}.`
                : undefined
            }
          >
            <Input
              type="date"
              value={date}
              min={minDate(kind, person)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          {kind === 'suspend' && (
            <Field label="Suspended until" hint="Leave blank if open-ended.">
              <Input
                type="date"
                value={until}
                min={date || undefined}
                onChange={(e) => setUntil(e.target.value)}
              />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  )
}
