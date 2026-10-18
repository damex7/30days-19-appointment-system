// GET /api/cron/reminders: emails every client with an appointment
// TOMORROW (in the studio's zone), once.
//
// WHO MAY CALL IT: Vercel Cron, which sends "Authorization: Bearer
// <CRON_SECRET>" when the CRON_SECRET environment variable is set. Anyone
// else gets 401. With no secret configured at all, the route refuses to
// run (500) rather than being open to the internet.
//
// NEVER TWICE: claimTomorrowsReminders() marks the bookings
// (reminder_sent_at) in the same statement that selects them, before any
// email goes out, so a retried or repeated run finds nothing left to send.
// Each email also carries a Resend Idempotency-Key as a second guard.
//
// TIMING: vercel.json runs it once a day at 17:00 UTC (18:00 in Lagos).
// The Hobby plan allows daily cron jobs only, and runs them at some point
// within the scheduled HOUR, not at the exact minute. That's fine for a
// "see you tomorrow" email; "two hours before" reminders would need a paid
// plan (or another scheduler) running every few minutes.
import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { claimTomorrowsReminders } from '@/lib/booking/bookings'
import { sendBookingEmail } from '@/lib/booking/emails'
import { getSettings } from '@/lib/settings'

/** Compares in constant time, so the response time doesn't leak how much of a guess was right. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: 'CRON_SECRET is not set, so reminders are switched off.' }, { status: 500 })
  const header = request.headers.get('authorization') ?? ''
  if (!sameSecret(header, `Bearer ${secret}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [settings, bookings] = await Promise.all([getSettings(), claimTomorrowsReminders()])
  // One at a time: a studio has tens of appointments a day, and this keeps
  // well inside the email service's rate limit.
  for (const booking of bookings) await sendBookingEmail('reminder', booking, settings)

  return Response.json({ reminded: bookings.length, bookingIds: bookings.map((b) => b.id) }, { headers: { 'Cache-Control': 'no-store' } })
}
