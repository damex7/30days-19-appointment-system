// /stylist/week?start=2026-10-19: the signed-in stylist's own week,
// Monday to Sunday, as a time grid. The week is in the URL, so the
// previous/next links and the back button work.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ScheduleGrid, type GridColumn } from '@/components/schedule/schedule-grid'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { requireStylist } from '@/lib/booking/access'
import { listBookingsBetween } from '@/lib/booking/bookings'
import { bookingBlocks, openRanges, timeOffBlocks } from '@/lib/schedule'
import { getSettings } from '@/lib/settings'
import { closedDatesBetween } from '@/lib/studio/closures'
import { listHours } from '@/lib/studio/hours'
import { listTimeOffBetween } from '@/lib/studio/time-off'
import { addDays, dayChipParts, dayOfWeek, formatDayLong, isLocalDate, localDateOf, startOfLocalDay, startOfWeek, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'My week' }

export default function StylistWeekPage({ searchParams }: PageProps<'/stylist/week'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Week searchParams={searchParams} />
    </Suspense>
  )
}

async function Week({ searchParams }: Pick<PageProps<'/stylist/week'>, 'searchParams'>) {
  const { stylist, viewer } = await requireStylist()
  const settings = await getSettings()
  const tz = settings.timeZone
  const today = todayIn(tz)
  const raw = (await searchParams).start
  // Any date in the URL snaps to its Monday; nonsense falls back to this week.
  const monday = startOfWeek(typeof raw === 'string' && isLocalDate(raw) ? raw : today)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const rangeStart = startOfLocalDay(monday, tz)
  const rangeEnd = startOfLocalDay(addDays(monday, 7), tz)

  const [bookings, timeOff, hours, closed] = await Promise.all([
    listBookingsBetween(viewer, rangeStart, rangeEnd),
    listTimeOffBetween(rangeStart, rangeEnd, stylist.id),
    listHours(stylist.id),
    closedDatesBetween(monday, addDays(monday, 6)),
  ])

  const columns: GridColumn[] = days.map((day) => {
    const parts = dayChipParts(day)
    const closure = closed.get(day)
    const dayBookings = bookings.filter((b) => localDateOf(b.startsAt, tz) === day)
    const dayOff = timeOff.filter((t) => t.startsAt < startOfLocalDay(addDays(day, 1), tz) && t.endsAt > startOfLocalDay(day, tz))
    return {
      key: day,
      heading: `${day === today ? 'Today' : parts.weekday} ${parts.day} ${parts.month}`,
      subheading: closure ? `Closed: ${closure}` : `${dayBookings.filter((b) => b.status !== 'cancelled').length} booked`,
      open: closure ? [] : openRanges(hours, stylist.id, dayOfWeek(day)),
      blocks: [...timeOffBlocks(dayOff, day, tz), ...bookingBlocks(dayBookings, day, tz, 'client')],
      highlight: day === today,
    }
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="My week"
        description={`${formatDayLong(monday)} to ${formatDayLong(addDays(monday, 6))}. Hatched = outside your working hours. Studio time, ${settings.zoneLabel}.`}
        actions={
          <nav aria-label="Weeks" className="flex gap-2">
            <Link href={`/stylist/week?start=${addDays(monday, -7)}`} className={button.secondary}>
              <Icon name="chevronLeft" />
              <span className="sr-only sm:not-sr-only">Previous</span>
              <span className="sr-only"> week</span>
            </Link>
            <Link href="/stylist/week" className={button.ghost}>
              This week
            </Link>
            <Link href={`/stylist/week?start=${addDays(monday, 7)}`} className={button.secondary}>
              <span className="sr-only sm:not-sr-only">Next</span>
              <span className="sr-only"> week</span>
              <Icon name="chevronRight" />
            </Link>
          </nav>
        }
      />
      <ScheduleGrid columns={columns} startHour={7} endHour={20} label="My week, scroll sideways for more days" />
    </div>
  )
}
