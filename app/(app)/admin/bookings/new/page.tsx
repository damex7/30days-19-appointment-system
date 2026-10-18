// /admin/bookings/new?service=7&stylist=any&date=…&time=…: booking for a
// walk-in or phone client. The same URL-driven steps and pickers as /book,
// in STAFF mode: today's remaining times are open right now (no minimum
// notice), and there is no booking window.
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { AdminBookForm } from '@/components/admin/admin-book-form'
import { SlotPicker } from '@/components/booking/slot-picker'
import { dayItems, EmptyDay, groupTimes, TimeGroups } from '@/components/booking/when-picker'
import { SelectField } from '@/components/forms/field'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { openDays, openTimes } from '@/lib/booking/availability'
import { parseChoice } from '@/lib/booking/flow'
import { formatNaira } from '@/lib/money'
import { getSettings } from '@/lib/settings'
import { closedDatesBetween } from '@/lib/studio/closures'
import { listServicesForAdmin } from '@/lib/studio/services'
import { listPublicStylists } from '@/lib/studio/stylists'
import { addDays, formatClock, formatDayLong, formatDuration, formatTime, localTimeOf, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'New booking' }

export default function NewBookingPage({ searchParams }: PageProps<'/admin/bookings/new'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewBooking searchParams={searchParams} />
    </Suspense>
  )
}

async function NewBooking({ searchParams }: Pick<PageProps<'/admin/bookings/new'>, 'searchParams'>) {
  await connection()
  await requireRole('admin')
  const [settings, services, stylists, raw] = await Promise.all([getSettings(), listServicesForAdmin(), listPublicStylists(), searchParams])
  const tz = settings.timeZone
  const today = todayIn(tz)
  const lastDay = addDays(today, 60)
  const live = services.filter((s) => !s.archivedAt)
  // The service is chosen by id here (a select), the stylist by id or "any".
  const serviceId = typeof raw.service === 'string' && /^\d+$/.test(raw.service) ? Number(raw.service) : null
  const service = live.find((s) => s.id === serviceId) ?? null
  const { stylist, date: rawDate, time } = parseChoice(raw)
  const offering = service ? stylists.filter((s) => s.serviceIds.includes(service.id)) : []
  const stylistOk = stylist === 'any' || (typeof stylist === 'number' && offering.some((s) => s.id === stylist))
  const chosenStylist = service && stylistOk ? stylist : null
  const stylistId = typeof chosenStylist === 'number' ? chosenStylist : null
  const date = rawDate && rawDate >= today && rawDate <= lastDay ? rawDate : today

  const href = (d: string, t?: string) => {
    const p = new URLSearchParams({ service: String(service?.id ?? ''), stylist: String(chosenStylist ?? ''), date: d })
    if (t) p.set('time', t)
    return `/admin/bookings/new?${p}`
  }

  let days = new Map<string, number>()
  let closed = new Map<string, string>()
  let times: Awaited<ReturnType<typeof openTimes>> = []
  if (service && chosenStylist !== null) {
    ;[days, closed, times] = await Promise.all([
      openDays(service.id, stylistId, today, lastDay, { staff: true }),
      closedDatesBetween(today, lastDay),
      openTimes(service.id, stylistId, date, { staff: true }),
    ])
  }
  const chosenTime = time && times.some((t) => localTimeOf(t.startsAt, tz) === time) ? time : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader back={{ href: '/admin', label: 'Day view' }} title="New booking" description={`For a walk-in or a phone call. Times are studio time, ${settings.zoneLabel}; no minimum notice applies here.`} />

      {/* Step 1: a GET form, so the choice goes into the URL. */}
      <form action="/admin/bookings/new" className="grid grid-cols-1 gap-3 rounded-card border border-line bg-raised p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField name="service" label="Service" defaultValue={String(service?.id ?? '')}>
          <option value="">Choose…</option>
          {live.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({formatDuration(s.durationMinutes)}, {formatNaira(s.priceKobo)})
            </option>
          ))}
        </SelectField>
        <SelectField name="stylist" label="Stylist" defaultValue={String(chosenStylist ?? 'any')}>
          <option value="any">Any available</option>
          {stylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </SelectField>
        <input type="hidden" name="date" value={date} />
        <button type="submit" className={button.primary}>
          Show times
        </button>
      </form>
      {service && !stylistOk && stylist !== null ? <p className="text-danger">That stylist doesn’t offer {service.name}. Choose another, or “Any available”.</p> : null}

      {service && chosenStylist !== null ? (
        <section aria-labelledby="when-title" className="space-y-4">
          <h2 id="when-title" className="text-2xl">
            When?
          </h2>
          <SlotPicker layout="strip" label="Days" items={dayItems(today, lastDay, days, closed, date, (d) => href(d))} />
          <h3 className="font-sans text-base font-semibold">Open times on {formatDayLong(date)}</h3>
          {times.length > 0 ? (
            <TimeGroups
              groups={groupTimes(
                times.map((t) => t.startsAt),
                tz,
              )}
              makeItem={(instant) => {
                const t = localTimeOf(instant, tz)
                return {
                  key: t,
                  href: href(date, t),
                  label: `${formatDayLong(date)}, ${formatTime(instant, tz)}, ${t === chosenTime ? 'selected' : 'available'}`,
                  lines: [formatTime(instant, tz)],
                  state: t === chosenTime ? 'selected' : 'open',
                }
              }}
            />
          ) : (
            <EmptyDay date={date} days={days} closed={closed.get(date)} href={(d) => href(d)} />
          )}
        </section>
      ) : null}

      {service && chosenStylist !== null && chosenTime ? (
        <Sheet title={`${service.name}, ${formatDayLong(date)} at ${formatClock(chosenTime)}`} id="who">
          <AdminBookForm hidden={{ service: String(service.id), stylist: String(chosenStylist), date, time: chosenTime }} />
        </Sheet>
      ) : null}
    </div>
  )
}
