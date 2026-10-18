// WHO MAY SEE WHICH BOOKING: the ownership rule, in ONE place.
//
// requireRole() (lib/auth/dal.ts) answers "may this KIND of person use this
// page?". This answers "may THIS person see THIS booking?", and it does so
// inside the SQL itself:
//
//   client  → AND b.client_id  = <their user id>
//   stylist → AND b.stylist_id = <their stylist id>
//   admin   → (no extra condition)
//
// Every query in lib/booking/bookings.ts that reads or changes one booking
// adds bookingScope(viewer) to its WHERE clause. So when a client edits the
// id in /appointments/42 to 43, or hand-crafts a POST to cancel booking 43,
// the query simply finds NO ROW. The page turns that into notFound() (a
// 404) and an action into "That booking wasn't found": the same answer as
// for an id that doesn't exist, so nobody can even learn that 43 exists.
//
// Why in SQL and not "load it, then compare owner ids in TypeScript"? A
// forgotten `if` in one code path would leak a booking; a WHERE clause that
// every query is built with can't be forgotten in one place.
import 'server-only'

import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/dal'
import { sql } from '@/lib/db'
import type { SessionWithUser } from '@/lib/auth/dal'
import { getStylistForUser } from '@/lib/studio/stylists'
import type { Role } from '@/lib/validation'

/** Who is asking: built from the SESSION, never from anything the browser sent. */
export type Viewer = { userId: string; role: Role; stylistId: number | null }

export async function viewerFrom(current: SessionWithUser): Promise<Viewer> {
  const { id, role } = current.user
  const stylist = role === 'stylist' ? await getStylistForUser(id) : null
  return { userId: id, role, stylistId: stylist?.id ?? null }
}

/**
 * The ownership condition for a query on `bookings b`. A stylist account
 * without a stylists row (which shouldn't happen) sees nothing.
 */
export function bookingScope(viewer: Viewer) {
  if (viewer.role === 'admin') return sql`TRUE`
  if (viewer.role === 'stylist') return viewer.stylistId === null ? sql`FALSE` : sql`b.stylist_id = ${viewer.stylistId}`
  return sql`b.client_id = ${viewer.userId}`
}

/**
 * For stylist pages and actions: the session (role 'stylist'), the
 * stylist's own row, and their viewer. The stylist id used in every query
 * comes from HERE, from the session, never from the URL or a form.
 */
export async function requireStylist() {
  const current = await requireRole('stylist')
  const stylist = await getStylistForUser(current.user.id)
  // A stylist account without a stylists row shouldn't exist (they're
  // created together); treat it as "nothing here".
  if (!stylist) notFound()
  const viewer: Viewer = { userId: current.user.id, role: 'stylist', stylistId: stylist.id }
  return { current, stylist, viewer }
}
