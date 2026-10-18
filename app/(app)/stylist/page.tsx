// /stylist: today, for the stylist who is signed in.
//
// requireStylist() takes the stylist id from the SESSION, and every query
// below is scoped to it (bookingScope → b.stylist_id = mine). A stylist
// can't see a colleague's day by editing anything: there's nothing to edit.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { markBookingAction } from '@/app/(app)/appointments/actions'
import { StatusBadge } from '@/components/booking/status-badge'
import { ActionButton } from '@/components/forms/action-button'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { requireStylist } from '@/lib/booking/access'
import { listBookingsBetween } from '@/lib/booking/bookings'
import { formatPhone } from '@/lib/phone'
import { getSettings } from '@/lib/settings'
import { listTimeOffBetween } from '@/lib/studio/time-off'
import { addDays, currentTime, formatDayLong, formatDuration, formatTimeRange, startOfLocalDay, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'My day' }

export default function StylistTodayPage({ searchParams }: PageProps<'/stylist'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Today searchParams={searchParams} />
    </Suspense>
  )
}

async function Today({ searchParams }: Pick<PageProps<'/stylist'>, 'searchParams'>) {
  const { stylist, viewer } = await requireStylist()
  const settings = await getSettings()
  const tz = settings.timeZone
  const today = todayIn(tz)
  const start = startOfLocalDay(today, tz)
  const end = startOfLocalDay(addDays(today, 1), tz)
  const [bookings, timeOff] = await Promise.all([listBookingsBetween(viewer, start, end), listTimeOffBetween(start, end, stylist.id)])
  const { notice, denied } = await searchParams
  const now = currentTime().getTime()
  const active = bookings.filter((b) => b.status !== 'cancelled')
  const next = active.find((b) => b.status === 'confirmed' && b.startsAt.getTime() > now)

  return (
    <div className="space-y-6">
      <Flash
        message={notice === 'password-set' ? 'Your password is set. Welcome to Ìpàdé.' : denied ? 'That page isn’t part of a stylist account, so you’ve been brought here.' : null}
        tone={denied ? 'info' : 'success'}
      />
      <PageHeader
        title={`Today, ${stylist.displayName}`}
        description={`${formatDayLong(today)} · ${active.length} ${active.length === 1 ? 'appointment' : 'appointments'} · studio time, ${settings.zoneLabel}`}
        actions={
          <Link href="/stylist/week" className={button.secondary}>
            <Icon name="calendar" />
            My week
          </Link>
        }
      />

      {timeOff.length > 0 ? (
        <p className="hatched rounded-control border border-line p-3 text-sm">
          <Icon name="door" className="mr-1 inline size-4" />
          Time off today: {timeOff.map((t) => `${formatTimeRange(t.startsAt, t.endsAt, tz)}${t.reason ? ` (${t.reason})` : ''}`).join(', ')}
        </p>
      ) : null}

      {bookings.length === 0 ? (
        <EmptyState title="No appointments today">
          Enjoy the quiet. Your <Link href="/stylist/week">week view</Link> shows what’s coming.
        </EmptyState>
      ) : (
        <ol className="space-y-3" aria-label="Today’s appointments">
          {bookings.map((booking) => {
            const serviceEnd = new Date(booking.startsAt.getTime() + booking.durationMinutes * 60_000)
            const started = booking.startsAt.getTime() <= now
            const fields = { id: String(booking.id), version: String(booking.version) }
            return (
              <li
                key={booking.id}
                className={`rounded-card border bg-raised p-4 shadow-card ${booking.id === next?.id ? 'border-brand ring-2 ring-tint-strong' : 'border-line'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {booking.id === next?.id ? <p className="text-xs font-semibold tracking-wide text-brand uppercase">Next up</p> : null}
                    <p className={`figures text-lg font-semibold ${booking.status === 'cancelled' ? 'line-through' : ''}`}>{formatTimeRange(booking.startsAt, serviceEnd, tz)}</p>
                    <p className="font-semibold">
                      <Link href={`/appointments/${booking.id}`}>{booking.serviceName}</Link>{' '}
                      <span className="font-normal text-muted">· {formatDuration(booking.durationMinutes)}</span>
                    </p>
                    <p className="text-sm">
                      {booking.clientName}
                      {booking.isWalkIn ? <span className="text-muted"> (walk-in)</span> : null}
                      {booking.clientPhone ? (
                        <>
                          {' · '}
                          <a href={`tel:${booking.clientPhone}`} className="figures">
                            {formatPhone(booking.clientPhone)}
                          </a>
                        </>
                      ) : null}
                    </p>
                    {booking.clientNote ? <p className="mt-1 text-sm text-muted">“{booking.clientNote}”</p> : null}
                  </div>
                  <StatusBadge status={booking.status} />
                </div>
                {booking.status === 'confirmed' ? (
                  started ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      <ActionButton action={markBookingAction} fields={{ ...fields, outcome: 'completed' }} variant="primary" pendingLabel="Saving…">
                        <Icon name="checkCircle" />
                        Completed
                      </ActionButton>
                      <ActionButton action={markBookingAction} fields={{ ...fields, outcome: 'no_show' }} variant="secondary" pendingLabel="Saving…">
                        <Icon name="slotNoShow" />
                        No-show
                      </ActionButton>
                    </div>
                  ) : (
                    <p className="mt-3 border-t border-line pt-3 text-sm text-muted">You can mark it completed or a no-show once it has started.</p>
                  )
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
