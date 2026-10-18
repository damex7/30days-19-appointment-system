// /appointments/42: one booking, for whoever may see it.
//
// THE OWNERSHIP RULE IN ACTION: getBooking(viewer, 42) only finds booking
// 42 if it's the client's own, the stylist's own, or the viewer is an admin
// (lib/booking/access.ts). Anyone else gets notFound(): a 404, the same as
// for an id that doesn't exist. Change the number in the address bar and
// you learn nothing.
//
// What can be DONE depends on the role and the clock:
//   client  reschedule / cancel, only until the cut-off
//   stylist mark completed / no-show, only once it has started
//   admin   all of it, any time
// The buttons are only a convenience; each action checks the same rules again.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { markBookingAction, cancelBookingAction } from '@/app/(app)/appointments/actions'
import { StatusBadge } from '@/components/booking/status-badge'
import { ActionButton } from '@/components/forms/action-button'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { TextAreaField } from '@/components/forms/field'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { Notice } from '@/components/ui/notice'
import { PageHeader } from '@/components/ui/page-header'
import { verifySession } from '@/lib/auth/dal'
import { viewerFrom } from '@/lib/booking/access'
import { getBooking, listBookingEvents, type Booking, type BookingEvent } from '@/lib/booking/bookings'
import { formatNaira } from '@/lib/money'
import { formatPhone, whatsappLink } from '@/lib/phone'
import { getSettings, type StudioSettings } from '@/lib/settings'
import { formatDateTime, formatDayWithYear, formatDuration, formatStamp, formatTimeRange, hoursUntil, localDateOf } from '@/lib/time'

export const metadata: Metadata = { title: 'Appointment' }

const NOTICES: Record<string, string> = {
  booked: 'You’re booked! A confirmation with a calendar file is on its way to your inbox.',
  rescheduled: 'Moved. We’ve emailed you the new time and an updated calendar file.',
  cancelled: 'Cancelled. The time is free for someone else now.',
}

export default function AppointmentPage({ params, searchParams }: PageProps<'/appointments/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Appointment params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Appointment({ params, searchParams }: PageProps<'/appointments/[id]'>) {
  const current = await verifySession()
  const { id: rawId } = await params
  // Not a number at all? Same 404 as someone else's booking.
  if (!/^\d{1,9}$/.test(rawId)) notFound()
  const id = Number(rawId)

  const [viewer, settings] = await Promise.all([viewerFrom(current), getSettings()])
  const [booking, events] = await Promise.all([getBooking(viewer, id), listBookingEvents(viewer, id)])
  if (!booking) notFound()

  const notice = (await searchParams).notice
  const tz = settings.timeZone
  const serviceEnd = new Date(booking.startsAt.getTime() + booking.durationMinutes * 60_000)
  const role = viewer.role

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Flash message={typeof notice === 'string' ? (NOTICES[notice] ?? null) : null} />
      <PageHeader
        back={role === 'client' ? { href: '/appointments', label: 'My appointments' } : role === 'stylist' ? { href: '/stylist', label: 'My day' } : { href: '/admin/bookings', label: 'All bookings' }}
        title={booking.serviceName}
        description={<StatusBadge status={booking.status} className="text-sm" />}
      />

      <section aria-label="Details" className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
        <dl className="figures grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="When">
            <span className={booking.status === 'cancelled' ? 'line-through' : undefined}>
              {formatDayWithYear(localDateOf(booking.startsAt, tz))}
              <br />
              {formatTimeRange(booking.startsAt, serviceEnd, tz)}
            </span>
            <span className="block text-sm font-normal text-muted">Studio time, {settings.zoneLabel}</span>
          </Detail>
          <Detail label="Service">
            {booking.serviceName}
            <span className="block text-sm font-normal text-muted">{formatDuration(booking.durationMinutes)}</span>
          </Detail>
          <Detail label="Stylist">{booking.stylistName}</Detail>
          <Detail label="Price">
            {formatNaira(booking.priceKobo)}
            <span className="block text-sm font-normal text-muted">Paid at the studio</span>
          </Detail>
          {role !== 'client' ? (
            <Detail label="Client">
              {booking.clientName}
              {booking.isWalkIn ? <span className="block text-sm font-normal text-muted">Walk-in / phone booking</span> : null}
              {booking.clientPhone ? (
                <a href={`tel:${booking.clientPhone}`} className="block text-sm">
                  {formatPhone(booking.clientPhone)}
                </a>
              ) : null}
            </Detail>
          ) : null}
          <Detail label="Booking">#{booking.id}</Detail>
          {booking.clientNote ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Note</dt>
              <dd className="mt-0.5">“{booking.clientNote}”</dd>
            </div>
          ) : null}
          {booking.status === 'cancelled' ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Cancelled</dt>
              <dd className="mt-0.5">
                {booking.cancelledAt ? formatStamp(booking.cancelledAt, tz) : null}
                {booking.cancelledByName ? ` by ${booking.cancelledByName}` : ''}
                {booking.cancelReason ? `: “${booking.cancelReason}”` : ''}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:flex-wrap">
          {booking.status !== 'cancelled' ? (
            <a href={`/appointments/${booking.id}/calendar.ics`} className={button.secondary} download>
              <Icon name="download" />
              Add to calendar (.ics)
            </a>
          ) : null}
          <a
            href={whatsappLink(settings.whatsappNumber, `Hello, it’s ${booking.clientName} about booking #${booking.id} (${booking.serviceName}, ${formatDateTime(booking.startsAt, tz)}).`)}
            className={button.secondary}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="chat" />
            WhatsApp the studio
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </section>

      <Actions booking={booking} role={role} settings={settings} />

      <History events={events} timeZone={tz} />
    </div>
  )
}

/** What this person may do with this booking right now. */
function Actions({ booking, role, settings }: { booking: Booking; role: 'client' | 'stylist' | 'admin'; settings: StudioSettings }) {
  if (booking.status !== 'confirmed') return null
  const fields = { id: String(booking.id), version: String(booking.version) }
  const started = hoursUntil(booking.startsAt) <= 0
  const beforeCutoff = hoursUntil(booking.startsAt) > settings.cancellationCutoffHours
  const canChange = role === 'admin' || (role === 'client' && beforeCutoff)
  const ended = hoursUntil(booking.endsAt) <= 0

  return (
    <section aria-labelledby="actions-title" className="rounded-card border border-line bg-raised p-5 shadow-card sm:p-7">
      <h2 id="actions-title" className="text-2xl">
        {role === 'stylist' ? 'After the appointment' : 'Need to change it?'}
      </h2>

      {role !== 'stylist' && !ended ? (
        canChange ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
            <Link href={`/appointments/${booking.id}/reschedule`} className={button.primary}>
              <Icon name="calendar" />
              Reschedule
            </Link>
            <ConfirmAction
              action={cancelBookingAction}
              fields={fields}
              trigger="Cancel appointment"
              triggerVariant="dangerOutline"
              icon="close"
              danger
              title="Cancel this appointment?"
              body={`${booking.serviceName} with ${booking.stylistName}, ${formatDateTime(booking.startsAt, settings.timeZone)}. The time will be offered to other clients straight away.`}
              confirmLabel="Yes, cancel it"
              pendingLabel="Cancelling…"
              formExtra={<TextAreaField name="reason" label="Reason (optional)" rows={2} maxLength={300} />}
            />
          </div>
        ) : (
          <Notice tone="info" title="It’s too close to change online" className="mt-4">
            <p>
              Appointments can be changed online up to {settings.cancellationCutoffHours} hours before they start. Please{' '}
              <a href={whatsappLink(settings.whatsappNumber, `Hello, I need to change booking #${booking.id}.`)} target="_blank" rel="noopener noreferrer">
                message the studio on WhatsApp
              </a>{' '}
              and we’ll do our best to help.
            </p>
          </Notice>
        )
      ) : null}

      {role !== 'client' ? (
        started ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton action={markBookingAction} fields={{ ...fields, outcome: 'completed' }} variant="primary" pendingLabel="Saving…">
              <Icon name="checkCircle" />
              Mark completed
            </ActionButton>
            <ActionButton action={markBookingAction} fields={{ ...fields, outcome: 'no_show' }} variant="secondary" pendingLabel="Saving…">
              <Icon name="slotNoShow" />
              Mark no-show
            </ActionButton>
          </div>
        ) : (
          <p className="mt-3 text-muted">Completed and no-show can be marked once the appointment has started.</p>
        )
      ) : null}
    </section>
  )
}

const EVENT_LABELS: Record<BookingEvent['type'], string> = {
  created: 'Booked',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  completed: 'Marked completed',
  no_show: 'Marked no-show',
  reminder_sent: 'Reminder email sent',
}

/** The append-only history from booking_events. */
function History({ events, timeZone }: { events: BookingEvent[]; timeZone: string }) {
  if (events.length === 0) return null
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="mb-3 flex items-center gap-2 text-2xl">
        <Icon name="history" className="size-5 text-brand" />
        History
      </h2>
      <ol className="space-y-3 border-l-2 border-tint-strong pl-5">
        {events.map((event) => (
          <li key={event.id} className="figures text-[0.95rem]">
            <p className="font-semibold">
              {EVENT_LABELS[event.type]}
              {event.actorName ? <span className="font-normal text-muted"> by {event.actorName}</span> : null}
            </p>
            {event.type === 'rescheduled' && event.fromStart && event.toStart ? (
              <p className="text-sm">
                from {formatDateTime(event.fromStart, timeZone)} to {formatDateTime(event.toStart, timeZone)}
              </p>
            ) : null}
            {event.note ? <p className="text-sm">“{event.note}”</p> : null}
            <p className="text-sm text-muted">{formatStamp(event.createdAt, timeZone)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  )
}
