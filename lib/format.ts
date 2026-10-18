// Dates are shown in Lagos time (WAT) on the server and in the browser
// alike, so the server's HTML and the browser's render agree.

const TIME_ZONE = 'Africa/Lagos'

const long = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' })
const day = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' })
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "16 Oct 2026, 14:05" */
export function longDate(date: Date): string {
  return long.format(date)
}

/** "16 Oct 2026" */
export function shortDate(date: Date): string {
  return day.format(date)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 minutes ago", "in 29 days", "just now". */
export function fromNow(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
