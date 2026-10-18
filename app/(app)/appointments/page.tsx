// /appointments: a CLIENT's own bookings, upcoming and past.
// listClientBookings filters on client_id = the SESSION's user id; there
// is no id in the URL to tamper with.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BookingCard } from '@/components/booking/booking-card'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { listClientBookings } from '@/lib/booking/bookings'
import { getSettings } from '@/lib/settings'

export const metadata: Metadata = { title: 'My appointments' }

export default function AppointmentsPage({ searchParams }: PageProps<'/appointments'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Appointments searchParams={searchParams} />
    </Suspense>
  )
}

const NOTICES: Record<string, string> = {
  verified: 'Thank you, your email address is confirmed. You can book now.',
  'password-reset': 'Your password was changed and you’re signed in.',
  'password-set': 'Your password is set.',
}

async function Appointments({ searchParams }: Pick<PageProps<'/appointments'>, 'searchParams'>) {
  const { user } = await requireRole('client')
  const [{ upcoming, past }, settings, { notice, denied }] = await Promise.all([listClientBookings(user.id), getSettings(), searchParams])

  return (
    <div className="space-y-8">
      <Flash
        message={denied ? 'That page is for studio staff, so you’ve been brought to your appointments.' : typeof notice === 'string' ? (NOTICES[notice] ?? null) : null}
        tone={denied ? 'info' : 'success'}
      />
      <PageHeader
        title="My appointments"
        description={`Times are studio time in Lagos, ${settings.zoneLabel}. You can reschedule or cancel up to ${settings.cancellationCutoffHours} hours before.`}
        actions={
          <Link href="/book" className={button.primary}>
            <Icon name="plus" />
            Book an appointment
          </Link>
        }
      />

      <section aria-labelledby="upcoming-title">
        <h2 id="upcoming-title" className="mb-3 text-3xl">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming appointments">
            <Link href="/book">Book one now</Link>: it takes about a minute.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {upcoming.map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking} timeZone={settings.timeZone} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past-title">
        <h2 id="past-title" className="mb-3 text-3xl">
          Past and cancelled
        </h2>
        {past.length === 0 ? (
          <p className="text-muted">Nothing here yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {past.map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking} timeZone={settings.timeZone} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
