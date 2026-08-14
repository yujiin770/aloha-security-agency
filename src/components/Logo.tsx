import { cn } from '@/utils/cn'
import { APP_NAME } from '@/lib/env'


export function Logo({
  className,
  showWordmark = true,
  inverted = false,
  size = 'md',
}: {
  className?: string
  showWordmark?: boolean
  inverted?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const markSize = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-12 w-12' }[size]
  const titleSize = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' }[size]

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        className={cn(markSize, 'shrink-0')}
      />
      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              'truncate font-semibold tracking-tight',
              titleSize,
              inverted ? 'text-white' : 'text-[var(--app-text)]',
            )}
          >
            {APP_NAME}
          </p>
          <p
            className={cn(
              'truncate text-[10px] font-medium tracking-[0.14em] uppercase',
              inverted ? 'text-neutral-400' : 'text-[var(--app-text-subtle)]',
            )}
          >
            Security Services
          </p>
        </div>
      )}
    </div>
  )
}
