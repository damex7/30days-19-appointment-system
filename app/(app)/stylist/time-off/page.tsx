// /stylist/time-off: the signed-in stylist's own time off (listTimeOff is
// filtered on the stylist id from the session).
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { deleteTimeOffAction } from '@/app/(app)/stylist/actions'
import { ConfirmAction } from '@/components/forms/confirm-action'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { TimeOffForm } from '@/components/stylist/time-off-form'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, Sheet } from '@/components/ui/page-header'
import { requireStylist } from '@/lib/booking/access'
import { getSettings } from '@/lib/settings'
import { listTimeOff } from '@/lib/studio/time-off'
import { formatDateTime, todayIn } from '@/lib/time'

export const metadata: Metadata = { title: 'Time off' }

export default function TimeOffPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TimeOff />
    </Suspense>
  )
}

async function TimeOff() {
  const { stylist } = await requireStylist()
  const [settings, entries] = await Promise.all([getSettings(), listTimeOff(stylist.id)])
  const tz = settings.timeZone

  return (
    <div className="space-y-6">
      <PageHeader title="Time off" description="Block out time you won’t be in. Clients can’t book you then; appointments already booked must be moved first." />
      <Sheet title="Add time off" id="add">
        <TimeOffForm today={todayIn(tz)} zoneLabel={settings.zoneLabel} />
      </Sheet>
      <section aria-labelledby="booked-title">
        <h2 id="booked-title" className="mb-3 text-2xl">
          Coming up
        </h2>
        {entries.length === 0 ? (
          <EmptyState title="No time off booked">Add some above when you need it.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="hatched flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-4">
                <div className="figures">
                  <p className="font-semibold">
                    {formatDateTime(entry.startsAt, tz)} → {formatDateTime(entry.endsAt, tz)}
                  </p>
                  {entry.reason ? <p className="text-sm text-muted">{entry.reason}</p> : null}
                </div>
                <ConfirmAction
                  action={deleteTimeOffAction}
                  fields={{ id: String(entry.id) }}
                  trigger="Remove"
                  icon="trash"
                  danger
                  title="Remove this time off?"
                  body="Those times will be open for clients to book again."
                  confirmLabel="Remove"
                  pendingLabel="Removing…"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
