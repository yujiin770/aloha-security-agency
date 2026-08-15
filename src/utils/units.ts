/**
 * Metric ↔ imperial conversion for the body measurements on the application
 * form.
 *
 * The database stores metric only — `applicants.height_cm` and
 * `applicants.weight_kg` are `numeric(5, 2)` with CHECK constraints of 100–250
 * and 30–250 respectively (migration 0004). Imperial is a data-entry
 * convenience, never a stored value, so every function here is written to
 * round-trip back to the same metric figure a user typed rather than to be
 * maximally precise in the other direction.
 *
 * Values are passed around as strings because that is what the form fields hold
 * — an empty string is a real state ("not answered") that a number cannot
 * represent.
 */

export const CM_PER_INCH = 2.54
export const KG_PER_LB = 0.45359237

/** One decimal place: enough for 0.4 cm / 0.05 kg resolution, and fits (5,2). */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function parse(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Identity conversion, for the unit a value is already stored in. */
export function sameUnit(value: string): string {
  return value.trim()
}

export function cmToInches(cm: string): string {
  const value = parse(cm)
  if (value === null || value <= 0) return ''
  return String(round1(value / CM_PER_INCH))
}

export function inchesToCm(inches: string): string {
  const value = parse(inches)
  if (value === null || value <= 0) return ''
  return String(round1(value * CM_PER_INCH))
}

export function kgToLb(kg: string): string {
  const value = parse(kg)
  if (value === null || value <= 0) return ''
  return String(round1(value / KG_PER_LB))
}

export function lbToKg(lb: string): string {
  const value = parse(lb)
  if (value === null || value <= 0) return ''
  return String(round1(value * KG_PER_LB))
}

/** `177.8` → `70 in`, for read-only display alongside the metric figure. */
export function formatInches(cm: number | string | null | undefined): string {
  if (cm === null || cm === undefined) return ''
  const inches = cmToInches(String(cm))
  return inches === '' ? '' : `${inches} in`
}

/** `70` → `154.3 lb`. */
export function formatPounds(kg: number | string | null | undefined): string {
  if (kg === null || kg === undefined) return ''
  const lb = kgToLb(String(kg))
  return lb === '' ? '' : `${lb} lb`
}
