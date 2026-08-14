import { useState } from 'react'
import { cn } from '@/utils/cn'

export interface SmartImageProps {
  src: string
  alt: string
  width: number
  height: number
  className?: string
  wrapperClassName?: string
  priority?: boolean
  overlay?: 'none' | 'dark' | 'gradient'
  rounded?: 'none' | 'xl' | '2xl'
}

const OVERLAYS = {
  none: '',
  dark: 'bg-ink/60',
  gradient: 'bg-gradient-to-t from-ink/90 via-ink/55 to-ink/25',
}

const ROUNDED = {
  none: '',
  xl: 'rounded-[var(--radius-xl)]',
  '2xl': 'rounded-[var(--radius-2xl)]',
}

export function SmartImage({
  src,
  alt,
  width,
  height,
  className,
  wrapperClassName,
  priority = false,
  overlay = 'none',
  rounded = 'xl',
}: SmartImageProps) {
  // Store *which* src failed rather than a bare boolean. A new `src` is then
  // automatically un-failed, with no effect to reset the flag and no render in
  // between where the old failure still shows against the new image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc === src

  return (
    <div className={cn('relative overflow-hidden bg-canvas', ROUNDED[rounded], wrapperClassName)}>
      {failed ? (
        <ImageFallback alt={alt} src={src} />
      ) : (
        <img
          key={src} // FORCES browser to try loading again when URL changes
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailedSrc(src)}
          className={cn('h-full w-full object-cover', className)}
        />
      )}

      {overlay !== 'none' && (
        <div className={cn('absolute inset-0', OVERLAYS[overlay])} aria-hidden="true" />
      )}
    </div>
  )
}

function ImageFallback({ alt, src }: { alt: string; src: string }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink"
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
    >
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 30%, #E23828 0%, transparent 60%)',
        }}
      />
      <img
        src="/logo.png"
        alt=""
        width={72}
        height={72}
        className="relative h-14 w-14 object-contain opacity-20"
      />
      {import.meta.env.DEV && (
        <p className="relative px-4 text-center font-mono text-[9px] text-neutral-600 uppercase tracking-widest">
          Loading: {src.split('/').pop()}
        </p>
      )}
    </div>
  )
}