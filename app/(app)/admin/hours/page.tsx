// /admin/hours?stylist=3: one stylist's weekly hours, day by day.
// The stylist chosen is in the URL, so switching stylists is a link.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { DayHoursForm } from '@/components/admin/day-hours-form'
import { PageSkeleton } from '@/components/site/page-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth/dal'
import { cn } from '@/lib/cn'
import { getSettings } from '@/lib/settings'
import { listHours } from '@/lib/studio/hours'
import { listStylistOptions } from '@/lib/studio/stylists'
import { WEEKDAYS } from '@/lib/time'

export const metadata: Metadata = { title: 'Working hours' }

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function HoursPage({ searchParams }: PageProps<'/admin/hours'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Hours searchParams={searchParams} />
    </Suspense>
  )
}

async function Hours({ searchParams }: Pick<PageProps<'/admin/hours'>, 'searchParams'>) {
  await requireRole('admin')
  const [stylists, settings, params] = await Promise.all([listStylistOptions(), getSettings(), searchParams])
  const chosen = stylists.find((s) => String(s.id) === params.stylist) ?? stylists[0]
  if (!chosen) {
    return (
      <EmptyState title="No stylists yet">
        <Link href="/admin/stylists">Add a stylist</Link> first.
      </EmptyState>
    )
  }
  const hours = await listHours(chosen.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Working hours"
        description={`Wall-clock times in the studio’s zone (${settings.timeZone}, ${settings.zoneLabel}). “10:00 every Tuesday” is a rule, not a moment: it’s turned into real times only when open slots are worked out. Changes don’t move existing bookings.`}
      />
      <nav aria-label="Stylists" className="flex flex-wrap gap-2">
        {stylists.map((s) => (
          <Link
            key={s.id}
            href={`/admin/hours?stylist=${s.id}`}
            aria-current={s.id === chosen.id ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-pill border px-4 font-semibold no-underline',
              s.id === chosen.id ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-raised text-ink hover:bg-tint',
            )}
          >
            {s.displayName}
            {s.active ? '' : ' (not booking)'}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {WEEK_ORDER.map((day) => (
          <DayHoursForm
            // A new key when the stylist changes resets the inputs.
            key={`${chosen.id}-${day}`}
            stylistId={chosen.id}
            dayOfWeek={day}
            dayName={WEEKDAYS[day] ?? ''}
            blocks={hours.filter((h) => h.dayOfWeek === day).map((h) => ({ start: h.startTime, end: h.endTime }))}
          />
        ))}
      </div>
    </div>
  )
}
