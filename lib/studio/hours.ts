// WORKING HOURS: each stylist's weekly pattern, as WALL-CLOCK times
// ("09:00-13:00 on Tuesdays"), never as instants. See lib/time.ts and
// db/migrations/009 for why. They only become real moments inside
// open_slots(), for one specific date at a time.
import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'
import { sql, sqlTransaction } from '@/lib/db'
import { isExclusionError } from '@/lib/db-errors'
import { parseRows } from '@/lib/rows'
import type { LocalTime } from '@/lib/time'
import { MENU_TAG } from './services'

const BlockSchema = z.object({
  id: z.number().int(),
  stylistId: z.number().int(),
  dayOfWeek: z.number().int().min(0).max(6),
  // to_char gives "09:00" (PostgreSQL's time type would print "09:00:00").
  startTime: z.string(),
  endTime: z.string(),
})
export type HoursBlock = z.infer<typeof BlockSchema>

const blockColumns = () => sql`
  wh.id, wh.stylist_id AS "stylistId", wh.day_of_week AS "dayOfWeek",
  to_char(wh.start_time, 'HH24:MI') AS "startTime", to_char(wh.end_time, 'HH24:MI') AS "endTime"`

/** Every block for one stylist (their own schedule page) or for all (the admin editor). */
export async function listHours(stylistId?: number): Promise<HoursBlock[]> {
  const where = stylistId === undefined ? sql`` : sql`WHERE wh.stylist_id = ${stylistId}`
  const rows = await sql`
    SELECT ${blockColumns()} FROM working_hours wh ${where}
    ORDER BY wh.stylist_id, wh.day_of_week, wh.start_time`
  return parseRows(BlockSchema, rows, 'listHours')
}

const StudioDaySchema = z.object({ dayOfWeek: z.number().int(), opens: z.string(), closes: z.string() })
export type StudioDay = z.infer<typeof StudioDaySchema>

/**
 * The studio's opening hours for the home page: on each weekday, from the
 * earliest start to the latest finish among active stylists. A day with no
 * rows is closed. Cached with the menu.
 */
export async function listStudioHours(): Promise<StudioDay[]> {
  'use cache'
  cacheTag(MENU_TAG)
  cacheLife('hours')
  const rows = await sql`
    SELECT wh.day_of_week AS "dayOfWeek",
           to_char(min(wh.start_time), 'HH24:MI') AS opens,
           to_char(max(wh.end_time), 'HH24:MI') AS closes
    FROM working_hours wh JOIN stylists st ON st.id = wh.stylist_id AND st.active
    GROUP BY wh.day_of_week
    ORDER BY wh.day_of_week`
  return parseRows(StudioDaySchema, rows, 'listStudioHours')
}

/**
 * REPLACES one stylist's blocks on one weekday, in ONE transaction:
 * delete the old blocks, insert the new ones. If two of the new blocks
 * overlap, working_hours_no_overlap (an exclusion constraint) refuses the
 * insert with 23P01, the transaction rolls back, and the old hours are
 * untouched.
 *
 * Existing bookings are NOT changed by new hours: they stay booked even if
 * they now fall outside the hours. New hours only affect what can be
 * booked from now on.
 */
export async function replaceDayHours(
  stylistId: number,
  dayOfWeek: number,
  blocks: { start: LocalTime; end: LocalTime }[],
): Promise<'saved' | 'overlap'> {
  try {
    await sqlTransaction((tx) => [
      tx`DELETE FROM working_hours WHERE stylist_id = ${stylistId} AND day_of_week = ${dayOfWeek}`,
      tx`INSERT INTO working_hours (stylist_id, day_of_week, start_time, end_time)
         SELECT ${stylistId}, ${dayOfWeek}, b.start_time, b.end_time
         FROM unnest(${blocks.map((b) => b.start)}::time[], ${blocks.map((b) => b.end)}::time[]) AS b(start_time, end_time)`,
    ])
    return 'saved'
  } catch (error) {
    if (isExclusionError(error, 'working_hours_no_overlap')) return 'overlap'
    throw error
  }
}
