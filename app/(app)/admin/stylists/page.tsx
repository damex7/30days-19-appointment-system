// /admin/stylists: stylist accounts, which services each offers, and
// whether they're taking bookings.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { setStylistActiveAction } from '@/app/(app)/admin/stylists/actions'
import { CreateStylistForm } from '@/components/admin/stylist-forms'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { cn } from '@/lib/cn'
import { listServicesForAdmin } from '@/lib/studio/services'
import { listStylistsForAdmin } from '@/lib/studio/stylists'

export const metadata: Metadata = { title: 'Stylists' }

export default function StylistsPage({ searchParams }: PageProps<'/admin/stylists'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Stylists searchParams={searchParams} />
    </Suspense>
  )
}

async function Stylists({ searchParams }: Pick<PageProps<'/admin/stylists'>, 'searchParams'>) {
  await requireRole('admin')
  const [stylists, services, { notice }] = await Promise.all([listStylistsForAdmin(), listServicesForAdmin(), searchParams])
  const live = services.filter((s) => !s.archivedAt)
  const names = new Map(services.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-6">
      <Flash message={notice === 'saved' ? 'Stylist saved.' : null} />
      <PageHeader title="Stylists" description="Stylist accounts are made here, never through sign-up. A stylist with bookings is taken off the booking page, never deleted." />

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {stylists.map((stylist) => (
          <li key={stylist.id} className={cn('rounded-card border bg-raised p-4 shadow-card', stylist.active ? 'border-line' : 'border-dashed border-line-strong')}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-sans text-lg font-semibold">{stylist.displayName}</h2>
              <span className="text-sm text-muted">({stylist.name})</span>
              {stylist.active ? null : <span className="rounded-pill bg-sunken px-2 py-0.5 text-xs font-semibold text-muted">Not taking bookings</span>}
            </div>
            <p className="mt-0.5 text-sm break-all">{stylist.email}</p>
            <p className="mt-1 text-sm text-muted">
              <span className={stylist.emailVerifiedAt ? 'text-success' : 'text-warning'}>{stylist.emailVerifiedAt ? '✓ Email confirmed' : '! Email not confirmed'}</span>
              {stylist.mustChangePassword ? ' · still on the temporary password' : ''} · {stylist.upcomingCount} upcoming
            </p>
            <p className="mt-2 text-sm">
              <span className="font-semibold">Offers: </span>
              {stylist.serviceIds.length ? stylist.serviceIds.map((id) => names.get(id)).filter(Boolean).join(', ') : <span className="text-danger">nothing yet</span>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/admin/stylists/${stylist.id}`} className={button.small}>
                <Icon name="edit" className="size-4" />
                Edit<span className="sr-only"> {stylist.displayName}</span>
              </Link>
              <Link href={`/admin/hours?stylist=${stylist.id}`} className={button.small}>
                <Icon name="clock" className="size-4" />
                Hours
              </Link>
              <ConfirmAction
                action={setStylistActiveAction}
                fields={{ id: String(stylist.id), active: stylist.active ? 'false' : 'true' }}
                trigger={stylist.active ? 'Stop bookings' : 'Take bookings'}
                icon={stylist.active ? 'lock' : 'restore'}
                danger={stylist.active}
                title={stylist.active ? `Take ${stylist.displayName} off the booking page?` : `Put ${stylist.displayName} back on the booking page?`}
                body={
                  stylist.active
                    ? 'Clients won’t be able to book them. This is refused while they have upcoming bookings. Their sign-in is unaffected (deactivate the account on the People page).'
                    : 'Clients will see their open times again.'
                }
                confirmLabel={stylist.active ? 'Stop bookings' : 'Take bookings'}
              />
            </div>
          </li>
        ))}
      </ul>

      <Sheet title="Add a stylist" id="add">
        <CreateStylistForm services={live.map((s) => ({ id: s.id, name: s.name, category: s.category }))} />
      </Sheet>
    </div>
  )
}
