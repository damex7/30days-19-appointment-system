// THE DATE STRIP AND THE TIME GRID: one component, two layouts.
//
// Accessibility, piece by piece:
// - Each choice is a real <button> with a FULL label ("Tuesday 21 October,
//   10:30 AM, available"), not just "10:30", so a screen reader user hears
//   the whole thing out of context.
// - aria-pressed marks the chosen one; the visible ✓ and solid plum say the
//   same thing to sighted users.
// - Unavailable days use aria-disabled, NOT the disabled attribute: they
//   stay focusable, so a keyboard or screen reader user can still find out
//   that Sunday exists and is closed, instead of it silently vanishing.
// - Arrow keys move between the buttons (roving tabindex); Tab leaves.
// - Choosing announces "Selected: …" in a polite live region, then the URL
//   changes and the server renders the next step.
// - Colour is never the only signal: open, selected and unavailable each
//   have their own icon and word.
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { useRovingFocus } from './use-roving-focus'

export type PickerItem = {
  key: string
  href: string
  /** The full spoken label. */
  label: string
  /** Visible lines, e.g. ["Tue", "21", "Oct"] or ["10:30 AM"]. */
  lines: string[]
  /** A small note under the main text: "12 times", "Closed". */
  note?: string
  state: 'open' | 'selected' | 'unavailable'
}

export function SlotPicker({ items, layout, label }: { items: PickerItem[]; layout: 'strip' | 'grid'; label: string }) {
  const router = useRouter()
  const onKeyDown = useRovingFocus({ grid: layout === 'grid' })
  const [announcement, setAnnouncement] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // The ONE tab stop: the selected item, or else the first open one.
  const focusKey = items.find((i) => i.state === 'selected')?.key ?? items.find((i) => i.state === 'open')?.key ?? items[0]?.key

  function choose(item: PickerItem) {
    if (item.state === 'unavailable') {
      setAnnouncement(`${item.label}. Choose another.`)
      return
    }
    setAnnouncement(`Selected: ${item.label}`)
    setPendingKey(item.key)
    // scroll: false keeps the page where it is; the next step appears below.
    startTransition(() => router.push(item.href, { scroll: false }))
  }

  return (
    <div>
      <div
        role="group"
        aria-label={label}
        aria-busy={isPending}
        onKeyDown={onKeyDown}
        className={cn(
          layout === 'strip'
            ? // A sideways-scrolling strip: one thumb swipe on a phone.
              'relative -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:thin] sm:mx-0 sm:px-1'
            : 'grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-6',
        )}
      >
        {items.map((item) => {
          const selected = item.state === 'selected'
          const unavailable = item.state === 'unavailable'
          const pending = isPending && pendingKey === item.key
          return (
            <button
              key={item.key}
              type="button"
              data-roving
              tabIndex={item.key === focusKey ? 0 : -1}
              aria-label={item.label}
              aria-pressed={selected}
              aria-disabled={unavailable || undefined}
              onClick={() => choose(item)}
              className={cn(
                'figures relative flex shrink-0 snap-start flex-col items-center justify-center rounded-control border text-center transition-colors',
                layout === 'strip' ? 'min-h-24 w-[4.6rem] px-1 py-2' : 'min-h-12 px-2 py-2',
                selected && 'border-brand bg-brand text-on-brand',
                item.state === 'open' && 'border-brand bg-tint text-brand hover:bg-tint-strong',
                unavailable && 'hatched cursor-not-allowed border-line text-unavailable',
                pending && 'animate-pulse',
              )}
            >
              {layout === 'strip' ? (
                <>
                  <span className="text-xs font-semibold tracking-wide uppercase">{item.lines[0]}</span>
                  <span className="text-2xl leading-tight font-semibold">{item.lines[1]}</span>
                  <span className="text-xs">{item.lines[2]}</span>
                </>
              ) : (
                <span className="font-semibold">{item.lines[0]}</span>
              )}
              {item.note ? (
                <span className="mt-0.5 flex items-center gap-1 text-[0.7rem] leading-none font-medium" aria-hidden>
                  <Icon name={selected ? 'check' : unavailable ? 'slotUnavailable' : 'slotOpen'} className="size-3" />
                  {item.note}
                </span>
              ) : selected ? (
                <Icon name="check" className="absolute top-1 right-1 size-3.5" />
              ) : null}
            </button>
          )
        })}
      </div>
      {/* Announces each choice to screen readers (visually hidden). */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
