// THE STUDIO'S SETTINGS: the single row in `settings` (db/migrations/007).
//
// Every time shown on any page is formatted in settings.timeZone, so
// nearly every page needs this. It's CACHED ('use cache') and tagged
// 'settings': read once, then served from the cache until an admin saves
// /admin/settings, whose action calls updateTag('settings') so the very
// next page shows the change.
//
// Availability never relies on this cache: open_slots() reads the settings
// row itself, inside the same SQL query, so a slot is always judged by the
// current rules.
import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { parseRows } from '@/lib/rows'
import { zoneLabel } from '@/lib/time'

export const SETTINGS_TAG = 'settings'

const SettingsSchema = z.object({
  studioName: z.string(),
  timeZone: z.string(),
  slotStepMinutes: z.number().int(),
  minNoticeHours: z.number().int(),
  bookingWindowDays: z.number().int(),
  cancellationCutoffHours: z.number().int(),
  whatsappNumber: z.string(),
  address: z.string(),
})
export type StudioSettings = z.infer<typeof SettingsSchema> & {
  /** "WAT (UTC+1)": the zone's name and current offset, shown next to times. */
  zoneLabel: string
}

export async function getSettings(): Promise<StudioSettings> {
  'use cache'
  cacheTag(SETTINGS_TAG)
  cacheLife('hours')
  const rows = await sql`
    SELECT studio_name AS "studioName", time_zone AS "timeZone",
           slot_step_minutes AS "slotStepMinutes", min_notice_hours AS "minNoticeHours",
           booking_window_days AS "bookingWindowDays", cancellation_cutoff_hours AS "cancellationCutoffHours",
           whatsapp_number AS "whatsappNumber", address
    FROM settings`
  const settings = parseRows(SettingsSchema, rows, 'getSettings')[0]
  // Migration 007 inserts the row, so this only happens on a database that
  // hasn't been migrated.
  if (!settings) throw new Error('The settings row is missing. Run `npm run db:migrate`.')
  // Worked out here, inside the cache, because it depends on the current
  // date (an offset belongs to a moment, not to a zone): the cached value
  // is refreshed at least hourly, so a daylight-saving change elsewhere
  // would show within the hour.
  return { ...settings, zoneLabel: zoneLabel(settings.timeZone) }
}

/** Saves the settings (admin only: the action checks). The trigger in 007 refuses an unknown time zone. */
export async function updateSettings(input: Omit<StudioSettings, 'zoneLabel'>): Promise<void> {
  await sql`
    UPDATE settings SET
      studio_name = ${input.studioName}, time_zone = ${input.timeZone},
      slot_step_minutes = ${input.slotStepMinutes}, min_notice_hours = ${input.minNoticeHours},
      booking_window_days = ${input.bookingWindowDays}, cancellation_cutoff_hours = ${input.cancellationCutoffHours},
      whatsapp_number = ${input.whatsappNumber}, address = ${input.address}`
}
