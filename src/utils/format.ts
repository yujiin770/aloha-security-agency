import { differenceInYears, format, formatDistanceToNowStrict, parseISO } from 'date-fns'

/**
 * Display formatting.
 *
 * The agency operates in the Philippines, so dates render day-first and money
 * renders in PHP. Every function tolerates null so call sites don't need
 * guards — a missing value renders as an em dash, never "Invalid Date".
 */

const EMPTY = '—'

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : parseISO(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'dd MMM yyyy') : EMPTY
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'dd MMM yyyy, h:mm a') : EMPTY
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'h:mm a') : EMPTY
}

/** For <input type="date"> values. */
export function toDateInput(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, 'yyyy-MM-dd') : ''
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return EMPTY
  return `${formatDistanceToNowStrict(date)} ago`
}

export function calculateAge(birthDate: string | Date | null | undefined): number | null {
  const date = toDate(birthDate)
  return date ? differenceInYears(new Date(), date) : null
}

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

export function formatCurrency(value: number | null | undefined): string {
  return value == null ? EMPTY : pesoFormatter.format(value)
}

const numberFormatter = new Intl.NumberFormat('en-PH')

export function formatNumber(value: number | null | undefined): string {
  return value == null ? EMPTY : numberFormatter.format(value)
}

export function formatPercent(value: number | null | undefined): string {
  return value == null ? EMPTY : `${value.toFixed(1)}%`
}

/** `security_guard` -> `Security Guard`. Used for every enum rendered to a user. */
export function humanize(value: string | null | undefined): string {
  if (!value) return EMPTY
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function fullName(parts: {
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  suffix?: string | null
}): string {
  return [parts.first_name, parts.middle_name, parts.last_name, parts.suffix]
    .filter(Boolean)
    .join(' ')
    .trim()
}

export function initials(name: string | null | undefined): string {
  if (!name) return '??'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '??'
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return EMPTY
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Masks all but the last four characters of a statutory ID for on-screen display. */
export function maskId(value: string | null | undefined): string {
  if (!value) return EMPTY
  const trimmed = value.trim()
  if (trimmed.length <= 4) return trimmed
  return `${'•'.repeat(Math.min(trimmed.length - 4, 8))}${trimmed.slice(-4)}`
}
