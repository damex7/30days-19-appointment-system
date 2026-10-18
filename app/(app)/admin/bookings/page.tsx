// /admin/bookings?stylist=3&service=7&status=confirmed&from=…&to=…&page=2
//
// Every filter lives in the URL (a GET form), so a filtered list can be
// bookmarked, shared, refreshed and navigated back to. Bad values fall
// back to "no filter" instead of erroring (lib/studio/validation.ts).
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { StatusBadge, STATUS_LABELS } from '@/components/booking/status-badge'
import { SelectField, TextField } from '@/components/forms/field'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/table-parts'
import { requireRole } from '@/lib/auth/dal'
import { viewerFrom } from '@/lib/booking/access'
import { ADMIN_BOOKINGS_PAGE_SIZE, BOOKING_STATUSES, listBookingsForAdmin } from '@/lib/booking/bookings'
import { formatNaira } from '@/lib/money'
import { getSettings } from '@/lib/settings'
import { listServicesForAdmin } from '@/lib/studio/services'
import { listStylistOptions } from '@/lib/studio/stylists'
import { bookingFiltersSchema } from '@/lib/studio/validation'
import { hrefWith } from '@/lib/url'
import { addDays, formatDayShort, formatTime, localDateOf, startOfLocalDay, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'All bookings' }

export default function AdminBookingsPage({ searchParams }: PageProps<'/admin/bookings'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  )
}

async function Bookings({ searchParams }: Pick<PageProps<'/admin/bookings'>, 'searchParams'>) {
  const current = await requireRole('admin')
  const [settings, raw, viewer, stylists, services] = await Promise.all([getSettings(), searchParams, viewerFrom(current), listStylistOptions(), listServicesForAdmin()])
  const tz = settings.timeZone
  const today = todayIn(tz)
  const f = bookingFiltersSchema.parse(raw)
  // Defaults: the next two weeks. The date range is in the studio's days.
  const from = f.from ?? today
  const to = f.to && f.to >= from ? f.to : addDays(from, 14)
  const page = f.page ?? 1
  const { bookings, total } = await listBookingsForAdmin(viewer, {
    stylistId: f.stylist ?? null,
    serviceId: f.service ?? null,
    status: f.status ?? null,
    from: startOfLocalDay(from, tz),
    to: startOfLocalDay(addDays(to, 1), tz),
    page,
  })
  const current_ = { stylist: f.stylist ?? undefined, service: f.service ?? undefined, status: f.status ?? undefined, from, to }

  return (
    <div className="space-y-5">
      <PageHeader
        title="All bookings"
        description={`${total} ${total === 1 ? 'booking' : 'bookings'} from ${formatDayShort(from)} to ${formatDayShort(to)} · studio time, ${settings.zoneLabel}`}
        actions={
          <Link href="/admin/bookings/new" className={button.primary}>
            <Icon name="plus" />
            New booking
          </Link>
        }
      />

      <form action="/admin/bookings" role="search" aria-label="Filter bookings" className="grid grid-cols-1 gap-3 rounded-card border border-line bg-raised p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <SelectField name="stylist" label="Stylist" defaultValue={String(f.stylist ?? '')}>
          <option value="">Everyone</option>
          {stylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </SelectField>
        <SelectField name="service" label="Service" defaultValue={String(f.service ?? '')}>
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField name="status" label="Status" defaultValue={f.status ?? ''}>
          <option value="">Any status</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <TextField name="from" type="date" label="From" defaultValue={from} />
        <TextField name="to" type="date" label="To" defaultValue={to} />
        <div className="flex gap-2">
          <button type="submit" className={`${button.primary} flex-1`}>
            <Icon name="filter" />
            Filter
          </button>
          <Link href="/admin/bookings" className={button.ghost}>
            Clear
          </Link>
        </div>
      </form>

      {bookings.length === 0 ? (
        <EmptyState title="No bookings match">Try a wider date range or fewer filters.</EmptyState>
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-line bg-raised shadow-card">
          <table className="figures w-full min-w-[44rem] text-left text-[0.95rem]">
            <caption className="sr-only">Bookings, earliest first</caption>
            <thead className="bg-tint text-sm">
              <tr>
                <th scope="col" className="px-3 py-2.5">When</th>
                <th scope="col" className="px-3 py-2.5">Client</th>
                <th scope="col" className="px-3 py-2.5">Service</th>
                <th scope="col" className="px-3 py-2.5">Stylist</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-tint">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Link href={`/appointments/${b.id}`} className="font-semibold">
                      {formatDayShort(localDateOf(b.startsAt, tz))}, {formatTime(b.startsAt, tz)}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {b.clientName}
                    {b.isWalkIn ? <span className="text-sm text-muted"> (walk-in)</span> : null}
                  </td>
                  <td className="px-3 py-2.5">{b.serviceName}</td>
                  <td className="px-3 py-2.5">{b.stylistName}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNaira(b.priceKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={ADMIN_BOOKINGS_PAGE_SIZE} hrefFor={(p) => hrefWith('/admin/bookings', current_, { page: p }, { page: 1 })} label="Booking pages" />
    </div>
  )
}
