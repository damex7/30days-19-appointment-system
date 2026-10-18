// A stylist's own time off. The stylist id ALWAYS comes from the session
// (requireStylist), never from the form, so a stylist can only add to or
// remove from their own schedule. A hand-made request with another
// stylist's time-off id matches nothing (WHERE stylist_id = mine).
'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { formValues, readId, succeeded } from '@/lib/action-helpers'
import { requireStylist } from '@/lib/booking/access'
import { getSettings } from '@/lib/settings'
import { addTimeOff, deleteTimeOff } from '@/lib/studio/time-off'
import { isLocalDate, isLocalTime, zonedToInstant } from '@/lib/time'
import { failed, invalid, type FormState } from '@/lib/validation'

const FIELDS = ['fromDate', 'fromTime', 'toDate', 'toTime', 'reason'] as const
type Field = (typeof FIELDS)[number]

const timeOffSchema = z.object({
  fromDate: z.string().refine(isLocalDate, 'Choose the first day'),
  fromTime: z.string().refine(isLocalTime, 'Choose a start time'),
  toDate: z.string().refine(isLocalDate, 'Choose the last day'),
  toTime: z.string().refine(isLocalTime, 'Choose an end time'),
  reason: z.string().trim().max(200, 'Keep the reason to 200 characters or fewer'),
})

export async function addTimeOffAction(_previous: FormState<Field>, formData: FormData): Promise<FormState<Field>> {
  const { current, stylist } = await requireStylist()
  const values = formValues(formData, FIELDS)
  const parsed = timeOffSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  // The dates and times were typed in STUDIO time: turn them into instants.
  const { timeZone } = await getSettings()
  const start = zonedToInstant(parsed.data.fromDate, parsed.data.fromTime, timeZone)
  const end = zonedToInstant(parsed.data.toDate, parsed.data.toTime, timeZone)
  if (end <= start) {
    return { status: 'error', message: 'Please fix the problem below.', fieldErrors: { toTime: ['The end must be after the start'] }, values, submissionId: Date.now() }
  }
  if (end.getTime() < Date.now()) return failed('That time has already passed.', values)

  const result = await addTimeOff(stylist.id, current.user.id, start, end, parsed.data.reason)
  if (!result.ok) {
    return failed(
      result.reason === 'overlaps_time_off'
        ? 'That overlaps time off you’ve already booked. Change or remove the other entry first.'
        : `You have ${result.count} ${result.count === 1 ? 'appointment' : 'appointments'} in that time. Ask the admin to move ${result.count === 1 ? 'it' : 'them'} first, so no client is left without a stylist.`,
      values,
    )
  }
  refresh()
  return succeeded('Time off added. Clients can no longer book you then.')
}

export async function deleteTimeOffAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { stylist } = await requireStylist()
  const id = readId(formData)
  if (id === null) return failed('That request wasn’t valid.')
  const removed = await deleteTimeOff(stylist.id, id)
  if (!removed) return failed('That entry wasn’t found.')
  refresh()
  return succeeded('Removed. Those times are open for booking again.')
}
