// /admin/closures: studio-wide closed days (public holidays and the like).
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { deleteClosureAction } from '@/app/(app)/admin/closures/actions'
import { ClosureForm } from '@/components/admin/closure-form'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { getSettings } from '@/lib/settings'
import { listClosures } from '@/lib/studio/closures'
import { formatDayWithYear, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'Closures' }

export default function ClosuresPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Closures />
    </Suspense>
  )
}

async function Closures() {
  await requireRole('admin')
  const settings = await getSettings()
  const today = todayIn(settings.timeZone)
  const closures = await listClosures(today)

  return (
    <div className="space-y-6">
      <PageHeader title="Closures" description="Days the whole studio is shut. Nobody can book them. Bookings already made for that day are not cancelled for you: the list shows how many need moving." />
      <Sheet title="Close the studio for a day" id="add">
        <ClosureForm today={today} />
      </Sheet>
      <section aria-labelledby="upcoming-title">
        <h2 id="upcoming-title" className="mb-3 text-2xl">
          Coming up
        </h2>
        {closures.length === 0 ? (
          <EmptyState title="No closures planned" />
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-raised shadow-card">
            {closures.map((closure) => (
              <li key={closure.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="figures font-semibold">{formatDayWithYear(closure.closedOn)}</p>
                  <p className="text-sm text-muted">{closure.name}</p>
                  {closure.bookingCount > 0 ? (
                    <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-danger">
                      <Icon name="alert" className="size-4" />
                      <Link href={`/admin?date=${closure.closedOn}`}>
                        {closure.bookingCount} {closure.bookingCount === 1 ? 'booking needs' : 'bookings need'} moving
                      </Link>
                    </p>
                  ) : null}
                </div>
                <ConfirmAction
                  action={deleteClosureAction}
                  fields={{ id: String(closure.id) }}
                  trigger="Remove"
                  icon="trash"
                  danger
                  title={`Open on ${formatDayWithYear(closure.closedOn)} after all?`}
                  body="Clients will be able to book that day again."
                  confirmLabel="Remove closure"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
