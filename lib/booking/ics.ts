// THE "ADD TO CALENDAR" FILE (.ics, the iCalendar format of RFC 5545),
// written by hand: it's a small text format, and every calendar app
// (Google, Apple, Outlook) opens it.
//
// The choices that matter:
// - Times are written in UTC with a trailing Z (20261021T093000Z). The
//   calendar app shows them in the reader's own zone, so a client who is
//   abroad sees the right moment in their local time. No VTIMEZONE block is
//   needed, and our time-zone maths stays in one place (lib/time.ts).
// - UID is stable per booking ("booking-42@your-domain"), and SEQUENCE is
//   the booking's version. When a booking is RESCHEDULED, the new file has
//   the same UID and a higher SEQUENCE, so calendar apps UPDATE the event
//   instead of adding a second one. A CANCELLED booking is sent with
//   STATUS:CANCELLED, which removes or strikes out the event.
// - The event covers the SERVICE only; the clean-up buffer is the studio's
//   business, not the client's.
import 'server-only'

import { appUrl } from '@/lib/auth/email'
import type { StudioSettings } from '@/lib/settings'
import type { Booking } from './bookings'

/** 2026-10-21T09:30:00.000Z → 20261021T093000Z */
function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Text values escape \ ; , and newlines (RFC 5545 §3.3.11). */
function icsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * Lines longer than 75 OCTETS must be folded: broken with CRLF + a space.
 * Counted in UTF-8 bytes (₦ is 3 bytes), and never splitting a character.
 */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function bookingIcs(booking: Booking, settings: StudioSettings, options: { cancelled?: boolean } = {}): string {
  const host = new URL(appUrl('/')).hostname
  const end = new Date(booking.startsAt.getTime() + booking.durationMinutes * 60_000)
  const cancelled = options.cancelled ?? booking.status === 'cancelled'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ipade//Bookings//EN',
    'CALSCALE:GREGORIAN',
    // PUBLISH, even for a cancellation: METHOD:CANCEL is for meeting invites
    // with an organiser and attendees, which this isn't.
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@${host}`,
    `SEQUENCE:${booking.version}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(booking.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(`${booking.serviceName} with ${booking.stylistName} at ${settings.studioName}`)}`,
    `LOCATION:${icsText(settings.address)}`,
    `DESCRIPTION:${icsText(`Booking #${booking.id}. To reschedule or cancel: ${appUrl(`/appointments/${booking.id}`)}`)}`,
    `URL:${appUrl(`/appointments/${booking.id}`)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    // A reminder two hours before, in the client's calendar app.
    ...(cancelled ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`${booking.serviceName} in 2 hours`)}`, 'TRIGGER:-PT2H', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  // iCalendar lines end with CRLF, including the last.
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function icsFilename(booking: Booking): string {
  return `ipade-booking-${booking.id}.ics`
}
