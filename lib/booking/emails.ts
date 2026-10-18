// BOOKING EMAILS: confirmed, rescheduled, cancelled and tomorrow's
// reminder. Each one carries the .ics file, so the client's calendar stays
// in step (same UID, higher SEQUENCE: see lib/booking/ics.ts), and states
// every time in the STUDIO's zone with the zone named ("10:30 AM, WAT
// (UTC+1)"): an email may be read anywhere.
//
// Sent with after() by the actions, once the response has gone, so the
// client never waits for the email service. sendEmail never throws.
import 'server-only'

import { appUrl, escapeHtml, layout, sendEmail, type Email } from '@/lib/auth/email'
import { formatNaira } from '@/lib/money'
import { whatsappLink } from '@/lib/phone'
import type { StudioSettings } from '@/lib/settings'
import { formatDateTime, formatDuration, zoneLabel } from '@/lib/time'
import type { Booking } from './bookings'
import { bookingIcs, icsFilename } from './ics'

type Kind = 'confirmed' | 'rescheduled' | 'cancelled' | 'reminder'

const SUBJECTS: Record<Kind, (b: Booking, s: StudioSettings) => string> = {
  confirmed: (b, s) => `Booked: ${b.serviceName} on ${formatDateTime(b.startsAt, s.timeZone)}`,
  rescheduled: (b, s) => `Moved: ${b.serviceName} is now on ${formatDateTime(b.startsAt, s.timeZone)}`,
  cancelled: (b, s) => `Cancelled: ${b.serviceName} on ${formatDateTime(b.startsAt, s.timeZone)}`,
  reminder: (b, s) => `Tomorrow: ${b.serviceName} at ${s.studioName}`,
}

const INTROS: Record<Kind, string> = {
  confirmed: 'Your appointment is booked. We look forward to seeing you.',
  rescheduled: 'Your appointment has moved to a new time. The calendar file below replaces the old one.',
  cancelled: 'Your appointment has been cancelled. The time is free for someone else now.',
  reminder: 'A reminder that your appointment is tomorrow.',
}

export function bookingEmail(kind: Kind, booking: Booking, settings: StudioSettings): Email | null {
  // Walk-ins booked at the desk have no email address.
  if (!booking.clientEmail) return null
  const tz = settings.timeZone
  const when = `${formatDateTime(booking.startsAt, tz)}, ${zoneLabel(tz, booking.startsAt)}`
  const link = appUrl(`/appointments/${booking.id}`)
  const whatsapp = whatsappLink(settings.whatsappNumber, `Hello, it's ${booking.clientName} about booking #${booking.id}.`)
  const details: [string, string][] = [
    ['Service', `${booking.serviceName} (${formatDuration(booking.durationMinutes)})`],
    ['Stylist', booking.stylistName],
    ['When', when],
    ['Price', `${formatNaira(booking.priceKobo)}, paid at the studio`],
    ['Where', settings.address],
    ['Booking', `#${booking.id}`],
  ]
  const policy =
    kind === 'cancelled'
      ? 'Want another time? You can book again whenever you like.'
      : `You can reschedule or cancel online up to ${settings.cancellationCutoffHours} hours before. After that, please message us on WhatsApp.`

  const text = [
    `Hello ${booking.clientName},`,
    '',
    INTROS[kind],
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    policy,
    '',
    `Your booking: ${link}`,
    `WhatsApp the studio: ${whatsapp}`,
    '',
    kind === 'cancelled' ? '' : 'The attached .ics file adds it to your calendar.',
  ].join('\n')

  const table = `<table role="presentation" style="border-collapse:collapse;width:100%;margin:8px 0 16px">${details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5c5450;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>`

  return {
    to: booking.clientEmail,
    subject: SUBJECTS[kind](booking, settings),
    text,
    html: layout(
      kind === 'cancelled' ? 'Appointment cancelled' : kind === 'reminder' ? 'See you tomorrow' : kind === 'rescheduled' ? 'Appointment moved' : 'You’re booked',
      [
        `Hello ${escapeHtml(booking.clientName)},`,
        escapeHtml(INTROS[kind]),
        table,
        escapeHtml(policy),
        `Questions? <a href="${escapeHtml(whatsapp)}" style="color:#5e1b3f">Chat with the studio on WhatsApp</a>.`,
      ],
      { label: kind === 'cancelled' ? 'Book again' : 'View your booking', url: kind === 'cancelled' ? appUrl('/book') : link },
    ),
    attachments: [{ filename: icsFilename(booking), content: bookingIcs(booking, settings, { cancelled: kind === 'cancelled' }), contentType: 'text/calendar; charset=utf-8' }],
    // The same booking at the same version is the same email: if it's ever
    // sent twice (a retried request), Resend delivers it once.
    idempotencyKey: `booking-${booking.id}-v${booking.version}-${kind}`,
  }
}

/** Builds and sends; a walk-in without an email is simply skipped. */
export async function sendBookingEmail(kind: Kind, booking: Booking, settings: StudioSettings): Promise<void> {
  const email = bookingEmail(kind, booking, settings)
  if (email) await sendEmail(email)
}
