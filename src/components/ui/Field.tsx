import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Accessible form primitives.
 *
 * `<Field>` owns the id wiring so that every control is programmatically
 * labelled and every error/hint is announced. Inputs read the ids from context
 * rather than each call site repeating `aria-describedby` — the accessible
 * version is the easy version, which is the only way it stays consistent.
 */

interface FieldContextValue {
  id: string
  errorId: string
  hintId: string
  hasError: boolean
  hasHint: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

function useFieldContext() {
  return useContext(FieldContext)
}

export interface FieldProps {
  label?: ReactNode
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  const base = useId()
  const value: FieldContextValue = {
    id: `${base}-control`,
    errorId: `${base}-error`,
    hintId: `${base}-hint`,
    hasError: Boolean(error),
    hasHint: Boolean(hint),
  }

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label && (
          <label
            htmlFor={value.id}
            className="text-sm font-medium text-[var(--app-text)]"
          >
            {label}
            {required && (
              <span className="ml-1 text-brand-500" aria-hidden="true">
                *
              </span>
            )}
            {required && <span className="sr-only"> (required)</span>}
          </label>
        )}

        {children}

        {hint && !error && (
          <p id={value.hintId} className="text-xs text-[var(--app-text-subtle)]">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={value.errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-danger"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

const CONTROL_BASE =
  'w-full rounded-lg border bg-[var(--app-surface)] px-3 text-sm text-[var(--app-text)] ' +
  'placeholder:text-[var(--app-text-subtle)] transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'read-only:bg-[var(--app-bg)]'

function controlClasses(hasError: boolean, extra?: string) {
  return cn(
    CONTROL_BASE,
    hasError
      ? 'border-danger focus:border-danger'
      : 'border-[var(--app-border)] focus:border-brand-500',
    extra,
  )
}

function describedBy(ctx: FieldContextValue | null) {
  if (!ctx) return undefined
  const ids = [ctx.hasError && ctx.errorId, ctx.hasHint && !ctx.hasError && ctx.hintId]
    .filter(Boolean)
    .join(' ')
  return ids || undefined
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const ctx = useFieldContext()
    return (
      <input
        ref={ref}
        id={props.id ?? ctx?.id}
        aria-invalid={ctx?.hasError || undefined}
        aria-describedby={describedBy(ctx)}
        className={controlClasses(Boolean(ctx?.hasError), cn('h-10', className))}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  const ctx = useFieldContext()
  return (
    <textarea
      ref={ref}
      rows={rows}
      id={props.id ?? ctx?.id}
      aria-invalid={ctx?.hasError || undefined}
      aria-describedby={describedBy(ctx)}
      className={controlClasses(Boolean(ctx?.hasError), cn('py-2 resize-y', className))}
      {...props}
    />
  )
})

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, ...props },
  ref,
) {
  const ctx = useFieldContext()
  return (
    <select
      ref={ref}
      id={props.id ?? ctx?.id}
      aria-invalid={ctx?.hasError || undefined}
      aria-describedby={describedBy(ctx)}
      className={controlClasses(Boolean(ctx?.hasError), cn('h-10 pr-8', className))}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  )
})

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  description?: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, ...props },
  ref,
) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        ref={ref}
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--app-border)] text-brand-500 accent-[var(--color-brand-500)]"
        {...props}
      />
      <div className="flex flex-col">
        <label
          htmlFor={props.id ?? id}
          className="text-sm text-[var(--app-text)] leading-snug"
        >
          {label}
        </label>
        {description && (
          <span className="text-xs text-[var(--app-text-subtle)]">{description}</span>
        )}
      </div>
    </div>
  )
})
