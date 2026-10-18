// /appointments/42/reschedule?date=…&time=…: pick a new time for the SAME
// service with the SAME stylist. Uses the same pickers and the same
// open_slots() rules as /book, with one difference: the booking's own
// current time is ignored (ignoreBookingId), so moving 10:00 to 10:15 isn't
// blocked by itself.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RescheduleForm } from '@/components/booking/reschedule-form'
import { SlotPicker } from '@/components/booking/slot-picker'
import { dayItems, EmptyDay, groupTimes, TimeGroups } from '@/components/booking/when-picker'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { viewerFrom } from '@/lib/booking/access'
import { openDays, openTimes } from '@/lib/booking/availability'
import { getBooking } from '@/lib/booking/bookings'
import { parseChoice } from '@/lib/booking/flow'
import { getSettings } from '@/lib/settings'
import { closedDatesBetween } from '@/lib/studio/closures'
import { addDays, formatClock, formatDateTime, formatDayLong, formatTime, hoursUntil, localTimeOf, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'Reschedule' }

export default function ReschedulePage(props: PageProps<'/appointments/[id]/reschedule'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reschedule {...props} />
    </Suspense>
  )
}

async function Reschedule({ params, searchParams }: PageProps<'/appointments/[id]/reschedule'>) {
  await connection()
  // Clients move their own bookings; admins move anyone's. Stylists don't.
  const current = await requireRole('client', 'admin')
  const { id: rawId } = await params
  if (!/^\d{1,9}$/.test(rawId)) notFound()
  const [viewer, settings] = await Promise.all([viewerFrom(current), getSettings()])
  const booking = await getBooking(viewer, Number(rawId))
  if (!booking) notFound()

  const tz = settings.timeZone
  const base = `/appointments/${booking.id}/reschedule`
  const back = { href: `/appointments/${booking.id}`, label: 'Back to the appointment' }
  const isAdmin = viewer.role === 'admin'

  if (booking.status !== 'confirmed' || (!isAdmin && hoursUntil(booking.startsAt) <= settings.cancellationCutoffHours)) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={back} title="Reschedule" />
        <Notice tone="info" title={booking.status !== 'confirmed' ? 'This booking is no longer active.' : 'It’s too close to change online.'}>
          <p>Please message the studio on WhatsApp and we’ll do our best to help.</p>
        </Notice>
      </div>
    )
  }

  const { date, time } = parseChoice(await searchParams)
  const today = todayIn(tz)
  const lastDay = addDays(today, settings.bookingWindowDays)
  const chosenDate = date && date >= today && date <= lastDay ? date : null
  const [days, closed, times] = await Promise.all([
    openDays(booking.serviceId, booking.stylistId, today, lastDay, { ignoreBookingId: booking.id }),
    closedDatesBetween(today, lastDay),
    chosenDate ? openTimes(booking.serviceId, booking.stylistId, chosenDate, { ignoreBookingId: booking.id, staff: isAdmin }) : Promise.resolve([]),
  ])
  const chosenTime = time && times.some((t) => localTimeOf(t.startsAt, tz) === time) ? time : null
  const href = (d: string, t?: string) => `${base}?date=${d}${t ? `&time=${t}` : ''}`

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={back}
        title="Choose a new time"
        description={`${booking.serviceName} with ${booking.stylistName}, now ${formatDateTime(booking.startsAt, tz)}. Times are studio time, ${settings.zoneLabel}.`}
      />
      {time && !chosenTime ? <Notice tone="warning" title={`${formatClock(time)} isn’t open any more. Please pick another time.`} live /> : null}

      <section aria-labelledby="day-title">
        <h2 id="day-title" className="mb-2 font-sans text-base font-semibold">
          Choose a day
        </h2>
        <SlotPicker layout="strip" label="Days" items={dayItems(today, lastDay, days, closed, chosenDate, (d) => href(d))} />
      </section>

      {chosenDate ? (
        <section aria-labelledby="time-title">
          <h2 id="time-title" className="mb-2 font-sans text-base font-semibold">
            Open times on {formatDayLong(chosenDate)}
          </h2>
          {times.length > 0 ? (
            <TimeGroups
              groups={groupTimes(
                times.map((t) => t.startsAt),
                tz,
              )}
              makeItem={(instant) => {
                const t = localTimeOf(instant, tz)
                const selected = t === chosenTime
                return {
                  key: t,
                  href: href(chosenDate, t),
                  label: `${formatDayLong(chosenDate)}, ${formatTime(instant, tz)}, ${selected ? 'selected' : 'available'}`,
                  lines: [formatTime(instant, tz)],
                  state: selected ? 'selected' : 'open',
                }
              }}
            />
          ) : (
            <EmptyDay date={chosenDate} days={days} closed={closed.get(chosenDate)} href={(d) => href(d)} />
          )}
        </section>
      ) : null}

      {chosenDate && chosenTime ? (
        <section className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
          <RescheduleForm
            summary={`${formatDayLong(chosenDate)}, ${formatClock(chosenTime)}`}
            hidden={{ id: String(booking.id), version: String(booking.version), date: chosenDate, time: chosenTime }}
          />
        </section>
      ) : null}

      <p>
        <Link href={back.href}>Keep the current time</Link>
      </p>
    </div>
  )
}
