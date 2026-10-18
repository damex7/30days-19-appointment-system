// /admin?date=2026-10-21: the whole studio on one day, stylists side by
// side as columns, time running down. On a phone the columns scroll
// sideways under sticky time labels (components/schedule/schedule-grid.tsx).
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ScheduleGrid, type GridColumn } from '@/components/schedule/schedule-grid'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { viewerFrom } from '@/lib/booking/access'
import { listBookingsBetween } from '@/lib/booking/bookings'
import { formatNaira } from '@/lib/money'
import { bookingBlocks, openRanges, timeOffBlocks } from '@/lib/schedule'
import { getSettings } from '@/lib/settings'
import { closedDatesBetween } from '@/lib/studio/closures'
import { listHours } from '@/lib/studio/hours'
import { listStylistOptions } from '@/lib/studio/stylists'
import { listTimeOffBetween } from '@/lib/studio/time-off'
import { addDays, dayOfWeek, formatDayWithYear, isLocalDate, startOfLocalDay, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'Day view' }

export default function AdminDayPage({ searchParams }: PageProps<'/admin'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DayView searchParams={searchParams} />
    </Suspense>
  )
}

async function DayView({ searchParams }: Pick<PageProps<'/admin'>, 'searchParams'>) {
  const current = await requireRole('admin')
  const [settings, params, viewer] = await Promise.all([getSettings(), searchParams, viewerFrom(current)])
  const tz = settings.timeZone
  const today = todayIn(tz)
  const date = typeof params.date === 'string' && isLocalDate(params.date) ? params.date : today
  const start = startOfLocalDay(date, tz)
  const end = startOfLocalDay(addDays(date, 1), tz)

  const [bookings, timeOff, hours, stylists, closed] = await Promise.all([
    listBookingsBetween(viewer, start, end),
    listTimeOffBetween(start, end),
    listHours(),
    listStylistOptions(),
    closedDatesBetween(date, date),
  ])
  const closure = closed.get(date)
  // Active stylists, plus any inactive one who still has a booking that day.
  const shown = stylists.filter((s) => s.active || bookings.some((b) => b.stylistId === s.id))
  const columns: GridColumn[] = shown.map((stylist) => {
    const own = bookings.filter((b) => b.stylistId === stylist.id)
    return {
      key: String(stylist.id),
      heading: stylist.displayName,
      subheading: `${own.filter((b) => b.status !== 'cancelled').length} booked`,
      open: closure ? [] : openRanges(hours, stylist.id, dayOfWeek(date)),
      blocks: [
        ...timeOffBlocks(
          timeOff.filter((t) => t.stylistId === stylist.id),
          date,
          tz,
        ),
        ...bookingBlocks(own, date, tz, 'client'),
      ],
    }
  })
  const live = bookings.filter((b) => b.status !== 'cancelled')
  const takings = live.reduce((sum, b) => sum + b.priceKobo, 0)

  return (
    <div className="space-y-5">
      <Flash
        message={params.notice === 'password-set' ? 'Your password is set.' : params.denied ? 'That page is for clients or stylists, so you’ve been brought to the day view.' : null}
        tone={params.denied ? 'info' : 'success'}
      />
      <PageHeader
        title={date === today ? 'Today' : formatDayWithYear(date)}
        description={
          closure
            ? `The studio is closed: ${closure}.`
            : `${live.length} appointments · ${formatNaira(takings)} booked · studio time, ${settings.zoneLabel}`
        }
        actions={
          <Link href={`/admin/bookings/new?date=${date}`} className={button.primary}>
            <Icon name="plus" />
            New booking
          </Link>
        }
      />
      <div className="flex flex-wrap items-end gap-2">
        <nav aria-label="Days" className="flex gap-2">
          <Link href={`/admin?date=${addDays(date, -1)}`} className={button.secondary}>
            <Icon name="chevronLeft" />
            <span className="sr-only">Previous day</span>
          </Link>
          <Link href="/admin" className={button.ghost} aria-current={date === today ? 'date' : undefined}>
            Today
          </Link>
          <Link href={`/admin?date=${addDays(date, 1)}`} className={button.secondary}>
            <span className="sr-only">Next day</span>
            <Icon name="chevronRight" />
          </Link>
        </nav>
        {/* A GET form: the chosen day goes into the URL. */}
        <form action="/admin" className="flex items-end gap-2">
          <div>
            <label htmlFor="day" className="block text-sm font-semibold">
              Go to a day
            </label>
            <input id="day" name="date" type="date" defaultValue={date} className="field figures min-h-11 px-2" />
          </div>
          <button type="submit" className={button.secondary}>
            Show
          </button>
        </form>
      </div>
      <ScheduleGrid columns={columns} startHour={7} endHour={20} label={`Studio schedule for ${formatDayWithYear(date)}, one column per stylist`} />
    </div>
  )
}
