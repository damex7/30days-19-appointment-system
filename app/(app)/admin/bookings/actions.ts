// BOOKING ON BEHALF OF SOMEONE (admin only): a client on the phone, or a
// walk-in at the desk.
//
// Differences from the client's own booking (app/(site)/book/actions.ts):
//   - staff mode: no minimum notice and no booking window (but never in
//     the past), passed down to open_slots();
//   - the client is either an existing CLIENT account (found by email; they
//     get the confirmation email), or a walk-in with just a name and an
//     optional phone (bookings.walk_in_name; no email is sent).
// The same re-check inside the INSERT and the same exclusion constraint
// apply, so the desk can't double-book either.
'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { fieldError } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { viewerFrom } from '@/lib/booking/access'
import { createBooking, getBooking } from '@/lib/booking/bookings'
import { sendBookingEmail } from '@/lib/booking/emails'
import { NOTE_MAX } from '@/lib/booking/flow'
import { getSettings } from '@/lib/settings'
import { getServiceById } from '@/lib/studio/services'
import { ID } from '@/lib/studio/validation'
import { isLocalDate, isLocalTime, zonedToInstant } from '@/lib/time'
import { findUserByEmail } from '@/lib/users'
import { emailSchema, failed, field, invalid, optionalPhone, type FormState } from '@/lib/validation'

export type AdminBookField = 'clientKind' | 'email' | 'walkInName' | 'walkInPhone' | 'note'

const baseSchema = z.object({
  service: ID,
  stylist: z.union([z.literal('any'), ID]),
  date: z.string().refine(isLocalDate),
  time: z.string().refine(isLocalTime),
  note: z.string().trim().max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters or fewer`),
})

const clientSchema = z.discriminatedUnion('clientKind', [
  z.object({ clientKind: z.literal('account'), email: emailSchema }),
  z.object({
    clientKind: z.literal('walk_in'),
    walkInName: z.string().trim().min(1, 'Enter the client’s name').max(100, 'Use 100 characters or fewer'),
    walkInPhone: optionalPhone,
  }),
])

export async function adminBookAction(_previous: FormState<AdminBookField>, formData: FormData): Promise<FormState<AdminBookField>> {
  const current = await requireRole('admin')
  const values = {
    clientKind: field(formData, 'clientKind'),
    email: field(formData, 'email'),
    walkInName: field(formData, 'walkInName'),
    walkInPhone: field(formData, 'walkInPhone'),
    note: field(formData, 'note'),
  }
  const base = baseSchema.safeParse({ service: field(formData, 'service'), stylist: field(formData, 'stylist'), date: field(formData, 'date'), time: field(formData, 'time'), note: values.note })
  if (!base.success) {
    if (base.error.issues.some((i) => i.path[0] === 'note')) return invalid(base.error, values)
    return failed('Please choose the service, stylist and time again.', values)
  }
  const who = clientSchema.safeParse(values)
  if (!who.success) return invalid(who.error, values, who.error.issues.some((i) => i.path[0] === 'clientKind') ? 'Choose who the booking is for.' : undefined)

  let client: { kind: 'account'; userId: string } | { kind: 'walk_in'; name: string; phone: string | null }
  if (who.data.clientKind === 'account') {
    const user = await findUserByEmail(who.data.email)
    if (!user || user.role !== 'client' || user.deactivatedAt) {
      return fieldError('email', 'No active client account has that email. Book them as a walk-in instead, or ask them to sign up.', values)
    }
    client = { kind: 'account', userId: user.id }
  } else {
    client = { kind: 'walk_in', name: who.data.walkInName, phone: who.data.walkInPhone }
  }

  const [settings, service] = await Promise.all([getSettings(), getServiceById(base.data.service)])
  if (!service || service.archivedAt) return failed('That service isn’t on the menu any more.', values)
  const { date, time, stylist, note } = base.data

  const result = await createBooking({
    serviceId: service.id,
    stylistId: stylist === 'any' ? null : stylist,
    date,
    startsAt: zonedToInstant(date, time, settings.timeZone),
    note,
    client,
    bookedBy: current.user.id,
    staff: true,
  })
  if (!result.ok) return failed('Sorry, that time was just taken. Please pick another.', values)

  if (client.kind === 'account') {
    after(async () => {
      const booking = await getBooking(await viewerFrom(current), result.id)
      if (booking) await sendBookingEmail('confirmed', booking, settings)
    })
  }
  redirect(`/appointments/${result.id}?notice=booked-for`)
}
