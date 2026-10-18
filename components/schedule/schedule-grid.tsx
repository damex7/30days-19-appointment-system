// A TIME GRID: columns side by side (stylists on the admin's day view, days
// on a stylist's week view), time running down, appointments as blocks.
//
// Layout: one scroll container. The time labels are a sticky first column,
// so on a phone the columns scroll sideways under them and you never lose
// track of the time. Each column is `position: relative` and its height is
// minutes × a fixed scale, so a block's top and height are plain arithmetic
// on minutes since the grid's first hour, in STUDIO time.
//
// Every block carries its state in words and an icon (Booked, Completed,
// Cancelled, No-show, Time off), not colour alone, and is a link with a
// full label for screen readers. Working hours are plain; outside them is
// hatched ("unavailable").
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icon'
import type { BookingStatus } from '@/lib/booking/bookings'
import { cn } from '@/lib/cn'
import { formatClock, timeFromMinutes } from '@/lib/time'

export type GridBlock = {
  key: string
  /** Minutes after local midnight. */
  start: number
  end: number
  kind: BookingStatus | 'time_off'
  title: string
  detail?: string
  href?: string
  /** The full spoken label. */
  label: string
}

export type GridColumn = {
  key: string
  heading: string
  subheading?: string
  /** Working ranges in minutes after midnight; everything else is hatched. */
  open: { start: number; end: number }[]
  blocks: GridBlock[]
  highlight?: boolean
}

const KIND: Record<GridBlock['kind'], { word: string; icon: IconName; className: string }> = {
  confirmed: { word: 'Booked', icon: 'slotBooked', className: 'border-booked bg-booked-soft text-ink' },
  completed: { word: 'Completed', icon: 'checkCircle', className: 'border-success bg-success-soft text-ink' },
  cancelled: { word: 'Cancelled', icon: 'slotCancelled', className: 'border-danger bg-danger-soft text-ink opacity-80 [&_.when]:line-through' },
  no_show: { word: 'No-show', icon: 'slotNoShow', className: 'border-dashed border-ink bg-raised text-ink' },
  time_off: { word: 'Time off', icon: 'door', className: 'hatched border-unavailable text-ink' },
}

const PX_PER_MIN = 1.1

export function ScheduleGrid({ columns, startHour, endHour, label }: { columns: GridColumn[]; startHour: number; endHour: number; label: string }) {
  const first = startHour * 60
  const height = (endHour - startHour) * 60 * PX_PER_MIN
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  const y = (minutes: number) => (Math.min(Math.max(minutes, first), endHour * 60) - first) * PX_PER_MIN

  return (
    // `relative` keeps absolutely-positioned children (and sr-only text)
    // inside the scroll box, so nothing leaks past the page edge at 360px.
    <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto rounded-card border border-line bg-raised shadow-card">
      <div className="grid min-w-max" style={{ gridTemplateColumns: `3.75rem repeat(${columns.length}, minmax(9.5rem, 1fr))` }}>
        {/* Header row */}
        <div className="sticky top-0 left-0 z-20 border-b border-line bg-raised" />
        {columns.map((column) => (
          <div key={column.key} className={cn('border-b border-l border-line px-2 py-2', column.highlight && 'bg-tint')}>
            <p className="font-semibold">{column.heading}</p>
            {column.subheading ? <p className="figures text-xs text-muted">{column.subheading}</p> : null}
          </div>
        ))}

        {/* Time labels: sticky to the left edge while the columns scroll. */}
        <div className="figures sticky left-0 z-10 bg-raised" style={{ height }}>
          {/* The first and last hour sit on the grid's edges, where a centred label would be cut in half. */}
          {hours.slice(1, -1).map((hour) => (
            <span key={hour} className="absolute right-1.5 -translate-y-1/2 text-[0.7rem] text-muted" style={{ top: y(hour * 60) }}>
              {formatClock(timeFromMinutes(hour * 60)).replace(':00', '')}
            </span>
          ))}
        </div>

        {columns.map((column) => (
          <div key={column.key} className="hatched relative border-l border-line" style={{ height }}>
            {/* Working hours: plain background over the hatching. */}
            {column.open.map((range) => (
              <div key={range.start} className="absolute inset-x-0 bg-raised" style={{ top: y(range.start), height: y(range.end) - y(range.start) }} aria-hidden />
            ))}
            {/* Hour lines. */}
            {hours.map((hour) => (
              <div key={hour} className="absolute inset-x-0 border-t border-line/70" style={{ top: y(hour * 60) }} aria-hidden />
            ))}
            {column.open.length === 0 && column.blocks.length === 0 ? (
              <p className="absolute inset-x-2 top-3 text-center text-sm text-unavailable">Not working</p>
            ) : null}
            <ul>
              {column.blocks.map((block) => {
                const style = KIND[block.kind]
                const top = y(block.start)
                const blockHeight = Math.max(y(block.end) - top, 26)
                const body = (
                  <>
                    <span className="flex items-center gap-1 text-[0.7rem] font-semibold tracking-wide uppercase">
                      <Icon name={style.icon} className="size-3" />
                      {style.word}
                    </span>
                    <span className="when figures block text-xs">
                      {formatClock(timeFromMinutes(block.start))}–{formatClock(timeFromMinutes(block.end))}
                    </span>
                    <span className="block truncate text-sm font-semibold">{block.title}</span>
                    {block.detail ? <span className="block truncate text-xs">{block.detail}</span> : null}
                  </>
                )
                const className = cn('absolute inset-x-1 overflow-hidden rounded-control border-l-4 px-1.5 py-1 text-left no-underline', style.className)
                return (
                  <li key={block.key}>
                    {block.href ? (
                      <Link href={block.href} aria-label={block.label} className={cn(className, 'hover:brightness-95')} style={{ top, height: blockHeight }}>
                        {body}
                      </Link>
                    ) : (
                      <div aria-label={block.label} role="note" className={className} style={{ top, height: blockHeight }}>
                        {body}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
