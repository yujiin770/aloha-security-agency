import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Lock, Save, Settings2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { queryKeys } from '@/lib/queryKeys'
import { errorMessage } from '@/lib/errors'
import { useAllSettings, useUpdateSetting } from '@/features/settings/hooks/useSettings'
import { useAuth } from '@/contexts/AuthContext'
import type { Json, SettingRow } from '@/types/database.types'

/** Groups a flat `company.name` style key list into labelled sections. */
const GROUPS: { prefix: string; title: string; description: string }[] = [
  {
    prefix: 'company.',
    title: 'Company details',
    description: 'Shown on the public site and in outgoing email.',
  },
  {
    prefix: 'recruitment.',
    title: 'Recruitment',
    description: 'Controls the public application form.',
  },
  {
    prefix: 'retention.',
    title: 'Data retention',
    description:
      'How long records are kept before permanent deletion. Enforced by the scheduled purge function.',
  },
  {
    prefix: 'notifications.',
    title: 'Notifications',
    description: 'Transactional email behaviour.',
  },
  {
    prefix: 'storage.',
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
        description="System configuration. Changes take effect immediately."
      />

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
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped, ...(ungrouped.length > 0
            ? [
                {
                  prefix: '',
                  title: 'Other',
                  description: '',
                  items: ungrouped,
                },
              ]
            : [])].map((group) => (
            <Card key={group.title} padded={false}>
              <CardHeader
                title={group.title}
                description={group.description}
                icon={<Settings2 className="h-4 w-4" aria-hidden="true" />}
              />
              <div className="divide-y divide-[var(--app-border)]">
                {group.items.map((row) => (
                  <SettingRowEditor
                    key={row.key}
                    row={row}
                    draft={drafts[row.key]}
                    readOnly={!isAdmin}
                    isSaving={save.isPending && save.variables === row.key}
                    onChange={(value) =>
                      setDrafts((current) => ({ ...current, [row.key]: value }))
                    }
                    onSave={() => save.mutate(row.key)}
                    onReset={() =>
                      setDrafts((current) => {
                        const next = { ...current }
                        delete next[row.key]
                        return next
                      })
                    }
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
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
