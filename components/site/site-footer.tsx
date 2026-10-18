import { Mark } from '@/components/brand/mark'
import { site } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-3 gap-y-1 px-4 py-6 text-sm text-muted sm:px-6">
        <Mark className="size-5" />
        <p>
          {site.name} · Day 19 of a 30-day build challenge: auth and scheduling, with bookings the database itself keeps from overlapping.
        </p>
      </div>
    </footer>
  )
}
