// One booking in a list: when, what, with whom, and its status.
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import type { Booking } from '@/lib/booking/bookings'
import { cn } from '@/lib/cn'
import { formatNaira } from '@/lib/money'
import { dayChipParts, formatDuration, formatTimeRange, localDateOf } from '@/lib/time'
import { StatusBadge } from './status-badge'

export function BookingCard({ booking, timeZone, show = 'stylist' }: { booking: Booking; timeZone: string; show?: 'stylist' | 'client' }) {
  const day = dayChipParts(localDateOf(booking.startsAt, timeZone))
  // The appointment itself ends before the clean-up buffer.
  const serviceEnd = new Date(booking.startsAt.getTime() + booking.durationMinutes * 60_000)
  const cancelled = booking.status === 'cancelled'
  return (
    <Link
      href={`/appointments/${booking.id}`}
      className="flex items-stretch gap-4 rounded-card border border-line bg-raised p-4 text-ink no-underline shadow-card transition-colors hover:border-brand"
    >
      <span className={cn('figures flex w-16 shrink-0 flex-col items-center justify-center rounded-control py-2', cancelled ? 'bg-sunken text-muted' : 'bg-tint text-brand')} aria-hidden>
        <span className="text-xs font-semibold uppercase">{day.weekday}</span>
        <span className="text-2xl leading-tight font-semibold">{day.day}</span>
        <span className="text-xs">{day.month}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{booking.serviceName}</span>
          <StatusBadge status={booking.status} />
        </span>
        <span className={cn('figures mt-1 block text-sm', cancelled && 'line-through')}>
          {formatTimeRange(booking.startsAt, serviceEnd, timeZone)} · {formatDuration(booking.durationMinutes)}
        </span>
        <span className="mt-0.5 block text-sm text-muted">
          {show === 'stylist' ? `with ${booking.stylistName}` : booking.clientName} · <span className="figures">{formatNaira(booking.priceKobo)}</span>
        </span>
      </span>
      <Icon name="chevronRight" className="shrink-0 self-center text-muted" />
    </Link>
  )
}
