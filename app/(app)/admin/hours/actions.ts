// WORKING HOURS (admin only): replace one stylist's blocks on one weekday.
// The blocks are wall-clock times ("09:00"), saved as such; they only
// become real moments when slots are worked out (open_slots).
'use server'

import { refresh, updateTag } from 'next/cache'
import { succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { replaceDayHours } from '@/lib/studio/hours'
import { MENU_TAG } from '@/lib/studio/services'
import { dayHoursSchema } from '@/lib/studio/validation'
import { failed, field, type FormState } from '@/lib/validation'
import { WEEKDAYS } from '@/lib/time'

export async function saveDayHoursAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const starts = formData.getAll('start').map(String)
  const ends = formData.getAll('end').map(String)
  // A row left empty on both sides means "no block here".
  const blocks = starts.map((start, i) => ({ start, end: ends[i] ?? '' })).filter((b) => b.start !== '' || b.end !== '')
  // Sent back with an error, so the form shows what was typed (React
  // resets a form after its action runs, back to these values).
  const values = Object.fromEntries(starts.flatMap((start, i) => [[`s${i}`, start], [`e${i}`, ends[i] ?? '']]))
  const parsed = dayHoursSchema.safeParse({ stylistId: field(formData, 'stylistId'), dayOfWeek: field(formData, 'dayOfWeek'), blocks })
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? 'Please check the times.', values)

  const { stylistId, dayOfWeek } = parsed.data
  // The exclusion constraint on working_hours is the judge of overlaps.
  const result = await replaceDayHours(stylistId, dayOfWeek, parsed.data.blocks)
  if (result === 'overlap') return failed('Two of those blocks overlap. Leave a gap (or make them touch, like 13:00 and 13:00).', values)

  updateTag(MENU_TAG)
  refresh()
  const day = WEEKDAYS[dayOfWeek] ?? 'Day'
  return succeeded(parsed.data.blocks.length ? `${day} saved.` : `${day} saved as a day off.`)
}
