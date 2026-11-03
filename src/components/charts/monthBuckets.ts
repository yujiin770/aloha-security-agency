import type { RecruitmentFunnelRow } from '@/types/database.types'

/** One month of applications, split by outcome. */
export interface MonthBucket {
  month: string
  hired: number
  inProgress: number
  rejected: number
  archived: number
  total: number
}

/** First-of-month ISO dates from `from` to `to`, inclusive. */
function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00`)
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00`)
  // Bounded so a reversed or absurd range cannot spin.
  while (cursor <= end && months.length < 120) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}-01`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

/**
 * Rolls the per-position rows up into one bucket per month. Months with no
 * applications still get a bucket, so a quiet month shows as a gap in the
 * axis rather than vanishing from it.
 */
export function bucketByMonth(
  rows: RecruitmentFunnelRow[],
  from: string,
  to: string,
): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>(
    monthRange(from, to).map((month) => [
      month,
      { month, hired: 0, inProgress: 0, rejected: 0, archived: 0, total: 0 },
    ]),
  )
  for (const row of rows) {
    const key = `${row.period_month.slice(0, 7)}-01`
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.hired += row.hired
    bucket.inProgress += row.pending + row.screening + row.interview
    bucket.rejected += row.rejected
    bucket.archived += row.archived
    bucket.total += row.total
  }
  return [...buckets.values()]
}
