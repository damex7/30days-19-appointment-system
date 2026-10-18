// TIME OFF: a stylist is away for a stretch of real time.
//
// OWNERSHIP: every function takes the stylist id as its FIRST argument and
// puts it in the WHERE clause. A stylist's pages pass their own id (from
// getStylistForUser, i.e. from the session), never one from the form, so
// a stylist can only see, add and remove their own time off.
import 'server-only'

import { z } from 'zod'
import { sql } from '@/lib/db'
import { isExclusionError } from '@/lib/db-errors'
import { parseRows } from '@/lib/rows'

const TimeOffSchema = z.object({
  id: z.number().int(),
  startsAt: z.date(),
  endsAt: z.date(),
  reason: z.string(),
})
export type TimeOff = z.infer<typeof TimeOffSchema>

/** A stylist's time off that hasn't finished yet, soonest first. */
export async function listTimeOff(stylistId: number): Promise<TimeOff[]> {
  const rows = await sql`
    SELECT id, lower(during) AS "startsAt", upper(during) AS "endsAt", reason
    FROM time_off
    WHERE stylist_id = ${stylistId} AND upper(during) > now()
    ORDER BY lower(during)`
  return parseRows(TimeOffSchema, rows, 'listTimeOff')
}

/** Time off overlapping a range (the week view and the admin day view draw it). */
export async function listTimeOffBetween(start: Date, end: Date, stylistId?: number): Promise<(TimeOff & { stylistId: number })[]> {
  const only = stylistId === undefined ? sql`` : sql`AND stylist_id = ${stylistId}`
  const rows = await sql`
    SELECT id, stylist_id AS "stylistId", lower(during) AS "startsAt", upper(during) AS "endsAt", reason
    FROM time_off
    WHERE during && tstzrange(${start}, ${end}) ${only}
    ORDER BY lower(during)`
  return parseRows(TimeOffSchema.extend({ stylistId: z.number().int() }), rows, 'listTimeOffBetween')
}

export type AddTimeOffResult = { ok: true } | { ok: false; reason: 'overlaps_time_off' } | { ok: false; reason: 'has_bookings'; count: number }

/**
 * Adds time off, unless it would strand clients.
 *
 * - The INSERT only happens if NO confirmed booking overlaps the range
 *   (checked in the same statement). Booked clients must be moved or
 *   cancelled first; then the time off goes in.
 * - Overlapping the stylist's OTHER time off is refused by the exclusion
 *   constraint time_off_no_overlap (23P01).
 *
 * A known limit, written down rather than hidden: the "no bookings in this
 * range" check is not a constraint (PostgreSQL can't EXCLUDE across two
 * tables), so a booking inserted in the same instant as this time off
 * could still slip in. It would show up in the stylist's schedule as a
 * booking inside their time off, for the admin to sort out. The reverse
 * (booking into existing time off) is impossible: open_slots refuses it.
 */
export async function addTimeOff(stylistId: number, actorId: string, start: Date, end: Date, reason: string): Promise<AddTimeOffResult> {
  try {
    const rows = await sql`
      INSERT INTO time_off (stylist_id, during, reason, created_by)
      SELECT ${stylistId}, tstzrange(${start}, ${end}, '[)'), ${reason}, ${actorId}
      WHERE NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.stylist_id = ${stylistId} AND b.status = 'confirmed' AND b.during && tstzrange(${start}, ${end}, '[)'))
      RETURNING id`
    if (rows.length > 0) return { ok: true }
  } catch (error) {
    if (isExclusionError(error, 'time_off_no_overlap')) return { ok: false, reason: 'overlaps_time_off' }
    throw error
  }
  const clash = await sql`
    SELECT count(*)::int AS count FROM bookings
    WHERE stylist_id = ${stylistId} AND status = 'confirmed' AND during && tstzrange(${start}, ${end}, '[)')`
  return { ok: false, reason: 'has_bookings', count: Number(clash[0]?.count ?? 0) }
}

/** Removes one of THIS stylist's entries; someone else's id simply matches nothing. */
export async function deleteTimeOff(stylistId: number, id: number): Promise<boolean> {
  const rows = await sql`DELETE FROM time_off WHERE id = ${id} AND stylist_id = ${stylistId} RETURNING id`
  return rows.length > 0
}
