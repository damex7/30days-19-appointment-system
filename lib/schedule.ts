// Turning instants into positions on a day grid (components/schedule).
// A block's position is "minutes after LOCAL midnight in the studio's
// zone", worked out from real instants with lib/time.ts, so the grid reads
// the same whatever the server's or the viewer's clock says.
import type { GridBlock } from '@/components/schedule/schedule-grid'
import type { Booking } from '@/lib/booking/bookings'
import type { HoursBlock } from '@/lib/studio/hours'
import type { TimeOff } from '@/lib/studio/time-off'
import { formatTimeRange, minutesOfDay, startOfLocalDay, type LocalDate } from '@/lib/time'

const MINUTE = 60_000

/** Minutes from the start of `date` (local) to an instant; negative before, >1440 after. */
function minutesInto(date: LocalDate, instant: Date, timeZone: string): number {
  return Math.round((instant.getTime() - startOfLocalDay(date, timeZone).getTime()) / MINUTE)
}

/** Bookings on one local day as grid blocks. The block shows the SERVICE time; the clean-up buffer isn't drawn. */
export function bookingBlocks(bookings: Booking[], date: LocalDate, timeZone: string, show: 'client' | 'stylist' = 'client'): GridBlock[] {
  return bookings.map((booking) => {
    const serviceEnd = new Date(booking.startsAt.getTime() + booking.durationMinutes * MINUTE)
    const who = show === 'client' ? booking.clientName : booking.stylistName
    return {
      key: `b${booking.id}`,
      start: Math.max(0, minutesInto(date, booking.startsAt, timeZone)),
      end: Math.min(24 * 60, minutesInto(date, serviceEnd, timeZone)),
      kind: booking.status,
      title: booking.serviceName,
      detail: who,
      href: `/appointments/${booking.id}`,
      label: `${booking.serviceName} for ${booking.clientName}, ${formatTimeRange(booking.startsAt, serviceEnd, timeZone)}, ${
        { confirmed: 'booked', completed: 'completed', cancelled: 'cancelled', no_show: 'no-show' }[booking.status]
      }`,
    }
  })
}

/** Time off overlapping one local day, clipped to that day. */
export function timeOffBlocks(entries: TimeOff[], date: LocalDate, timeZone: string): GridBlock[] {
  return entries.map((entry) => ({
    key: `t${entry.id}`,
    start: Math.max(0, minutesInto(date, entry.startsAt, timeZone)),
    end: Math.min(24 * 60, minutesInto(date, entry.endsAt, timeZone)),
    kind: 'time_off',
    title: 'Time off',
    detail: entry.reason || undefined,
    label: `Time off, ${formatTimeRange(entry.startsAt, entry.endsAt, timeZone)}${entry.reason ? `: ${entry.reason}` : ''}`,
  }))
}

/** A stylist's working blocks on a weekday, in minutes (wall-clock rules need no zone). */
export function openRanges(hours: HoursBlock[], stylistId: number, dayOfWeek: number): { start: number; end: number }[] {
  return hours
    .filter((h) => h.stylistId === stylistId && h.dayOfWeek === dayOfWeek)
    .map((h) => ({ start: minutesOfDay(h.startTime), end: minutesOfDay(h.endTime) }))
}
