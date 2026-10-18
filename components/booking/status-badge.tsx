// A booking's status as a badge: its own colour, its own icon SHAPE and a
// word, so it reads in greyscale, to colour-blind people and to screen
// readers alike (the word is real text, not a tooltip).
import { Icon, type IconName } from '@/components/ui/icon'
import type { BookingStatus } from '@/lib/booking/bookings'
import { cn } from '@/lib/cn'

const STYLES: Record<BookingStatus, { label: string; icon: IconName; className: string }> = {
  confirmed: { label: 'Booked', icon: 'slotBooked', className: 'bg-booked-soft text-booked' },
  completed: { label: 'Completed', icon: 'checkCircle', className: 'bg-success-soft text-success' },
  cancelled: { label: 'Cancelled', icon: 'slotCancelled', className: 'bg-danger-soft text-danger' },
  no_show: { label: 'No-show', icon: 'slotNoShow', className: 'border border-dashed border-ink bg-raised text-ink' },
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: STYLES.confirmed.label,
  completed: STYLES.completed.label,
  cancelled: STYLES.cancelled.label,
  no_show: STYLES.no_show.label,
}

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const style = STYLES[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold', style.className, className)}>
      <Icon name={style.icon} className="size-3.5" />
      {style.label}
    </span>
  )
}
