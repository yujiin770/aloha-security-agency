/**
 * Metric ↔ imperial conversion for the body measurements on the application
 * form.
 *
 * The database stores metric only — `applicants.height_cm` and
 * `applicants.weight_kg` are `numeric(5, 2)` with CHECK constraints of 100–250
 * and 30–250 respectively (migration 0004). Imperial is a data-entry
 * convenience, never a stored value, so every function here is written to round
 * -trip back to the same metric figure a user typed rather than to be maximally
 * precise in the other direction.
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

export interface FeetInches {
  feet: string
  inches: string
}

export const EMPTY_FEET_INCHES: FeetInches = { feet: '', inches: '' }

/**
 * Splits centimetres into whole feet and inches.
 *
 * Inches are rounded, so 177.8 cm reads as 5′10″ rather than 5′9.99″. The carry
 * matters: 152.3 cm rounds to 12 inches, which has to become 5′0″ and not 4′12″.
 */
export function cmToFeetInches(cm: string): FeetInches {
  const value = parse(cm)
  if (value === null || value <= 0) return EMPTY_FEET_INCHES

  const totalInches = value / CM_PER_INCH
  let feet = Math.floor(totalInches / 12)
  let inches = Math.round(totalInches - feet * 12)

  if (inches === 12) {
    feet += 1
    inches = 0
  }

  return { feet: String(feet), inches: String(inches) }
}

/** Both blank means "not answered"; a blank half counts as zero. */
export function feetInchesToCm({ feet, inches }: FeetInches): string {
  if (feet.trim() === '' && inches.trim() === '') return ''

  const total = (parse(feet) ?? 0) * 12 + (parse(inches) ?? 0)
  if (total <= 0) return ''

  return String(round1(total * CM_PER_INCH))
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

/** `177.8` → `5′10″`, for read-only display alongside the metric figure. */
export function formatFeetInches(cm: number | string | null | undefined): string {
  if (cm === null || cm === undefined) return ''
  const { feet, inches } = cmToFeetInches(String(cm))
  if (feet === '') return ''
  return `${feet}′${inches}″`
}

/** `70` → `154.3 lb`. */
export function formatPounds(kg: number | string | null | undefined): string {
  if (kg === null || kg === undefined) return ''
  const lb = kgToLb(String(kg))
  return lb === '' ? '' : `${lb} lb`
}
