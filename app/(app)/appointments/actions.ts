// SERVER ACTIONS that change one booking: cancel, reschedule, and mark
// completed / no-show. Clients, stylists and admins all use these.
//
// Every one of them:
//   1. reads the session (verifySession) and builds the VIEWER from it:
//      user id, role, and for a stylist their stylist id. Never from the form;
//   2. parses the form with Zod (the booking id and version are hidden
//      fields anyone could edit);
//   3. calls lib/booking/bookings.ts, whose SQL only touches the booking if
//      it is inside the viewer's scope. Another person's booking id comes
//      back "not_found", exactly like an id that doesn't exist;
//   4. sends the client an email (after the response) and refreshes.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { verifySession, type SessionWithUser } from '@/lib/auth/dal'
import { viewerFrom, type Viewer } from '@/lib/booking/access'
import { cancelBooking, getBooking, markBooking, rescheduleBooking, type ChangeFailure } from '@/lib/booking/bookings'
import { sendBookingEmail } from '@/lib/booking/emails'
import { getSettings, type StudioSettings } from '@/lib/settings'
import { isLocalDate, isLocalTime, zonedToInstant } from '@/lib/time'
import { failed, field, type FormState } from '@/lib/validation'

const idVersion = {
  id: z.coerce.number().int().positive().max(2_147_483_647),
  version: z.coerce.number().int().positive().max(2_147_483_647),
}

function failureMessage(reason: ChangeFailure, settings: StudioSettings): string {
  switch (reason) {
    case 'not_found':
      return 'That booking wasn’t found.'
    case 'stale':
      return 'This booking was changed a moment ago (perhaps in another tab). Reload the page to see the latest.'
    case 'not_confirmed':
      return 'This booking is no longer active, so it can’t be changed.'
    case 'too_late':
      return `It’s less than ${settings.cancellationCutoffHours} hours to the appointment, so it can’t be changed online. Please message the studio on WhatsApp.`
    case 'taken':
      return 'Sorry, that time was just taken. Please choose another.'
    case 'not_started':
      return 'You can mark it once the appointment has started.'
  }
}

/** After a change: email the client the new state of the booking (with the updated .ics). */
function emailAfter(kind: 'rescheduled' | 'cancelled', current: SessionWithUser, id: number, settings: StudioSettings) {
  after(async () => {
    // Read back with the same viewer (the same scope) that just changed it.
    const viewer: Viewer = await viewerFrom(current)
    const booking = await getBooking(viewer, id)
    if (booking) await sendBookingEmail(kind, booking, settings)
  })
}

// ---------------------------------------------------------------------------

const cancelSchema = z.object({ ...idVersion, reason: z.string().trim().max(300) })

export async function cancelBookingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const current = await verifySession()
  const parsed = cancelSchema.safeParse({ id: field(formData, 'id'), version: field(formData, 'version'), reason: field(formData, 'reason') })
  if (!parsed.success) return failed('That request wasn’t valid. Reload the page and try again.')

  const [viewer, settings] = await Promise.all([viewerFrom(current), getSettings()])
  const result = await cancelBooking(viewer, parsed.data)
  if (!result.ok) return failed(failureMessage(result.reason, settings))

  emailAfter('cancelled', current, parsed.data.id, settings)
  // Back to the same page, with the notice in the URL: the dialog that
  // sent this disappears with the buttons, so a message inside it would too.
  redirect(`/appointments/${parsed.data.id}?notice=cancelled`)
}

// ---------------------------------------------------------------------------

const rescheduleSchema = z.object({ ...idVersion, date: z.string().refine(isLocalDate), time: z.string().refine(isLocalTime) })

export async function rescheduleBookingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const current = await verifySession()
  const parsed = rescheduleSchema.safeParse({
    id: field(formData, 'id'),
    version: field(formData, 'version'),
    date: field(formData, 'date'),
    time: field(formData, 'time'),
  })
  if (!parsed.success) return failed('That request wasn’t valid. Please choose the time again.')

  const [viewer, settings] = await Promise.all([viewerFrom(current), getSettings()])
  // Stylists don't move bookings (the client or the studio does).
  if (viewer.role === 'stylist') return failed(failureMessage('not_found', settings))

  const { id, version, date, time } = parsed.data
  const result = await rescheduleBooking(viewer, { id, version, date, startsAt: zonedToInstant(date, time, settings.timeZone) })
  if (!result.ok) return failed(failureMessage(result.reason, settings))

  emailAfter('rescheduled', current, id, settings)
  redirect(`/appointments/${id}?notice=rescheduled`)
}

// ---------------------------------------------------------------------------

const markSchema = z.object({ ...idVersion, outcome: z.enum(['completed', 'no_show']) })

export async function markBookingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const current = await verifySession()
  const parsed = markSchema.safeParse({ id: field(formData, 'id'), version: field(formData, 'version'), outcome: field(formData, 'outcome') })
  if (!parsed.success) return failed('That request wasn’t valid.')

  const [viewer, settings] = await Promise.all([viewerFrom(current), getSettings()])
  const result = await markBooking(viewer, parsed.data)
  if (!result.ok) return failed(failureMessage(result.reason, settings))

  refresh()
  return { status: 'success', message: parsed.data.outcome === 'completed' ? 'Marked as completed.' : 'Marked as a no-show.', submissionId: Date.now() }
}
