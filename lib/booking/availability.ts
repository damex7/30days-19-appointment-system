// OPEN TIMES, as clients see them. Every function here is a thin wrapper
// around the SQL function open_slots() (db/migrations/011), so the times on
// screen come from exactly the same rules the booking INSERT re-checks.
//
// Never cached: availability changes every time anyone books.
import 'server-only'

import { z } from 'zod'
import { sql } from '@/lib/db'
import { parseRows } from '@/lib/rows'
import type { LocalDate } from '@/lib/time'

export type OpenTime = {
  startsAt: Date
  /** Who is free then. With "any stylist", the booking picks one of these. */
  stylistIds: number[]
}

/**
 * Open start times on one local date, for one stylist or (stylistId null)
 * for anyone who offers the service. "Any available stylist" is the UNION:
 * a time is open if at least one stylist is free, so rows are grouped by
 * start time.
 */
export async function openTimes(serviceId: number, stylistId: number | null, date: LocalDate, options: { staff?: boolean; ignoreBookingId?: number } = {}): Promise<OpenTime[]> {
  const rows = await sql`
    SELECT o.starts_at AS "startsAt", array_agg(o.stylist_id ORDER BY o.stylist_id) AS "stylistIds"
    FROM open_slots(${serviceId}::int, ${stylistId}::int, ${date}::date, ${options.ignoreBookingId ?? null}::int, ${options.staff ?? false}::boolean) o
    GROUP BY o.starts_at
    ORDER BY o.starts_at`
  return parseRows(z.object({ startsAt: z.date(), stylistIds: z.array(z.number().int()) }), rows, 'openTimes')
}

/**
 * How many open start times each day in [from, to] has: the date strip
 * shows days with none as "unavailable". One query: generate_series makes
 * a row per day, and CROSS JOIN LATERAL runs open_slots for each one.
 * Days with no open time don't come back at all, so the caller fills in 0.
 */
export async function openDays(serviceId: number, stylistId: number | null, from: LocalDate, to: LocalDate, options: { ignoreBookingId?: number } = {}): Promise<Map<LocalDate, number>> {
  const rows = await sql`
    SELECT to_char(d, 'YYYY-MM-DD') AS day, count(DISTINCT o.starts_at)::int AS count
    FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    CROSS JOIN LATERAL open_slots(${serviceId}::int, ${stylistId}::int, d::date, ${options.ignoreBookingId ?? null}::int, false) AS o
    GROUP BY d
    ORDER BY d`
  const parsed = parseRows(z.object({ day: z.string(), count: z.number().int() }), rows, 'openDays')
  return new Map(parsed.map((row) => [row.day, row.count]))
}

/**
 * The next few open times after a moment, across the days from `from` to
 * `to`: what "Sorry, that time was just taken" offers instead.
 */
export async function nextOpenTimes(serviceId: number, stylistId: number | null, after: Date, from: LocalDate, to: LocalDate, limit = 3): Promise<Date[]> {
  const rows = await sql`
    SELECT DISTINCT o.starts_at AS "startsAt"
    FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    CROSS JOIN LATERAL open_slots(${serviceId}::int, ${stylistId}::int, d::date, NULL, false) AS o
    WHERE o.starts_at > ${after}
    ORDER BY o.starts_at
    LIMIT ${limit}`
  return parseRows(z.object({ startsAt: z.date() }), rows, 'nextOpenTimes').map((row) => row.startsAt)
}
