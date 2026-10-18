// THE "WHEN?" PICKERS, shared by /book and the reschedule page: the
// date strip's items, the time grid grouped into morning / afternoon /
// evening, and the empty state for a day with nothing open.
// Server Component pieces; the interactive part is SlotPicker.
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { addDays, dayChipParts, dayOfWeek, daysBetween, formatDayLong, localTimeOf, WEEKDAYS, type LocalDate } from '@/lib/time'
import { SlotPicker, type PickerItem } from './slot-picker'

/** One button per day in the booking window, with its state. */
export function dayItems(today: LocalDate, lastDay: LocalDate, days: Map<string, number>, closed: Map<string, string>, selectedDate: LocalDate | null, hrefFor: (date: LocalDate) => string): PickerItem[] {
  const items: PickerItem[] = []
  for (let date = today; date <= lastDay; date = addDays(date, 1)) {
    const count = days.get(date) ?? 0
    const closure = closed.get(date)
    const parts = dayChipParts(date)
    const selected = date === selectedDate
    const long = formatDayLong(date)
    items.push({
      key: date,
      href: hrefFor(date),
      label: selected
        ? `${long}, selected, ${count} open ${count === 1 ? 'time' : 'times'}`
        : count > 0
          ? `${long}, ${count} open ${count === 1 ? 'time' : 'times'}`
          : closure
            ? `${long}, unavailable: studio closed for ${closure}`
            : `${long}, unavailable`,
      lines: [date === today ? 'Today' : parts.weekday, parts.day, parts.month],
      note: count > 0 ? `${count} open` : closure ? 'Closed' : 'None',
      state: selected ? 'selected' : count > 0 ? 'open' : 'unavailable',
    })
  }
  return items
}

/** Morning / afternoon / evening, so a long list of times is easy to scan. */
export function groupTimes(instants: Date[], tz: string): { name: string; instants: Date[] }[] {
  const groups = [
    { name: 'Morning', instants: [] as Date[] },
    { name: 'Afternoon', instants: [] as Date[] },
    { name: 'Evening', instants: [] as Date[] },
  ]
  for (const instant of instants) {
    const hour = Number(localTimeOf(instant, tz).slice(0, 2))
    groups[hour < 12 ? 0 : hour < 17 ? 1 : 2]?.instants.push(instant)
  }
  return groups.filter((g) => g.instants.length > 0)
}

export function TimeGroups({ groups, makeItem }: { groups: { name: string; instants: Date[] }[]; makeItem: (instant: Date) => PickerItem }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.name}>
          <h4 className="mb-1.5 text-sm font-semibold text-muted">{group.name}</h4>
          <SlotPicker layout="grid" label={`${group.name} times`} items={group.instants.map(makeItem)} />
        </div>
      ))}
    </div>
  )
}

/** "No open times on this day. Try Thursday." with a link to the next open day. */
export function EmptyDay({ date, days, closed, href }: { date: string; days: Map<string, number>; closed?: string; href: (date: string) => string }) {
  const nextOpen = [...days.entries()].filter(([day, count]) => day > date && count > 0).map(([day]) => day)[0]
  return (
    <div className="hatched rounded-card border border-line p-6 text-center">
      <Icon name="slotUnavailable" className="mx-auto size-8 text-unavailable" />
      <p className="mt-2 font-semibold">{closed ? `The studio is closed for ${closed}.` : 'No open times on this day.'}</p>
      {nextOpen ? (
        <p className="mt-1">
          Try{' '}
          <Link href={href(nextOpen)} scroll={false} className="font-semibold text-brand">
            {daysBetween(date, nextOpen) < 7 ? WEEKDAYS[dayOfWeek(nextOpen)] : formatDayLong(nextOpen)}
          </Link>
          .
        </p>
      ) : (
        <p className="mt-1">There are no open times in the next few weeks. Try another stylist.</p>
      )}
    </div>
  )
}
