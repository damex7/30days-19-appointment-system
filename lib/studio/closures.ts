// CLOSURES: whole days the studio is shut (public holidays, a refit).
// Stored as LOCAL dates; open_slots() returns nothing for them.
import 'server-only'

import { z } from 'zod'
import { sql } from '@/lib/db'
import { isUniqueError } from '@/lib/db-errors'
import { parseRows } from '@/lib/rows'
import type { LocalDate } from '@/lib/time'

const ClosureSchema = z.object({
  id: z.number().int(),
  // to_char keeps the date as plain text: a JavaScript Date would mean
  // "midnight UTC", which is not the same as "that day in Lagos".
  closedOn: z.string(),
  name: z.string(),
  bookingCount: z.number().int(),
})
export type Closure = z.infer<typeof ClosureSchema>

/**
 * Closures from a date on, each with how many CONFIRMED bookings fall on
 * that local day (so the admin sees "3 bookings need moving" after adding a
 * closure over existing appointments).
 */
export async function listClosures(from: LocalDate): Promise<Closure[]> {
  const rows = await sql`
    SELECT c.id, to_char(c.closed_on, 'YYYY-MM-DD') AS "closedOn", c.name,
           (SELECT count(*)::int FROM bookings b, settings s
            WHERE b.status = 'confirmed'
              AND b.during && tstzrange(c.closed_on::timestamp AT TIME ZONE s.time_zone,
                                        (c.closed_on + 1)::timestamp AT TIME ZONE s.time_zone)) AS "bookingCount"
    FROM closures c
    WHERE c.closed_on >= ${from}::date
    ORDER BY c.closed_on`
  return parseRows(ClosureSchema, rows, 'listClosures')
}

/** Closed dates in a range, for greying out days on the date strip. */
export async function closedDatesBetween(from: LocalDate, to: LocalDate): Promise<Map<LocalDate, string>> {
  const rows = await sql`
    SELECT to_char(closed_on, 'YYYY-MM-DD') AS "closedOn", name FROM closures
    WHERE closed_on BETWEEN ${from}::date AND ${to}::date`
  const parsed = parseRows(z.object({ closedOn: z.string(), name: z.string() }), rows, 'closedDatesBetween')
  return new Map(parsed.map((row) => [row.closedOn, row.name]))
}

/** The UNIQUE on closed_on refuses a second closure for the same day. */
export async function addClosure(closedOn: LocalDate, name: string): Promise<'added' | 'duplicate'> {
  try {
    await sql`INSERT INTO closures (closed_on, name) VALUES (${closedOn}::date, ${name})`
    return 'added'
  } catch (error) {
    if (isUniqueError(error)) return 'duplicate'
    throw error
  }
}

export async function deleteClosure(id: number): Promise<boolean> {
  const rows = await sql`DELETE FROM closures WHERE id = ${id} RETURNING id`
  return rows.length > 0
}
