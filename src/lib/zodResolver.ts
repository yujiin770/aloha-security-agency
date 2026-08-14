import type { FieldValues, Resolver } from 'react-hook-form'
import type { ZodType } from 'zod'

/**
 * A minimal `zodResolver` for react-hook-form.
 *
 * Written locally rather than pulled from `@hookform/resolvers`, whose current
 * release declares a peer dependency on valibot that conflicts with this
 * project's dependency tree. The contract is small and stable, so owning ~30
 * lines is cheaper than carrying a forced resolution.
 *
 * Nested paths are preserved ("address.city"), which is what react-hook-form
 * expects for `errors` lookup.
 */
export function zodResolver<TFieldValues extends FieldValues>(
  // The schema's inferred output rarely matches TFieldValues exactly — Zod
  // narrows optional/defaulted fields differently from the form's value type —
  // so the schema is accepted loosely and the resolver is typed at the boundary.
  schema: ZodType,
): Resolver<TFieldValues> {
  return async (values) => {
    const result = await schema.safeParseAsync(values)

    if (result.success) {
      return { values: result.data as TFieldValues, errors: {} }
    }

    const errors: Record<string, { type: string; message: string }> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.')
      // First issue per field wins — showing three messages under one input is
      // noise, not help.
      if (path && !errors[path]) {
        errors[path] = { type: issue.code, message: issue.message }
      }
    }

    return {
      values: {} as TFieldValues,
      errors: errors as never,
    }
  }
}
