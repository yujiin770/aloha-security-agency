import type { ReactNode } from 'react'
import { FileUser, Pencil } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { calculateAge, formatDate } from '@/utils/format'
import type { PdsFields } from '@/types/database.types'

const yesNo = (v: boolean | null) => (v === true ? 'Yes' : v === false ? 'No' : '—')
const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : String(v)
const joined = (...parts: (string | null | undefined)[]) =>
  parts.filter((p) => p && p.trim()).join(' · ') || '—'

/** "2019-03" → "Mar 2019"; anything else as typed. */
function month(value: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  if (!m) return value
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
  })
}

/**
 * The Personal Data Sheet as read-only sections, for the applicant and
 * personnel detail pages. `onEdit` adds the Edit button (pass it only to staff
 * who may change the record).
 */
export function PdsDetails({
  record,
  onEdit,
  description,
}: {
  record: PdsFields
  onEdit?: () => void
  description?: ReactNode
}) {
  const r = record
  const military = [
    r.military_pnp && 'PNP',
    r.military_afp && 'AFP',
    r.military_rotc && 'ROTC / CMT',
  ].filter(Boolean)

  return (
    <Card padded={false}>
      <CardHeader
        title="Personal Data Sheet"
        description={description}
        icon={<FileUser className="h-4 w-4" aria-hidden="true" />}
        actions={
          onEdit && (
            <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
              Edit
            </Button>
          )
        }
      />

      <Section title="Personal background">
        <Grid
          items={[
            ['Place of birth', dash(r.place_of_birth)],
            ['Religion', dash(r.religion)],
            ['Provincial address', dash(r.provincial_address)],
            ['Father', joined(r.father_name, r.father_occupation)],
            ['Mother', joined(r.mother_name, r.mother_occupation)],
            ["Parents' address", dash(r.parents_address)],
            ['Spouse', joined(r.spouse_name, r.spouse_occupation)],
            ["Spouse's address", dash(r.spouse_address)],
          ]}
        />
      </Section>

      <Section title="Emergency contact">
        <Grid
          items={[
            ['Name', dash(r.emergency_contact_name)],
            ['Relationship', dash(r.emergency_contact_relationship)],
            ['Contact number', dash(r.emergency_contact_phone)],
            ['Occupation', dash(r.emergency_contact_occupation)],
          ]}
        />
      </Section>

      <Section title="Education & training">
        <Grid
          items={[
            ['Name of school', dash(r.school_name)],
            ['Course', dash(r.course)],
            ['Date graduated', dash(r.date_graduated)],
          ]}
        />
        <List
          label="Security training attended"
          rows={r.trainings.map((t) => ({
            primary: t.training || '—',
            secondary: joined(t.school, t.dates),
          }))}
        />
      </Section>

      <Section title="PNP / military training">
        <Grid
          items={[
            ['Training', military.length ? military.join(', ') : '—'],
            ['Branch of service', dash(r.military_branch)],
            ['Serial no.', dash(r.military_serial_no)],
            ['Rank', dash(r.military_rank)],
            ['Status', dash(r.military_status)],
            ['Years in service', dash(r.military_years_service)],
            ['Reason for leaving', dash(r.military_reason_leaving)],
          ]}
        />
      </Section>

      <Section title="Dependents">
        <List
          rows={r.dependents.map((d) => {
            const age = calculateAge(d.birth_date || null)
            return {
              primary: joined(d.name, d.relationship),
              secondary: joined(
                d.birth_date ? `Born ${formatDate(d.birth_date)}` : '',
                age === null ? '' : `Age ${age}`,
                d.address,
              ),
            }
          })}
        />
      </Section>

      <Section title="Employment background">
        <List
          rows={r.employment_history.map((e) => ({
            primary: e.employer || '—',
            secondary: joined(
              e.from || e.to ? `${month(e.from) || '?'} – ${month(e.to) || '?'}` : '',
              e.salary && `Salary ${e.salary}`,
              e.reason && `Left: ${e.reason}`,
            ),
          }))}
        />
      </Section>

      <Section title="Character references">
        <List
          rows={r.character_references.map((c) => ({
            primary: c.name || '—',
            secondary: joined(c.position, c.company, c.contact),
          }))}
        />
      </Section>

      <Section title="Other information">
        <Grid
          items={[
            ['Special skills', dash(r.special_skills)],
            ['Loans (SSS, Pag-IBIG…)', r.has_loans ? joined('Yes', r.loan_details) : yesNo(r.has_loans)],
            ['Convicted of a crime', r.has_criminal_record ? joined('Yes', r.criminal_record_details) : yesNo(r.has_criminal_record)],
            ['Drinks alcohol', yesNo(r.drinks_alcohol)],
            ['Smokes', yesNo(r.smokes)],
            ['Health problems', dash(r.health_problems)],
            ['Willing to undergo background check', yesNo(r.willing_background_check)],
            ['Willing to be assigned anywhere in Region 9', yesNo(r.willing_any_assignment)],
            ['Recommended by', dash(r.recommended_by)],
          ]}
        />
      </Section>

      <Section title="Badge, licence control and residence certificate" last>
        <Grid
          items={[
            ['Badge no.', dash(r.badge_no)],
            ['Licence control no.', dash(r.license_control_no)],
            ['Res. cert. no.', dash(r.res_cert_no)],
            ['Issued on', r.res_cert_issued_on ? formatDate(r.res_cert_issued_on) : '—'],
            ['Issued at', dash(r.res_cert_issued_at)],
          ]}
        />
      </Section>
    </Card>
  )
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <section
      className={
        last ? 'px-4 py-4 sm:px-5' : 'border-b border-[var(--app-border)] px-4 py-4 sm:px-5'
      }
    >
      <h3 className="text-xs font-semibold tracking-wider text-[var(--app-text-muted)] uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Grid({ items }: { items: [string, string][] }) {
  return (
    // Phones: label left, value right, one compact row each. From `sm` up:
    // two columns, label above value.
    <dl className="mt-1 divide-y divide-[var(--app-border)] sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
      {items.map(([term, value]) => (
        <div
          key={term}
          className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3 py-2 sm:block"
        >
          <dt className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
            {term}
          </dt>
          <dd className="text-right text-sm break-words text-[var(--app-text)] sm:mt-0.5 sm:text-left">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function List({
  label,
  rows,
}: {
  label?: string
  rows: { primary: string; secondary: string }[]
}) {
  return (
    <div className="mt-2">
      {label && (
        <p className="text-xs font-medium tracking-wide text-[var(--app-text-subtle)] uppercase">
          {label}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--app-text-subtle)]">None listed.</p>
      ) : (
        <ol className="mt-1 divide-y divide-[var(--app-border)]">
          {rows.map((row, i) => (
            <li key={i} className="flex gap-3 py-2">
              <span className="w-5 shrink-0 text-xs text-[var(--app-text-subtle)]">{i + 1}.</span>
              <div className="min-w-0">
                <p className="text-sm font-medium break-words text-[var(--app-text)]">{row.primary}</p>
                {row.secondary !== '—' && (
                  <p className="text-xs break-words text-[var(--app-text-muted)]">{row.secondary}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
