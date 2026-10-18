// ALL DATE AND TIME CONVERSION LIVES HERE. Every page, action, email and
// calendar file goes through these small functions, so there is one place
// to get time zones right.
//
// THREE KINDS OF "TIME" in this app, and they are not interchangeable:
//
//   1. An INSTANT: a real moment, the same everywhere on Earth. A JavaScript
//      Date, and timestamptz in PostgreSQL (stored as UTC). Bookings and
//      time off are instants.
//   2. A LOCAL DATE / WALL-CLOCK TIME in the studio's zone: "2026-10-21",
//      "10:30". What people read and type. Turning one into an instant
//      needs a time zone.
//   3. A WEEKLY RULE: "10:00 every Tuesday" (working hours). Not a moment
//      at all: it names a different instant every week.
//
// THE ZONE IS ALWAYS PASSED IN, read from the settings row
// (lib/settings.ts), never assumed. Not the server's zone (Vercel runs in
// UTC), and not the visitor's (a client abroad must still see Lagos
// times). Lagos has no daylight saving today, but the code still asks the
// tz database for the offset at each instant instead of hard-coding
// "+01:00": rules change, and the studio might not always be in Lagos.
//
// No date library: Intl.DateTimeFormat (built into Node and every browser)
// knows every zone's rules, and the rest is plain arithmetic on UTC
// milliseconds. Not server-only, so client components can format too.

/** "2026-10-21": a calendar date in the studio's zone. */
export type LocalDate = string
/** "10:30": a wall-clock time (24-hour) in the studio's zone. */
export type LocalTime = string

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** True for a real calendar date written YYYY-MM-DD (rejects "2026-02-30"). */
export function isLocalDate(value: string): value is LocalDate {
  const match = LOCAL_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** True for HH:MM in 24-hour time. */
export function isLocalTime(value: string): value is LocalTime {
  return LOCAL_TIME.test(value)
}

// ---------------------------------------------------------------------------
// Instant → local
// ---------------------------------------------------------------------------

// Creating an Intl.DateTimeFormat is slow-ish; formatting with one is fast.
// Keep one per zone.
const partsFormatters = new Map<string, Intl.DateTimeFormat>()

/** The wall-clock reading of an instant in a zone: year, month, day, hour, minute. */
function wallClock(instant: Date, timeZone: string) {
  let formatter = partsFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(timeZone, formatter)
  }
  const parts: Record<string, number> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  }
}

/**
 * The zone's offset from UTC AT THIS INSTANT, in minutes (Lagos: +60).
 * Worked out, not assumed: read the wall clock in the zone, treat that
 * reading as if it were UTC, and the difference is the offset.
 */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The local calendar date of an instant: a booking at 23:30 UTC is already "tomorrow" in Lagos. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const w = wallClock(instant, timeZone)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

/** The local wall-clock time of an instant, "HH:MM". */
export function localTimeOf(instant: Date, timeZone: string): LocalTime {
  const w = wallClock(instant, timeZone)
  return `${pad(w.hour)}:${pad(w.minute)}`
}

/** Today's date in the studio, which is not the server's "today" between 23:00 and 00:00 UTC. */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return localDateOf(now, timeZone)
}

// ---------------------------------------------------------------------------
// Local → instant
// ---------------------------------------------------------------------------

/**
 * "2026-10-21" + "10:30" in a zone → the real instant.
 *
 * The trick: first pretend the wall-clock time is UTC (a guess), find the
 * zone's offset at that guess, and subtract it. Then check the offset AT
 * THE RESULT: if a daylight-saving change happens between the two, the
 * second offset is the right one. In Lagos both passes agree; in London
 * this is what makes 01:30 on the last Sunday of March come out right.
 * (A wall time that doesn't exist, skipped by a spring-forward, lands just
 * after the gap; one that happens twice gets the earlier instant.)
 */
export function zonedToInstant(date: LocalDate, time: LocalTime, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [h, min] = time.split(':').map(Number) as [number, number]
  const guess = Date.UTC(y, m - 1, d, h, min)
  const first = offsetMinutes(new Date(guess), timeZone)
  let result = guess - first * MINUTE
  const second = offsetMinutes(new Date(result), timeZone)
  if (second !== first) result = guess - second * MINUTE
  return new Date(result)
}

/** Local midnight at the start of a date, as an instant (the start of "that day" in the studio). */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  return zonedToInstant(date, '00:00', timeZone)
}

// ---------------------------------------------------------------------------
// Calendar arithmetic on local dates (no zone needed: a date is a date)
// ---------------------------------------------------------------------------

/** Days as UTC-midnight milliseconds: pure calendar maths, immune to any zone. */
function dateToUtcMs(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

function utcMsToDate(ms: number): LocalDate {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** "2026-10-31" + 1 → "2026-11-01". Negative numbers go back. */
export function addDays(date: LocalDate, days: number): LocalDate {
  return utcMsToDate(dateToUtcMs(date) + days * DAY)
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((dateToUtcMs(b) - dateToUtcMs(a)) / DAY)
}

/** 0 = Sunday … 6 = Saturday: the numbering working_hours.day_of_week uses. */
export function dayOfWeek(date: LocalDate): number {
  return new Date(dateToUtcMs(date)).getUTCDay()
}

/** The Monday on or before a date: week views start on Monday. */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7))
}

/** "09:30" → 570 minutes after midnight, for laying out a day as rows. */
export function minutesOfDay(time: LocalTime): number {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/** 570 → "09:30". */
export function timeFromMinutes(minutes: number): LocalTime {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

// ---------------------------------------------------------------------------
// Formatting for people (always in the studio's zone)
// ---------------------------------------------------------------------------

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** A local date shown on its own: formatted as noon UTC with timeZone 'UTC', so no zone can shift the day. */
function formatLocalDate(date: LocalDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(dateToUtcMs(date) + DAY / 2))
}

/** "Tuesday 21 October" */
export function formatDayLong(date: LocalDate): string {
  return formatLocalDate(date, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "Tuesday 21 October 2026" */
export function formatDayWithYear(date: LocalDate): string {
  return formatLocalDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** "Tue 21 Oct" */
export function formatDayShort(date: LocalDate): string {
  return formatLocalDate(date, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** The pieces a date-strip button shows: "Tue", "21", "Oct". */
export function dayChipParts(date: LocalDate): { weekday: string; day: string; month: string } {
  return {
    weekday: formatLocalDate(date, { weekday: 'short' }),
    day: formatLocalDate(date, { day: 'numeric' }),
    month: formatLocalDate(date, { month: 'short' }),
  }
}

/** "10:30 AM" from a wall-clock time. */
export function formatClock(time: LocalTime): string {
  const [h, m] = time.split(':').map(Number) as [number, number]
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

/** "10:30 AM", an instant read on the studio's clock. */
export function formatTime(instant: Date, timeZone: string): string {
  return formatClock(localTimeOf(instant, timeZone))
}

/** "Tuesday 21 October, 10:30 AM", the full form used in labels and emails. */
export function formatDateTime(instant: Date, timeZone: string): string {
  return `${formatDayLong(localDateOf(instant, timeZone))}, ${formatTime(instant, timeZone)}`
}

/** "10:30 AM – 2:30 PM" */
export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  return `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`
}

/** "WAT (UTC+1)": shown next to times so a visitor abroad knows whose clock it is. */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  const name =
    new Intl.DateTimeFormat('en-NG', { timeZone, timeZoneName: 'short' }).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value ??
    timeZone
  const offset = offsetMinutes(at, timeZone)
  const sign = offset < 0 ? '−' : '+'
  const abs = Math.abs(offset)
  const utc = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${pad(abs % 60)}` : ''}`
  return name === utc || name.startsWith('GMT') ? utc : `${name} (${utc})`
}

/** "4 h", "45 min", "1 h 30 min" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} h ${m} min`
  return h ? `${h} h` : `${m} min`
}

/** Hours from now until an instant (negative once it has passed). */
export function hoursUntil(instant: Date, now: Date = new Date()): number {
  return (instant.getTime() - now.getTime()) / (60 * MINUTE)
}

/** "2026-10-21T10:30": the date + time pair the booking URL carries. */
export function slotKey(instant: Date, timeZone: string): string {
  return `${localDateOf(instant, timeZone)}T${localTimeOf(instant, timeZone)}`
}

/** "2026-10-21T10:30" → its parts, or null if it isn't one. */
export function parseSlotKey(value: string): { date: LocalDate; time: LocalTime } | null {
  const [date, time] = value.split('T')
  if (!date || !time || !isLocalDate(date) || !isLocalTime(time)) return null
  return { date, time }
}

/** "16 Oct 2026, 2:05 PM": a timestamp in lists (sessions, history). */
export function formatStamp(instant: Date, timeZone: string): string {
  return `${formatLocalDate(localDateOf(instant, timeZone), { day: 'numeric', month: 'short', year: 'numeric' })}, ${formatTime(instant, timeZone)}`
}

/** "16 Oct 2026" */
export function formatDateOnly(instant: Date, timeZone: string): string {
  return formatLocalDate(localDateOf(instant, timeZone), { day: 'numeric', month: 'short', year: 'numeric' })
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 minutes ago", "in 29 days", "just now". (No zone needed: it's a duration.) */
export function fromNow(instant: Date, now: Date = new Date()): string {
  const seconds = Math.round((instant.getTime() - now.getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
