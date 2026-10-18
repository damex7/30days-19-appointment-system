// GET /appointments/42/calendar.ics: the "Add to calendar" file.
//
// A route handler, so it checks for itself (proxy.ts only checked that a
// cookie exists):
//   - no valid session        → 401
//   - temporary password      → 403
//   - not YOUR booking        → 404 (getBooking's SQL scope finds no row,
//                                exactly as for an id that doesn't exist)
// so a client can't download someone else's appointment by changing the
// number in the link.
import { notFound } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { authorizeRequest } from '@/lib/auth/dal'
import { viewerFrom } from '@/lib/booking/access'
import { getBooking } from '@/lib/booking/bookings'
import { bookingIcs, icsFilename } from '@/lib/booking/ics'
import { getSettings } from '@/lib/settings'

export async function GET(_request: NextRequest, { params }: RouteContext<'/appointments/[id]/calendar.ics'>) {
  const auth = await authorizeRequest('client', 'stylist', 'admin')
  if (!auth.ok) return new Response(auth.status === 401 ? 'Please sign in.' : 'Not allowed.', { status: auth.status })

  const { id } = await params
  if (!/^\d{1,9}$/.test(id)) notFound()
  const [viewer, settings] = await Promise.all([viewerFrom(auth.current), getSettings()])
  const booking = await getBooking(viewer, Number(id))
  if (!booking) notFound()

  return new Response(bookingIcs(booking, settings), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsFilename(booking)}"`,
      // Personal data: never stored by a shared cache.
      'Cache-Control': 'private, no-store',
    },
  })
}
