// /admin/services: the menu, with archive, restore and delete.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { archiveServiceAction, deleteServiceAction } from '@/app/(app)/admin/services/actions'
import { ActionButton } from '@/components/forms/action-button'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Flash } from '@/components/ui/flash'
import { Icon } from '@/components/ui/icon'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { cn } from '@/lib/cn'
import { formatNaira } from '@/lib/money'
import { CATEGORY_LABELS } from '@/lib/studio/categories'
import { listServicesForAdmin } from '@/lib/studio/services'
import { formatDuration } from '@/lib/time'

export const metadata: Metadata = { title: 'Services' }

const NOTICES: Record<string, string> = { created: 'Service added to the menu.', saved: 'Changes saved.' }

export default function ServicesPage({ searchParams }: PageProps<'/admin/services'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Services searchParams={searchParams} />
    </Suspense>
  )
}

async function Services({ searchParams }: Pick<PageProps<'/admin/services'>, 'searchParams'>) {
  await requireRole('admin')
  const [services, { notice }] = await Promise.all([listServicesForAdmin(), searchParams])

  return (
    <div className="space-y-6">
      <Flash message={typeof notice === 'string' ? (NOTICES[notice] ?? null) : null} />
      <PageHeader
        title="Services"
        description="Changing a price or duration doesn’t touch existing bookings: each keeps what the client booked. A service with bookings is archived, never deleted."
        actions={
          <Link href="/admin/services/new" className={button.primary}>
            <Icon name="plus" />
            Add a service
          </Link>
        }
      />
      {services.length === 0 ? (
        <EmptyState title="No services yet">
          <Link href="/admin/services/new">Add the first one</Link>.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {services.map((service) => {
            const archived = Boolean(service.archivedAt)
            return (
              <li key={service.id} className={cn('rounded-card border bg-raised p-4 shadow-card', archived ? 'border-dashed border-line-strong' : 'border-line')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{CATEGORY_LABELS[service.category]}</p>
                    <h2 className="font-sans text-lg font-semibold">
                      {service.name}
                      {archived ? <span className="ml-2 rounded-pill bg-sunken px-2 py-0.5 text-xs text-muted">Archived</span> : null}
                    </h2>
                  </div>
                  <p className="figures text-lg font-semibold">{formatNaira(service.priceKobo)}</p>
                </div>
                <p className="figures mt-1 text-sm text-muted">
                  {formatDuration(service.durationMinutes)} + {service.bufferMinutes} min clean-up · {service.stylistCount}{' '}
                  {service.stylistCount === 1 ? 'stylist' : 'stylists'} · {service.upcomingCount} upcoming, {service.bookingCount} in total
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/admin/services/${service.id}`} className={button.small}>
                    <Icon name="edit" className="size-4" />
                    Edit<span className="sr-only"> {service.name}</span>
                  </Link>
                  <ActionButton action={archiveServiceAction} fields={{ id: String(service.id), archived: archived ? 'false' : 'true' }} pendingLabel="Saving…">
                    <Icon name={archived ? 'restore' : 'archive'} className="size-4" />
                    {archived ? 'Restore' : 'Archive'}
                  </ActionButton>
                  {service.bookingCount === 0 ? (
                    <ConfirmAction
                      action={deleteServiceAction}
                      archiveAction={archiveServiceAction}
                      fields={{ id: String(service.id) }}
                      trigger="Delete"
                      icon="trash"
                      danger
                      title={`Delete ${service.name}?`}
                      body="It has never been booked, so it can be removed completely."
                      confirmLabel="Delete"
                      pendingLabel="Deleting…"
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
