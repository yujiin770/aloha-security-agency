import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building,
  ChevronRight,
  ClipboardList,
  DatabaseBackup,
  Globe,
  HardDrive,
  Lock,
  Mail,
  Save,
  Settings2,
  Timer,
  UserCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { DraftNotice } from '@/components/ui/DraftNotice'
import { useStateDraft } from '@/hooks/useStateDraft'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { useAllSettings, useUpdateSetting } from '@/features/settings/hooks/useSettings'
import { useAuth } from '@/contexts/AuthContext'
import type { Json, SettingRow } from '@/types/database.types'

/** Groups a flat `company.name` style key list into labelled sections. */
const GROUPS: { prefix: string; title: string; description: string; icon: LucideIcon }[] = [
  {
    prefix: 'company.',
    icon: Building,
    title: 'Company details',
    description: 'Shown on the public site and in outgoing email.',
  },
  {
    prefix: 'recruitment.',
    icon: ClipboardList,
    title: 'Recruitment',
    description: 'Controls the public application form.',
  },
  {
    prefix: 'retention.',
    icon: Timer,
    title: 'Data retention',
    description:
      'How long records are kept before permanent deletion. Enforced by the scheduled purge function.',
  },
  {
    prefix: 'notifications.',
    icon: Mail,
    title: 'Email & notifications',
    description: 'Transactional email behaviour.',
  },
  {
    prefix: 'storage.',
    icon: HardDrive,
    title: 'Storage',
    description: 'Document access behaviour.',
  },
]

function toDisplay(value: Json): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/**
 * Parses an edited value back to JSON.
 *
 * Settings are stored as jsonb, so a plain string still has to be quoted. This
 * accepts JSON when it parses and falls back to treating the input as a string
 * — which is what a user typing a company name expects.
 */
function toJson(raw: string): Json {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  try {
    return JSON.parse(trimmed) as Json
  } catch {
    return raw
  }
}

export default function SettingsPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const { isAdmin, hasRole } = useAuth()

  // "Other" is the catch-all for settings keys that match none of the GROUPS
  // prefixes — internal plumbing rather than anything an owner is meant to
  // tune. Hidden from them by request; still visible to admin and
  // system_administrator, who are the ones asked to diagnose it.
  const hideUngrouped = hasRole('owner')

  const settings = useAllSettings()
  const update = useUpdateSetting()

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<string | null>(null)

  // Unsaved edits survive a refresh. Each successful save removes its key from
  // `drafts`; once the map is empty again the stored draft is deleted with it.
  const draft = useStateDraft({
    id: 'settings',
    open: true,
    recordId: null,
    values: { drafts },
    apply: (restored) => {
      if (restored.drafts) setDrafts(restored.drafts)
    },
    ready: settings.isSuccess,
  })

  // Unsaved edits are lost on reload or tab close, so the browser asks first.
  const hasDrafts = Object.keys(drafts).length > 0
  useEffect(() => {
    if (!hasDrafts) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasDrafts])

  const save = useMutation({
    mutationFn: async (key: string) => {
      const raw = drafts[key]
      if (raw === undefined) return
      await update.mutateAsync({ key, value: toJson(raw) })
    },
    onSuccess: (_data, key) => {
      toast.success('Setting saved', key)
      setDrafts((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      void qc.invalidateQueries({ queryKey: queryKeys.settings.all })
    },
    onError: (error) => toast.error('Could not save setting', errorMessage(error)),
  })

  if (settings.isError) {
    return (
      <>
        <PageHeader title="Settings" />
        <Card>
          <ErrorState
            message={errorMessage(settings.error)}
            onRetry={() => void settings.refetch()}
          />
        </Card>
      </>
    )
  }

  const rows = settings.data ?? []
  const grouped = GROUPS.map((group) => ({
    ...group,
    items: rows.filter((row) => row.key.startsWith(group.prefix)),
  })).filter((group) => group.items.length > 0)

  const ungrouped = hideUngrouped
    ? []
    : rows.filter((row) => !GROUPS.some((group) => row.key.startsWith(group.prefix)))

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile and system configuration. Saved changes take effect immediately."
      />

      <DraftNotice restoredAt={draft.restoredAt} onDiscard={draft.discard} />

      {!isAdmin && (
        <Card className="mb-6 border-info/25 bg-info-soft">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
            <p className="text-sm text-[var(--app-text-muted)]">
              You can view settings, but only an owner or administrator can
              change them. The fields below are read-only for your role — and
              would be rejected by the database even if they weren't.
            </p>
          </div>
        </Card>
      )}

      {settings.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
          <Skeleton className="h-64 rounded-[var(--radius-card)]" />
          <Skeleton className="h-96 rounded-[var(--radius-card)]" />
        </div>
      ) : (
        (() => {
          const sections = [
            ...grouped,
            ...(ungrouped.length > 0
              ? [
                  {
                    prefix: '',
                    title: 'Other',
                    description: 'Internal settings that fit no other section.',
                    icon: Settings2,
                    items: ungrouped,
                  },
                ]
              : []),
          ]
          const current =
            sections.find((section) => section.title === activeTab) ?? sections[0]
          const unsaved = (items: SettingRow[]) =>
            items.filter((row) => drafts[row.key] !== undefined).length

          return (
            <div className="grid items-start gap-6 lg:grid-cols-[15rem_1fr]">
              {/* Section nav: a column on desktop, a scrolling strip on phones. */}
              <nav
                aria-label="Settings sections"
                className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
              >
                <Link
                  to="/admin/settings/profile"
                  className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
                >
                  <UserCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">My profile & security</span>
                  <ChevronRight className="hidden h-4 w-4 opacity-50 lg:block" aria-hidden="true" />
                </Link>
                <p className="hidden px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-[var(--app-text-subtle)] uppercase lg:block">
                  System configuration
                </p>
                {sections.map((section) => {
                  const isActive = section === current
                  const pending = unsaved(section.items)
                  return (
                    <button
                      key={section.title}
                      type="button"
                      onClick={() => setActiveTab(section.title)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors',
                        isActive
                          ? 'bg-[var(--app-surface)] text-brand-600 shadow-[var(--shadow-card)] ring-1 ring-[var(--app-border)] dark:text-brand-300'
                          : 'text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]',
                      )}
                    >
                      <section.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{section.title}</span>
                      {pending > 0 && (
                        <span
                          className="rounded-full bg-warning px-1.5 text-[10px] leading-4 font-semibold text-white"
                          title={`${pending} unsaved`}
                        >
                          {pending}
                          <span className="sr-only"> unsaved</span>
                        </span>
                      )}
                    </button>
                  )
                })}
                <a
                  href="#backup"
                  onClick={() => setActiveTab('__backup')}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    activeTab === '__backup'
                      ? 'bg-[var(--app-surface)] text-brand-600 shadow-[var(--shadow-card)] ring-1 ring-[var(--app-border)] dark:text-brand-300'
                      : 'text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]',
                  )}
                >
                  <DatabaseBackup className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Backup & restore
                </a>
              </nav>

              {activeTab === '__backup' ? (
                <Card padded={false} as="section">
                  <CardHeader
                    title="Backup & restore"
                    description="Where the agency's data is protected"
                    icon={<DatabaseBackup className="h-4 w-4" aria-hidden="true" />}
                  />
                  <div id="backup" className="space-y-3 p-5 text-sm text-[var(--app-text-muted)]">
                    <p>
                      Database backups and point-in-time restore are handled by the
                      Supabase project that hosts this system, not from inside the
                      console. That keeps a restore — which overwrites live records —
                      behind the project owner's own sign-in.
                    </p>
                    <p>
                      To check the latest backup or restore one, open the project in
                      the Supabase dashboard and go to <strong>Database → Backups</strong>.
                    </p>
                  </div>
                </Card>
              ) : current ? (
                <Card key={current.title} padded={false} as="section">
                  <CardHeader
                    title={current.title}
                    description={current.description}
                    icon={<current.icon className="h-4 w-4" aria-hidden="true" />}
                  />
                  <div className="divide-y divide-[var(--app-border)]">
                    {current.items.map((row) => (
                      <SettingRowEditor
                        key={row.key}
                        row={row}
                        draft={drafts[row.key]}
                        readOnly={!isAdmin}
                        isSaving={save.isPending && save.variables === row.key}
                        onChange={(value) =>
                          setDrafts((existing) => ({ ...existing, [row.key]: value }))
                        }
                        onSave={() => save.mutate(row.key)}
                        onReset={() =>
                          setDrafts((existing) => {
                            const next = { ...existing }
                            delete next[row.key]
                            return next
                          })
                        }
                      />
                    ))}
                  </div>
                </Card>
              ) : (
                <Card>
                  <p className="text-sm text-[var(--app-text-muted)]">No settings are configured yet.</p>
                </Card>
              )}
            </div>
          )
        })()
      )}
    </>
  )
}

function SettingRowEditor({
  row,
  draft,
  readOnly,
  isSaving,
  onChange,
  onSave,
  onReset,
}: {
  row: SettingRow
  draft: string | undefined
  readOnly: boolean
  isSaving: boolean
  onChange: (value: string) => void
  onSave: () => void
  onReset: () => void
}) {
  const current = toDisplay(row.value)
  const value = draft ?? current
  const isDirty = draft !== undefined && draft !== current

  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_2fr] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-xs text-[var(--app-text)]">{row.key}</code>
          {row.is_public && (
            <Badge size="sm" tone="info">
              <Globe className="h-3 w-3" aria-hidden="true" />
              Public
            </Badge>
          )}
        </div>
        {row.description && (
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">{row.description}</p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <Field label="" className="flex-1">
          <Input
            value={value}
            readOnly={readOnly}
            disabled={readOnly}
            aria-label={row.key}
            onChange={(e) => onChange(e.target.value)}
            className={isDirty ? 'border-brand-500' : undefined}
          />
        </Field>

        {isDirty && !readOnly && (
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              leftIcon={<Save className="h-3.5 w-3.5" />}
              onClick={onSave}
              isLoading={isSaving}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onReset}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
