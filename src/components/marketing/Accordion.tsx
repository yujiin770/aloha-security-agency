import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * FAQ accordion.
 *
 * One panel open at a time. The trigger is a real `<button>` inside a heading,
 * carrying `aria-expanded` and `aria-controls`, so screen readers announce
 * state and the whole thing works from the keyboard without extra handlers.
 */

export interface AccordionItem {
  question: string
  answer: ReactNode
}

export function Accordion({
  items,
  className,
}: {
  items: AccordionItem[]
  className?: string
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()
  const reduced = useReducedMotion()

  return (
    <div
      className={cn(
        'divide-y divide-[var(--app-border)] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-white',
        className,
      )}
    >
      {items.map((item, index) => {
        const isOpen = openIndex === index
        const panelId = `${baseId}-panel-${index}`
        const buttonId = `${baseId}-button-${index}`

        return (
          <div key={item.question}>
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-canvas sm:px-8"
              >
                <span className="text-base font-semibold text-ink sm:text-lg">
                  {item.question}
                </span>
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                    isOpen
                      ? 'rotate-45 bg-brand-500 text-white'
                      : 'bg-canvas text-[var(--app-text-muted)]',
                  )}
                  aria-hidden="true"
                >
                  <Plus className="h-4 w-4" />
                </span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-6 text-[15px] leading-relaxed text-[var(--app-text-muted)] sm:px-8">
                    {item.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
