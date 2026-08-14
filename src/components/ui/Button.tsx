import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

type Variant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'dark'
  /** For dark backgrounds: white outline that fills on hover. */
  | 'inverted'
type Size = 'sm' | 'md' | 'lg' | 'xl' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-300 shadow-[0_1px_2px_rgb(17_17_17/0.08)]',
  secondary:
    'bg-[var(--app-surface)] text-[var(--app-text)] border border-[var(--app-border)] hover:bg-[var(--app-bg)]',
  outline:
    'bg-transparent text-brand-600 border border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20',
  ghost:
    'bg-transparent text-[var(--app-text-muted)] hover:bg-[var(--app-bg)] hover:text-[var(--app-text)]',
  danger: 'bg-danger text-white hover:brightness-95 active:brightness-90',
  dark: 'bg-ink text-white hover:bg-ink-muted dark:bg-white dark:text-ink dark:hover:bg-neutral-200',
  inverted:
    'bg-white/10 text-white border border-white/25 backdrop-blur-sm hover:bg-white hover:text-ink hover:border-white',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  xl: 'h-14 px-8 text-base gap-2.5 font-semibold',
  icon: 'h-10 w-10 justify-center',
}

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium select-none ' +
  'transition-[background-color,color,border-color,transform,box-shadow] duration-200 ' +
  'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'

interface CommonProps {
  variant?: Variant
  size?: Size
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  className?: string
  children?: ReactNode
}

export interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> {
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      // Screen readers need to know the control is busy, not just visually spinning.
      aria-busy={isLoading || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
})

/**
 * A link that looks like a button.
 *
 * Previously every CTA was written as `<Link><Button/></Link>`, which nests a
 * `<button>` inside an `<a>` — invalid HTML, and assistive technology has to
 * guess which role wins. This renders a single correctly-roled element while
 * sharing the exact same styling.
 *
 * Use `to` for in-app routes and `href` for external links or `mailto:`/`tel:`.
 */
export interface ButtonLinkProps extends CommonProps {
  to?: string
  href?: string
  target?: string
  rel?: string
  'aria-label'?: string
  onClick?: () => void
}

export function ButtonLink({
  to,
  href,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  const classes = cn(
    BASE,
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  )

  const content = (
    <>
      {leftIcon}
      {children}
      {rightIcon}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    )
  }

  return (
    <a href={href} className={classes} {...props}>
      {content}
    </a>
  )
}
