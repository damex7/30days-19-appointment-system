// Used ONLY by proxy.ts, kept apart from lib/booking/access.ts so the proxy
// doesn't load the whole data access layer on every request.
import 'server-only'

import { sql } from '@/lib/db'

/**
 * The same ownership rule, asked from proxy.ts with only the session
 * cookie in hand: "may whoever holds this session token see booking N?"
 *
 * Why the proxy asks at all: pages under Cache Components start streaming
 * a 200 before the page's own check runs, and a status can't be changed
 * once streaming has begun. The proxy runs BEFORE rendering, so it can
 * answer with a true 404. The page still runs getBooking() with
 * bookingScope(), which is what actually keeps the data private; this is
 * only there so the HTTP status tells the truth.
 *
 * One indexed query: the session by its primary key, the booking by its
 * primary key. 'no_session' (expired, revoked, made up) is told apart from
 * 'hidden', so the page can still send that person to sign in.
 */
export async function bookingVisibility(tokenHash: string, bookingId: number): Promise<'visible' | 'hidden' | 'no_session'> {
  const rows = await sql`
    SELECT EXISTS (
             SELECT 1 FROM bookings b
             WHERE b.id = ${bookingId}
               AND (u.role = 'admin'
                    OR (u.role = 'client' AND b.client_id = u.id)
                    OR (u.role = 'stylist' AND b.stylist_id = st.id))
           ) AS visible
    FROM sessions s
    JOIN users u ON u.id = s.user_id AND u.deactivated_at IS NULL
    LEFT JOIN stylists st ON st.user_id = u.id
    WHERE s.id = ${tokenHash} AND s.expires_at > now()`
  const row = rows[0]
  if (!row) return 'no_session'
  return row.visible === true ? 'visible' : 'hidden'
}
