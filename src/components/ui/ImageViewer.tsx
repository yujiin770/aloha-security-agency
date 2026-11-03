import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ExternalLink,
  ImageOff,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Full-screen image preview for uploaded documents and accreditation photos.
 *
 * The image is shown at its own aspect ratio and never re-encoded — "fit"
 * scales it down to the viewport, and zooming past 100% shows the original
 * pixels. Clicking the image toggles between fit and actual size, the way
 * people expect from a photo viewer.
 */

/** Index 0 is "fit to screen"; the rest are multiples of the original pixels. */
const ZOOM_STEPS = [0, 1, 2, 3] as const

export interface ImageViewerProps {
  open: boolean
  onClose: () => void
  /** `null` while a signed URL is still being fetched. */
  src: string | null
  alt: string
  title?: string
  subtitle?: string
  /** Called from the error state; usually re-requests a fresh signed URL. */
  onRetry?: () => void
}

export function ImageViewer({ open, onClose, src, alt, title, subtitle, onRetry }: ImageViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [zoom, setZoom] = useState(0) // index into ZOOM_STEPS; 0 = fit
  const [isFullscreen, setIsFullscreen] = useState(false)

  // A new image starts fresh: loading, fitted.
  const [shownSrc, setShownSrc] = useState(src)
  if (shownSrc !== src) {
    setShownSrc(src)
    setStatus('loading')
    setZoom(0)
  }

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const returnFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        event.stopPropagation()
        onCloseRef.current()
      } else if (event.key === '+' || event.key === '=') {
        setZoom((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))
      } else if (event.key === '-') {
        setZoom((z) => Math.max(z - 1, 0))
      } else if (event.key === '0') {
        setZoom(0)
      }
    }
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.body.style.overflow = previousOverflow
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus()
    }
  }, [open])

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  if (!open) return null

  const fitted = zoom === 0
  const toolButton =
    'flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent'

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? alt}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          {title && <p className="truncate text-sm font-medium text-white">{title}</p>}
          {subtitle && <p className="truncate text-xs text-white/60">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={toolButton}
            onClick={() => setZoom((z) => Math.max(z - 1, 0))}
            disabled={fitted || status !== 'ready'}
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-white/70" aria-live="polite">
            {fitted ? 'Fit' : `${(ZOOM_STEPS[zoom] ?? 1) * 100}%`}
          </span>
          <button
            type="button"
            className={toolButton}
            onClick={() => setZoom((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))}
            disabled={zoom === ZOOM_STEPS.length - 1 || status !== 'ready'}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="mx-1 h-5 w-px bg-white/15" aria-hidden="true" />
          <button
            type="button"
            className={cn(toolButton, 'hidden sm:flex')}
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          {src && (
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className={toolButton}
              aria-label="Open original in a new tab"
              title="Open original"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          <button
            ref={closeRef}
            type="button"
            className={toolButton}
            onClick={onClose}
            aria-label="Close preview"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'scrollbar-slim relative flex flex-1 overflow-auto',
          // `safe center` keeps a zoomed image scrollable from its top-left
          // edge instead of clipping it off-screen.
          '[align-items:safe_center] [justify-content:safe_center]',
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        {(status === 'loading' || !src) && status !== 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70" role="status">
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading image…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/80" role="alert">
            <ImageOff className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">This image could not be loaded.</p>
            {onRetry && (
              <button
                type="button"
                onClick={() => {
                  setStatus('loading')
                  onRetry()
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-sm text-white hover:bg-white/10"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </button>
            )}
          </div>
        )}

        {src && (
          <img
            key={src}
            src={src}
            alt={alt}
            decoding="async"
            onLoad={(event) => {
              // Natural width as a CSS variable, so zoom levels are relative to
              // the original pixels rather than the fitted size.
              const node = event.currentTarget
              node.style.setProperty('--natural-w', `${node.naturalWidth}px`)
              setStatus('ready')
            }}
            onError={() => setStatus('error')}
            onClick={() => setZoom((z) => (z === 0 ? 1 : 0))}
            className={cn(
              'm-auto shrink-0 select-none transition-opacity duration-200',
              status === 'ready' ? 'opacity-100' : 'opacity-0',
              fitted
                ? 'max-h-full max-w-full cursor-zoom-in object-contain p-4 sm:p-8'
                : 'max-w-none cursor-zoom-out',
            )}
            style={
              fitted
                ? undefined
                : { width: `calc(var(--natural-w) * ${ZOOM_STEPS[zoom] ?? 1})` }
            }
            draggable={false}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}
