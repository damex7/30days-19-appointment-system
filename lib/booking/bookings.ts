// BOOKING QUERIES: making, moving, cancelling and finishing appointments.
//
// Three rules hold for every function in this file:
//
// 1. OWNERSHIP IN SQL. Anything that reads or changes ONE booking includes
//    bookingScope(viewer) in its WHERE clause (lib/booking/access.ts), so
//    another person's booking is "not found", never "forbidden".
//
// 2. NEVER TRUST THE BROWSER'S SLOT. The start time a form sends is only a
//    request. It is re-checked against open_slots() inside the same SQL
//    statement that writes the booking, and the exclusion constraint
//    bookings_no_overlap is the final judge if two requests race.
//
// 3. A CHANGE AND ITS HISTORY ARE WRITTEN TOGETHER. Each write is ONE SQL
//    statement whose data-modifying CTEs update `bookings` AND append to
//    `booking_events`. A single statement is atomic in PostgreSQL (it is
//    its own transaction): both writes happen, or neither does. And it's one
//    round trip from Lagos to the database, not three.
import 'server-only'

import { z } from 'zod'
import { sql } from '@/lib/db'
import { isExclusionError } from '@/lib/db-errors'
import { parseRows } from '@/lib/rows'
import { bookingScope, type Viewer } from './access'

export const BOOKING_STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

const BookingSchema = z.object({
  id: z.number().int(),
  status: z.enum(BOOKING_STATUSES),
  startsAt: z.date(),
  /** End of the range, INCLUDING the clean-up buffer. */
  endsAt: z.date(),
  durationMinutes: z.number().int(),
  priceKobo: z.coerce.number().int().refine(Number.isSafeInteger),
  clientNote: z.string(),
  version: z.number().int(),
  serviceId: z.number().int(),
  serviceName: z.string(),
  serviceSlug: z.string(),
  stylistId: z.number().int(),
  stylistName: z.string(),
  clientId: z.uuid().nullable(),
  /** The client's account name, or the walk-in name. */
  clientName: z.string(),
  clientEmail: z.string().nullable(),
  clientPhone: z.string().nullable(),
  isWalkIn: z.boolean(),
  cancelledAt: z.date().nullable(),
  cancelReason: z.string().nullable(),
  cancelledByName: z.string().nullable(),
  createdAt: z.date(),
})
export type Booking = z.infer<typeof BookingSchema>

/** The columns every booking read returns, from `bookings b` and its joins. */
const bookingColumns = () => sql`
  b.id, b.status, lower(b.during) AS "startsAt", upper(b.during) AS "endsAt",
  b.duration_minutes AS "durationMinutes", b.price_kobo AS "priceKobo", b.client_note AS "clientNote",
  b.version, b.service_id AS "serviceId", sv.name AS "serviceName", sv.slug AS "serviceSlug",
  b.stylist_id AS "stylistId", st.display_name AS "stylistName",
  b.client_id AS "clientId", COALESCE(cu.name, b.walk_in_name) AS "clientName",
  cu.email::text AS "clientEmail", COALESCE(cu.phone, b.walk_in_phone) AS "clientPhone",
  b.client_id IS NULL AS "isWalkIn",
  b.cancelled_at AS "cancelledAt", b.cancel_reason AS "cancelReason", cb.name AS "cancelledByName",
  b.created_at AS "createdAt"`

const bookingJoins = () => sql`
  JOIN services sv ON sv.id = b.service_id
  JOIN stylists st ON st.id = b.stylist_id
  LEFT JOIN users cu ON cu.id = b.client_id
  LEFT JOIN users cb ON cb.id = b.cancelled_by`

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** One booking, if the viewer may see it; otherwise null (→ 404). */
export async function getBooking(viewer: Viewer, id: number): Promise<Booking | null> {
  const rows = await sql`
    SELECT ${bookingColumns()} FROM bookings b ${bookingJoins()}
    WHERE b.id = ${id} AND ${bookingScope(viewer)}`
  return parseRows(BookingSchema, rows, 'getBooking')[0] ?? null
}

/**
 * A client's own bookings: upcoming (soonest first) and past (latest
 * first), using bookings_client_start_idx. "Upcoming" means confirmed and
 * not yet finished; everything else is history.
 */
export async function listClientBookings(clientId: string): Promise<{ upcoming: Booking[]; past: Booking[] }> {
  const rows = await sql`
    SELECT ${bookingColumns()} FROM bookings b ${bookingJoins()}
    WHERE b.client_id = ${clientId}
    ORDER BY lower(b.during) DESC
    LIMIT 200`
  const all = parseRows(BookingSchema, rows, 'listClientBookings')
  const now = Date.now()
  const upcoming = all.filter((b) => b.status === 'confirmed' && b.endsAt.getTime() > now).reverse()
  const past = all.filter((b) => !(b.status === 'confirmed' && b.endsAt.getTime() > now))
  return { upcoming, past }
}

/**
 * Every booking overlapping [start, end), within the viewer's scope: a
 * stylist's day or week (their own only), or the admin's day view (all).
 * `during && range` uses the GiST index bookings_stylist_during_idx.
 */
export async function listBookingsBetween(viewer: Viewer, start: Date, end: Date): Promise<Booking[]> {
  const rows = await sql`
    SELECT ${bookingColumns()} FROM bookings b ${bookingJoins()}
    WHERE b.during && tstzrange(${start}, ${end}) AND ${bookingScope(viewer)}
    ORDER BY lower(b.during), st.display_name`
  return parseRows(BookingSchema, rows, 'listBookingsBetween')
}

export type BookingFilters = {
  stylistId: number | null
  serviceId: number | null
  status: BookingStatus | null
  from: Date
  to: Date
  page: number
}

export const ADMIN_BOOKINGS_PAGE_SIZE = 25

/**
 * The admin's filtered booking list. Each filter is an optional SQL
 * FRAGMENT: a filter that isn't set adds nothing, and every value is still
 * a parameter. count(*) OVER () returns the total with the page.
 */
export async function listBookingsForAdmin(viewer: Viewer, filters: BookingFilters): Promise<{ bookings: Booking[]; total: number }> {
  const rows = await sql`
    SELECT ${bookingColumns()}, count(*) OVER ()::int AS total
    FROM bookings b ${bookingJoins()}
    WHERE ${bookingScope(viewer)}
      AND lower(b.during) >= ${filters.from} AND lower(b.during) < ${filters.to}
      ${filters.stylistId ? sql`AND b.stylist_id = ${filters.stylistId}` : sql``}
      ${filters.serviceId ? sql`AND b.service_id = ${filters.serviceId}` : sql``}
      ${filters.status ? sql`AND b.status = ${filters.status}` : sql``}
    ORDER BY lower(b.during), b.id
    LIMIT ${ADMIN_BOOKINGS_PAGE_SIZE} OFFSET ${(filters.page - 1) * ADMIN_BOOKINGS_PAGE_SIZE}`
  const total = Number(rows[0]?.total ?? 0)
  return { bookings: parseRows(BookingSchema, rows, 'listBookingsForAdmin'), total }
}

const EventSchema = z.object({
  id: z.coerce.number().int(),
  type: z.enum(['created', 'rescheduled', 'cancelled', 'completed', 'no_show', 'reminder_sent']),
  actorName: z.string().nullable(),
  fromStart: z.date().nullable(),
  toStart: z.date().nullable(),
  note: z.string().nullable(),
  createdAt: z.date(),
})
export type BookingEvent = z.infer<typeof EventSchema>

/** A booking's history, oldest first. The scope check is on the booking (EXISTS). */
export async function listBookingEvents(viewer: Viewer, bookingId: number): Promise<BookingEvent[]> {
  const rows = await sql`
    SELECT e.id, e.type, u.name AS "actorName", lower(e.from_during) AS "fromStart", lower(e.to_during) AS "toStart",
           e.note, e.created_at AS "createdAt"
    FROM booking_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.booking_id = ${bookingId}
      AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = e.booking_id AND ${bookingScope(viewer)})
    ORDER BY e.created_at, e.id`
  return parseRows(EventSchema, rows, 'listBookingEvents')
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export type NewBooking = {
  serviceId: number
  /** null = "any available stylist": one is chosen below. */
  stylistId: number | null
  /** The LOCAL date the slot was picked on (open_slots works one local day at a time). */
  date: string
  startsAt: Date
  note: string
  /** Who it's for: a client account, or a walk-in by name (admin only). */
  client: { kind: 'account'; userId: string } | { kind: 'walk_in'; name: string; phone: string | null }
  /** Who is making it: the client, or the admin at the desk. */
  bookedBy: string
  /** An admin booking skips minimum notice and the booking window. */
  staff: boolean
}

export type BookResult = { ok: true; id: number } | { ok: false; reason: 'taken' }

/**
 * Makes a booking, in ONE statement:
 *
 *   candidate  re-runs open_slots() for that day and keeps only rows at the
 *              requested start: the SERVER-SIDE RE-CHECK. If the time was
 *              taken (or never open: a hand-made request), there is no row,
 *              nothing is inserted, and we answer 'taken'.
 *              With "any stylist" several stylists may be free; we pick the
 *              one with the LEAST BOOKED TIME THAT DAY (then the lowest id,
 *              so the choice is predictable). That spreads work evenly
 *              rather than always filling the first stylist's day.
 *   inserted   the booking. Its range is start + duration + buffer, and the
 *              price and duration are COPIED from the service.
 *   event      the 'created' history row.
 *
 * Then the RACE: two clients submit 10:30 with Funmi at the same instant.
 * Both statements see the slot open (neither has committed yet). The first
 * INSERT takes the slot; the second waits for it, then fails the
 * bookings_no_overlap exclusion constraint with error 23P01. We catch that
 * and answer 'taken'. With "any stylist" we try again (up to 3 times):
 * open_slots now sees the first booking, so another free stylist is chosen.
 *
 * A client booking for themselves must have a VERIFIED email (checked in
 * the same WHERE, as a backstop to the action's own check).
 */
export async function createBooking(input: NewBooking): Promise<BookResult> {
  const attempts = input.stylistId === null ? 3 : 1
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const id = await insertBooking(input)
      return id === null ? { ok: false, reason: 'taken' } : { ok: true, id }
    } catch (error) {
      if (!isExclusionError(error, 'bookings_no_overlap')) throw error
    }
  }
  return { ok: false, reason: 'taken' }
}

async function insertBooking(input: NewBooking): Promise<number | null> {
  const clientId = input.client.kind === 'account' ? input.client.userId : null
  const walkInName = input.client.kind === 'walk_in' ? input.client.name : null
  const walkInPhone = input.client.kind === 'walk_in' ? input.client.phone : null
  const rows = await sql`
    WITH day AS (
      SELECT tstzrange(${input.date}::date::timestamp AT TIME ZONE s.time_zone,
                       (${input.date}::date + 1)::timestamp AT TIME ZONE s.time_zone) AS range
      FROM settings s
    ),
    candidate AS (
      SELECT o.stylist_id
      FROM open_slots(${input.serviceId}::int, ${input.stylistId}::int, ${input.date}::date, NULL, ${input.staff}::boolean) o, day
      WHERE o.starts_at = ${input.startsAt}
        AND (${clientId}::uuid IS NULL
             OR EXISTS (SELECT 1 FROM users u WHERE u.id = ${clientId}::uuid AND u.deactivated_at IS NULL
                          -- A client booking for themselves needs a confirmed email; the
                          -- studio booking for them on the phone vouches for them.
                          AND (u.email_verified_at IS NOT NULL OR ${input.staff}::boolean)))
      ORDER BY (SELECT COALESCE(sum(upper(b.during) - lower(b.during)), interval '0')
                FROM bookings b
                WHERE b.stylist_id = o.stylist_id AND b.status = 'confirmed' AND b.during && day.range),
               o.stylist_id
      LIMIT 1
    ),
    inserted AS (
      INSERT INTO bookings (client_id, walk_in_name, walk_in_phone, stylist_id, service_id, booked_by,
                            during, duration_minutes, price_kobo, client_note)
      SELECT ${clientId}::uuid, ${walkInName}, ${walkInPhone}, candidate.stylist_id, sv.id, ${input.bookedBy}::uuid,
             tstzrange(${input.startsAt}::timestamptz,
                       ${input.startsAt}::timestamptz + make_interval(mins => sv.duration_minutes + sv.buffer_minutes), '[)'),
             sv.duration_minutes, sv.price_kobo, ${input.note}
      FROM candidate, services sv
      WHERE sv.id = ${input.serviceId}
      RETURNING id, during
    ),
    event AS (
      INSERT INTO booking_events (booking_id, type, actor_id, to_during)
      SELECT id, 'created', ${input.bookedBy}::uuid, during FROM inserted
    )
    SELECT id FROM inserted`
  const id = rows[0]?.id
  return typeof id === 'number' ? id : null
}

// ---------------------------------------------------------------------------
// Changing a booking
// ---------------------------------------------------------------------------

export type ChangeFailure = 'not_found' | 'not_confirmed' | 'stale' | 'too_late' | 'taken' | 'not_started'
export type ChangeResult = { ok: true } | { ok: false; reason: ChangeFailure }

/**
 * After a guarded write matched no row, work out WHY, for an honest
 * message. Read with the same scope, so this can't reveal someone else's
 * booking either.
 */
async function explainFailure(viewer: Viewer, id: number, version: number, fallback: ChangeFailure): Promise<ChangeResult> {
  const booking = await getBooking(viewer, id)
  if (!booking) return { ok: false, reason: 'not_found' }
  if (booking.version !== version) return { ok: false, reason: 'stale' }
  if (booking.status !== 'confirmed') return { ok: false, reason: 'not_confirmed' }
  return { ok: false, reason: fallback }
}

/**
 * The cancellation cut-off as SQL: clients may only change a booking that
 * starts more than settings.cancellation_cutoff_hours from now. Staff
 * (stylists can't reschedule; admins can) have no cut-off.
 */
const beforeCutoff = (viewer: Viewer) =>
  viewer.role === 'admin'
    ? sql`TRUE`
    : sql`lower(b.during) > now() + make_interval(hours => (SELECT cancellation_cutoff_hours FROM settings))`

/**
 * RESCHEDULE, in one statement, so the old time is freed and the new one
 * taken TOGETHER, or nothing changes:
 *
 *   target   the booking: in scope, still confirmed, at the version the
 *            person saw (optimistic locking), and before the cut-off.
 *   open     the new start must be an open slot for the SAME stylist on the
 *            new day, IGNORING this booking's own current range (otherwise
 *            moving 10:00 to 10:15 would clash with itself).
 *   moved    one UPDATE replaces `during`. It's a single row, so there is no
 *            moment where the client holds both times or neither. The
 *            exclusion constraint checks the new range against everyone
 *            else's; a racing booking makes this fail with 23P01.
 *            The reminder flag is reset, so the new day gets a reminder.
 *   event    'rescheduled', with both the old and the new range.
 */
export async function rescheduleBooking(viewer: Viewer, input: { id: number; version: number; date: string; startsAt: Date }): Promise<ChangeResult> {
  try {
    const rows = await sql`
      WITH target AS (
        SELECT b.id, b.stylist_id, b.service_id, b.during
        FROM bookings b
        WHERE b.id = ${input.id} AND ${bookingScope(viewer)}
          AND b.status = 'confirmed' AND b.version = ${input.version}
          AND ${beforeCutoff(viewer)}
      ),
      open AS (
        SELECT 1
        FROM target, open_slots(target.service_id, target.stylist_id, ${input.date}::date, target.id, ${viewer.role === 'admin'}::boolean) o
        WHERE o.starts_at = ${input.startsAt}
      ),
      moved AS (
        UPDATE bookings b
        SET during = tstzrange(${input.startsAt}::timestamptz,
                               ${input.startsAt}::timestamptz + (upper(target.during) - lower(target.during)), '[)'),
            version = b.version + 1,
            reminder_sent_at = NULL
        FROM target
        WHERE b.id = target.id AND EXISTS (SELECT 1 FROM open)
        RETURNING b.id, target.during AS old_during, b.during AS new_during
      ),
      event AS (
        INSERT INTO booking_events (booking_id, type, actor_id, from_during, to_during)
        SELECT id, 'rescheduled', ${viewer.userId}::uuid, old_during, new_during FROM moved
      )
      SELECT id FROM moved`
    if (rows.length > 0) return { ok: true }
  } catch (error) {
    if (!isExclusionError(error, 'bookings_no_overlap')) throw error
    return { ok: false, reason: 'taken' }
  }
  // Nothing matched: not found, changed by someone else, past the cut-off,
  // or the new time wasn't open.
  const why = await explainFailure(viewer, input.id, input.version, 'taken')
  if (!why.ok && why.reason === 'taken' && viewer.role !== 'admin') {
    const cutoff = await sql`
      SELECT lower(during) > now() + make_interval(hours => (SELECT cancellation_cutoff_hours FROM settings)) AS ok
      FROM bookings WHERE id = ${input.id}`
    if (cutoff[0]?.ok === false) return { ok: false, reason: 'too_late' }
  }
  return why
}

/**
 * CANCEL: clients (their own, before the cut-off) and admins (any, any
 * time). Stylists don't cancel; they mark no-shows. The freed time is open
 * again at once, because the exclusion constraint only covers 'confirmed'.
 */
export async function cancelBooking(viewer: Viewer, input: { id: number; version: number; reason: string }): Promise<ChangeResult> {
  if (viewer.role === 'stylist') return { ok: false, reason: 'not_found' }
  const rows = await sql`
    WITH target AS (
      SELECT b.id FROM bookings b
      WHERE b.id = ${input.id} AND ${bookingScope(viewer)}
        AND b.status = 'confirmed' AND b.version = ${input.version}
        AND upper(b.during) > now()
        AND ${beforeCutoff(viewer)}
    ),
    cancelled AS (
      UPDATE bookings b
      SET status = 'cancelled', cancelled_at = now(), cancelled_by = ${viewer.userId}::uuid,
          cancel_reason = NULLIF(${input.reason}, ''), version = b.version + 1
      FROM target WHERE b.id = target.id
      RETURNING b.id
    ),
    event AS (
      INSERT INTO booking_events (booking_id, type, actor_id, note)
      SELECT id, 'cancelled', ${viewer.userId}::uuid, NULLIF(${input.reason}, '') FROM cancelled
    )
    SELECT id FROM cancelled`
  if (rows.length > 0) return { ok: true }
  return explainFailure(viewer, input.id, input.version, 'too_late')
}

/**
 * COMPLETED or NO-SHOW: the stylist (their own bookings) or an admin,
 * and only once the appointment has STARTED (lower(during) <= now(),
 * checked in SQL), so nobody can be marked a no-show in advance.
 */
export async function markBooking(viewer: Viewer, input: { id: number; version: number; outcome: 'completed' | 'no_show' }): Promise<ChangeResult> {
  if (viewer.role === 'client') return { ok: false, reason: 'not_found' }
  const rows = await sql`
    WITH target AS (
      SELECT b.id FROM bookings b
      WHERE b.id = ${input.id} AND ${bookingScope(viewer)}
        AND b.status = 'confirmed' AND b.version = ${input.version}
        AND lower(b.during) <= now()
    ),
    marked AS (
      UPDATE bookings b SET status = ${input.outcome}, version = b.version + 1
      FROM target WHERE b.id = target.id
      RETURNING b.id
    ),
    event AS (
      INSERT INTO booking_events (booking_id, type, actor_id)
      SELECT id, ${input.outcome}, ${viewer.userId}::uuid FROM marked
    )
    SELECT id FROM marked`
  if (rows.length > 0) return { ok: true }
  return explainFailure(viewer, input.id, input.version, 'not_started')
}

// ---------------------------------------------------------------------------
// Reminders (the cron job)
// ---------------------------------------------------------------------------

/**
 * CLAIMS tomorrow's reminders and returns them, in one statement.
 *
 * "Tomorrow" is the studio's local tomorrow, worked out in SQL from the
 * settings row: [local midnight tomorrow, local midnight the day after).
 *
 * The UPDATE sets reminder_sent_at BEFORE any email goes out, and only on
 * rows where it is still NULL. If the job runs twice (Vercel can retry, or
 * someone calls the URL by hand), the second run claims nothing, so no
 * client gets two reminders. The trade-off: if sending fails after the
 * claim, that one reminder is lost rather than sent twice, which is the
 * better failure for a reminder. Uses bookings_reminder_due_idx.
 */
export async function claimTomorrowsReminders(): Promise<Booking[]> {
  const rows = await sql`
    WITH tomorrow AS (
      SELECT tstzrange(((now() AT TIME ZONE s.time_zone)::date + 1)::timestamp AT TIME ZONE s.time_zone,
                       ((now() AT TIME ZONE s.time_zone)::date + 2)::timestamp AT TIME ZONE s.time_zone) AS range
      FROM settings s
    ),
    claimed AS (
      UPDATE bookings b SET reminder_sent_at = now()
      FROM tomorrow
      WHERE b.status = 'confirmed' AND b.client_id IS NOT NULL AND b.reminder_sent_at IS NULL
        AND lower(b.during) >= lower(tomorrow.range) AND lower(b.during) < upper(tomorrow.range)
      RETURNING b.*
    ),
    event AS (
      INSERT INTO booking_events (booking_id, type) SELECT id, 'reminder_sent' FROM claimed
    )
    SELECT ${bookingColumns()} FROM claimed b ${bookingJoins()}
    ORDER BY lower(b.during)`
  return parseRows(BookingSchema, rows, 'claimTomorrowsReminders')
}
