import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Turns a Postgres/PostgREST error into something a user can act on.
 *
 * Two reasons this exists in one place:
 *   1. Raw driver messages leak schema details (constraint names, table names).
 *      That is information disclosure, and it is also useless to the person
 *      reading it.
 *   2. Our own CHECK constraints and RAISE EXCEPTIONs carry real business
 *      meaning — "a guard cannot hold two overlapping deployments" — which is
 *      worth surfacing verbatim.
 */

export class AppError extends Error {
  // Declared explicitly rather than as constructor parameter properties, which
  // `erasableSyntaxOnly` (see tsconfig.app.json) disallows.
  readonly code: string | undefined
  readonly detail: unknown

  constructor(message: string, code?: string, detail?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.detail = detail
  }
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  applicants_reference_no_unique: 'That reference number is already in use.',
  applicants_age_chk: 'Applicants must be at least 18 years old.',
  applicants_rejection_reason_chk: 'A reason is required when rejecting an applicant.',
  applicants_email_format_chk: 'Please enter a valid email address.',
  applicants_phone_format_chk: 'Please enter a valid phone number.',
  branches_code_unique: 'A branch with that code already exists.',
  branches_code_shape_chk:
    'Branch codes may contain only capital letters, digits and hyphens.',
  personnel_employee_no_unique: 'That employee number is already in use.',
  personnel_applicant_unique: 'This applicant has already been onboarded.',
  deployments_no_overlap:
    'This person already has a deployment covering those dates. End or transfer the existing assignment first.',
  deployments_date_order_chk: 'The end date cannot fall before the start date.',
  deployments_closure_chk:
    'A completed deployment needs an end date; an ongoing one must not have one.',
  user_roles_unique: 'That role is already assigned to this user.',
}

const CODE_MESSAGES: Record<string, string> = {
  '23505': 'That record already exists.',
  '23503': 'A related record is missing or still in use.',
  '23514': 'That change breaks a validation rule.',
  '42501': 'You do not have permission to do that.',
  '42P01': 'The database is not set up yet. Run the migrations first.',
  PGRST116: 'No matching record was found.',
  PGRST301: 'Your session has expired. Please sign in again.',
}

/**
 * Postgres classes that only ever indicate a bug on our side — a stale trigger
 * referencing a dropped column, a typo'd function, a broken cast. The raw text
 * ("record \"new\" has no field \"position_applied\"") names schema internals
 * and gives the reader nothing to act on, so it is swallowed into the console
 * rather than shown. Class 42 is syntax/access-rule errors, class XX is
 * internal errors; 42501 is deliberately absent because "you do not have
 * permission" is genuinely actionable and already mapped above.
 */
function isInternalFault(code: string | undefined): boolean {
  if (!code) return false
  if (code === '42501') return false
  return code.startsWith('42') || code.startsWith('XX') || code === '0A000'
}

function isPostgrestError(e: unknown): e is PostgrestError {
  return (
    typeof e === 'object' && e !== null && 'message' in e && 'code' in e
  )
}

export function toAppError(error: unknown, fallback = 'Something went wrong.'): AppError {
  if (error instanceof AppError) return error

  if (isPostgrestError(error)) {
    // A named constraint we recognise: use our own wording.
    for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
      if (error.message.includes(constraint) || error.details?.includes(constraint)) {
        return new AppError(message, error.code, error)
      }
    }

    // A RAISE EXCEPTION from one of our SQL functions: the message is written
    // for humans, so pass it through.
    if (error.code === 'P0001' || error.message.startsWith('Illegal applicant status')) {
      return new AppError(error.message, error.code, error)
    }

    const known = error.code ? CODE_MESSAGES[error.code] : undefined
    if (known) return new AppError(known, error.code, error)

    if (isInternalFault(error.code)) {
      if (import.meta.env.DEV) console.error('[db]', error.code, error.message, error)
      return new AppError(
        'Something went wrong on the server. Please try again, and let an administrator know if it keeps happening.',
        error.code,
        error,
      )
    }

    return new AppError(error.message || fallback, error.code, error)
  }

  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('failed to fetch')) {
      return new AppError(
        'Could not reach the server. Check your connection and try again.',
        'NETWORK',
        error,
      )
    }
    return new AppError(error.message || fallback, undefined, error)
  }

  return new AppError(fallback, undefined, error)
}

export function errorMessage(error: unknown, fallback?: string): string {
  return toAppError(error, fallback).message
}
