// STYLIST QUERIES. A stylist is two rows: a users row (the login, from
// Day 17's auth, with role 'stylist') and a stylists row (the name clients
// pick, the bio, the schedule). They're always created together, in one
// statement, by an admin.
import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { cache } from 'react'
import { z } from 'zod'
import { sql, sqlTransaction } from '@/lib/db'
import { parseRows } from '@/lib/rows'
import type { RequestInfo } from '@/lib/auth/request'
import { MENU_TAG } from './services'

const PublicStylistSchema = z.object({
  id: z.number().int(),
  displayName: z.string(),
  bio: z.string(),
  serviceIds: z.array(z.number().int()),
})
export type PublicStylist = z.infer<typeof PublicStylistSchema>

/**
 * Active stylists and the services each offers: the home page and the
 * "choose a stylist" step. Cached with the menu (tag 'menu').
 * array_agg(… ORDER BY …) collects each stylist's service ids into one
 * array column, so one query returns everything.
 */
export async function listPublicStylists(): Promise<PublicStylist[]> {
  'use cache'
  cacheTag(MENU_TAG)
  cacheLife('hours')
  const rows = await sql`
    SELECT st.id, st.display_name AS "displayName", st.bio,
           COALESCE(array_agg(ss.service_id ORDER BY ss.service_id) FILTER (WHERE ss.service_id IS NOT NULL), '{}') AS "serviceIds"
    FROM stylists st
    LEFT JOIN stylist_services ss ON ss.stylist_id = st.id
    WHERE st.active
    GROUP BY st.id
    ORDER BY st.display_name`
  return parseRows(PublicStylistSchema, rows, 'listPublicStylists')
}

const MyStylistSchema = z.object({ id: z.number().int(), displayName: z.string(), active: z.boolean() })
export type MyStylist = z.infer<typeof MyStylistSchema>

/**
 * The stylists row belonging to a user (or null). The stylist pages use
 * this id for every query, so a stylist only ever reads their own
 * schedule. cache() asks the database once per request, however many
 * components need it.
 */
export const getStylistForUser = cache(async (userId: string): Promise<MyStylist | null> => {
  const rows = await sql`SELECT id, display_name AS "displayName", active FROM stylists WHERE user_id = ${userId}`
  return parseRows(MyStylistSchema, rows, 'getStylistForUser')[0] ?? null
})

const AdminStylistSchema = z.object({
  id: z.number().int(),
  userId: z.uuid(),
  displayName: z.string(),
  bio: z.string(),
  active: z.boolean(),
  name: z.string(),
  email: z.string(),
  emailVerifiedAt: z.date().nullable(),
  mustChangePassword: z.boolean(),
  deactivatedAt: z.date().nullable(),
  serviceIds: z.array(z.number().int()),
  upcomingCount: z.number().int(),
})
export type AdminStylist = z.infer<typeof AdminStylistSchema>

/** Every stylist for /admin/stylists, with their account and services. */
export async function listStylistsForAdmin(): Promise<AdminStylist[]> {
  const rows = await sql`
    SELECT st.id, st.user_id AS "userId", st.display_name AS "displayName", st.bio, st.active,
           u.name, u.email::text AS email, u.email_verified_at AS "emailVerifiedAt",
           u.must_change_password AS "mustChangePassword", u.deactivated_at AS "deactivatedAt",
           COALESCE((SELECT array_agg(ss.service_id ORDER BY ss.service_id) FROM stylist_services ss WHERE ss.stylist_id = st.id), '{}') AS "serviceIds",
           (SELECT count(*)::int FROM bookings b
            WHERE b.stylist_id = st.id AND b.status = 'confirmed' AND lower(b.during) > now()) AS "upcomingCount"
    FROM stylists st
    JOIN users u ON u.id = st.user_id
    ORDER BY NOT st.active, st.display_name`
  return parseRows(AdminStylistSchema, rows, 'listStylistsForAdmin')
}

/** Just names, for filters and the admin's booking form. Inactive ones included (old bookings). */
export async function listStylistOptions(): Promise<{ id: number; displayName: string; active: boolean }[]> {
  const rows = await sql`SELECT id, display_name AS "displayName", active FROM stylists ORDER BY NOT active, display_name`
  return parseRows(z.object({ id: z.number().int(), displayName: z.string(), active: z.boolean() }), rows, 'listStylistOptions')
}

export type NewStylistInput = {
  name: string
  email: string
  displayName: string
  bio: string
  serviceIds: number[]
  passwordHash: string
}

/**
 * Creates a STYLIST ACCOUNT, all in ONE statement (one statement is
 * all-or-nothing, so there's never a user without its stylists row):
 *   1. the users row: role 'stylist', a TEMPORARY password (already hashed)
 *      and must_change_password = true;
 *   2. the stylists row pointing at it;
 *   3. one stylist_services row per chosen service;
 *   4. the audit event, with the admin as actor.
 * ON CONFLICT DO NOTHING on the email: if it's taken, `created` is empty,
 * so nothing downstream inserts either, and we return null.
 */
export async function createStylistAccount(actorId: string, input: NewStylistInput, request: RequestInfo): Promise<string | null> {
  const rows = await sql`
    WITH created AS (
      INSERT INTO users (name, email, password_hash, role, must_change_password)
      VALUES (${input.name}, ${input.email}, ${input.passwordHash}, 'stylist', true)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    ),
    stylist AS (
      INSERT INTO stylists (user_id, display_name, bio)
      SELECT id, ${input.displayName}, ${input.bio} FROM created
      RETURNING id
    ),
    offers AS (
      INSERT INTO stylist_services (stylist_id, service_id)
      SELECT stylist.id, service_id FROM stylist, unnest(${input.serviceIds}::int[]) AS service_id
    )
    INSERT INTO auth_events (user_id, actor_id, type, ip, user_agent, metadata)
    SELECT id, ${actorId}, 'user_created', ${request.ip}, ${request.userAgent}, jsonb_build_object('role', 'stylist')
    FROM created
    RETURNING user_id AS "userId"`
  const id = rows[0]?.userId
  return typeof id === 'string' ? id : null
}

/**
 * Updates the public profile and REPLACES the set of services, in one
 * transaction: delete the links that were unticked, add the new ones.
 * Unticking a service doesn't touch existing bookings for it.
 */
export async function updateStylist(id: number, input: { displayName: string; bio: string; serviceIds: number[] }): Promise<boolean> {
  const [updated] = await sqlTransaction((tx) => [
    tx`UPDATE stylists SET display_name = ${input.displayName}, bio = ${input.bio} WHERE id = ${id} RETURNING id`,
    tx`DELETE FROM stylist_services WHERE stylist_id = ${id} AND service_id <> ALL(${input.serviceIds}::int[])`,
    tx`INSERT INTO stylist_services (stylist_id, service_id)
       SELECT ${id}, service_id FROM unnest(${input.serviceIds}::int[]) AS service_id
       WHERE EXISTS (SELECT 1 FROM stylists WHERE id = ${id})
       ON CONFLICT DO NOTHING`,
  ])
  return (updated?.length ?? 0) > 0
}

/**
 * Takes a stylist off (or back onto) the booking page. Turning one off is
 * REFUSED while they still have upcoming confirmed bookings, checked in the
 * same UPDATE: those clients need a stylist, so move or cancel them first.
 * Returns what happened.
 */
export async function setStylistActive(id: number, active: boolean): Promise<'changed' | 'has_bookings' | 'unchanged'> {
  const rows = await sql`
    UPDATE stylists SET active = ${active}
    WHERE id = ${id} AND active <> ${active}
      AND (${active}::boolean OR NOT EXISTS (
        SELECT 1 FROM bookings b WHERE b.stylist_id = ${id} AND b.status = 'confirmed' AND upper(b.during) > now()))
    RETURNING id`
  if (rows.length > 0) return 'changed'
  if (!active) {
    const busy = await sql`SELECT 1 FROM bookings WHERE stylist_id = ${id} AND status = 'confirmed' AND upper(during) > now() LIMIT 1`
    if (busy.length > 0) return 'has_bookings'
  }
  return 'unchanged'
}
