// THE BOOKING ACTION: the moment a choice becomes an appointment.
//
// The order of checks is the lesson:
//   1. WHO: requireRole('client') reads the session from the database.
//      Signed out → /login?next=<this very step>. A stylist or admin is sent
//      to their own page (admins book for clients at /admin/bookings/new).
//   2. VERIFIED EMAIL: a first booking needs a confirmed address, so the
//      studio can reach the person and nobody books in someone else's name.
//   3. WHAT: Zod checks the shape of every field. The hidden fields came
//      from the page, but anyone can send this POST with any values.
//   4. WHEN: the local date + time become a real instant in the STUDIO's
//      zone (lib/time.ts), whatever the visitor's device says.
//   5. IS IT STILL FREE: createBooking re-runs open_slots() inside the
//      INSERT, and the exclusion constraint settles a race. If it's gone,
//      the client is offered the next three open times instead.
'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth/dal'
import { viewerFrom } from '@/lib/booking/access'
import { nextOpenTimes } from '@/lib/booking/availability'
import { createBooking, getBooking } from '@/lib/booking/bookings'
import { sendBookingEmail } from '@/lib/booking/emails'
import { bookHref, NOTE_MAX } from '@/lib/booking/flow'
import { getSettings } from '@/lib/settings'
import { listMenu } from '@/lib/studio/services'
import { addDays, formatDateTime, isLocalDate, isLocalTime, localDateOf, localTimeOf, todayIn, zonedToInstant } from '@/lib/time'
import { failed, field, invalid, type FormState } from '@/lib/validation'


const bookSchema = z.object({
  service: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  stylist: z.union([z.literal('any'), z.coerce.number().int().positive()]),
  date: z.string().refine(isLocalDate),
  time: z.string().refine(isLocalTime),
  note: z.string().trim().max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters or fewer`),
})

export type BookState = FormState<'note'> & {
  /** After "that time was just taken": the next open times, as links back into the flow. */
  alternatives?: { label: string; href: string }[]
}

export async function bookAppointment(_previous: BookState, formData: FormData): Promise<BookState> {
  const current = await requireRole('client')
  const values = { note: field(formData, 'note') }

  if (!current.user.emailVerifiedAt) {
    return failed('Please confirm your email address first. We’ve sent you a link; once it’s confirmed, press Confirm booking again.', values)
  }

  const parsed = bookSchema.safeParse({
    service: field(formData, 'service'),
    stylist: field(formData, 'stylist'),
    date: field(formData, 'date'),
    time: field(formData, 'time'),
    note: values.note,
  })
  if (!parsed.success) {
    // Only the note is a field the person typed; anything else means the
    // hidden fields were tampered with or the page is out of date.
    const noteError = parsed.error.issues.some((issue) => issue.path[0] === 'note')
    return noteError ? invalid(parsed.error, values) : failed('Something about this booking wasn’t valid. Please choose the time again.', values)
  }
  const { service: slug, stylist, date, time, note } = parsed.data

  const [settings, menu] = await Promise.all([getSettings(), listMenu()])
  const service = menu.find((s) => s.slug === slug)
  if (!service) return failed('That service isn’t on the menu any more. Please choose another.', values)

  const startsAt = zonedToInstant(date, time, settings.timeZone)
  const stylistId = stylist === 'any' ? null : stylist
  const result = await createBooking({
    serviceId: service.id,
    stylistId,
    date,
    startsAt,
    note,
    client: { kind: 'account', userId: current.user.id },
    bookedBy: current.user.id,
    staff: false,
  })

  if (!result.ok) {
    const tz = settings.timeZone
    const today = todayIn(tz)
    const from = date > today ? date : today
    const options = await nextOpenTimes(service.id, stylistId, startsAt, from, addDays(today, settings.bookingWindowDays))
    return {
      status: 'error',
      message: 'Sorry, that time was just taken.',
      values,
      submissionId: Date.now(),
      alternatives: options.map((instant) => ({
        label: formatDateTime(instant, tz),
        href: bookHref({ service: slug, stylist, date: localDateOf(instant, tz), time: localTimeOf(instant, tz) }),
      })),
    }
  }

  // The confirmation email (with the .ics attached) goes after the
  // response, so the client sees the confirmation page straight away.
  after(async () => {
    const booking = await getBooking(await viewerFrom(current), result.id)
    if (booking) await sendBookingEmail('confirmed', booking, settings)
  })

  redirect(`/appointments/${result.id}?notice=booked`)
}
