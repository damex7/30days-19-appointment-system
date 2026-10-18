'use client'

import { useActionState } from 'react'
import { saveDayHoursAction } from '@/app/(app)/admin/hours/actions'
import { SubmitButton } from '@/components/forms/submit-button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import type { FormState } from '@/lib/validation'

const ROWS = 3

/**
 * One weekday for one stylist: up to three blocks of wall-clock time. Two
 * blocks with a gap between them is a lunch break. Empty rows are ignored;
 * all rows empty = a day off. Every input has its own label (visually
 * "From" / "Until", spoken with the day and the block number).
 */
export function DayHoursForm({ stylistId, dayOfWeek, dayName, blocks }: { stylistId: number; dayOfWeek: number; dayName: string; blocks: { start: string; end: string }[] }) {
  const [state, action] = useActionState(saveDayHoursAction, { status: 'idle' } satisfies FormState)
  const id = (part: string, i: number) => `h-${dayOfWeek}-${part}-${i}`
  // After an error, show what was typed; otherwise what's saved.
  const typed = state.status === 'error' ? state.values : undefined
  const start = (i: number) => typed?.[`s${i}`] ?? blocks[i]?.start ?? ''
  const end = (i: number) => typed?.[`e${i}`] ?? blocks[i]?.end ?? ''
  return (
    <form action={action} className="rounded-card border border-line bg-raised p-4" aria-labelledby={`day-${dayOfWeek}`}>
      <input type="hidden" name="stylistId" value={stylistId} />
      <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`day-${dayOfWeek}`} className="font-sans text-base font-semibold">
          {dayName}
          {blocks.length === 0 ? <span className="ml-2 text-sm font-normal text-muted">Day off</span> : null}
        </h3>
      </div>
      <div className="mt-3 space-y-2">
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={id('start', i)} className="block text-xs font-semibold text-muted">
                From<span className="sr-only"> ({dayName}, block {i + 1})</span>
              </label>
              <input id={id('start', i)} name="start" type="time" step={300} defaultValue={start(i)} className="field figures min-h-11 px-2" />
            </div>
            <div>
              <label htmlFor={id('end', i)} className="block text-xs font-semibold text-muted">
                Until<span className="sr-only"> ({dayName}, block {i + 1})</span>
              </label>
              <input id={id('end', i)} name="end" type="time" step={300} defaultValue={end(i)} className="field figures min-h-11 px-2" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save {dayName}
        </SubmitButton>
        <p role="status" className={cn('flex items-center gap-1 text-sm font-semibold empty:sr-only', state.status === 'error' ? 'text-danger' : 'text-success')}>
          {state.status === 'error' ? <Icon name="errorCircle" className="size-4" /> : null}
          {state.status !== 'idle' ? state.message : null}
        </p>
      </div>
    </form>
  )
}
