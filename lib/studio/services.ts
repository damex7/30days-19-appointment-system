// SERVICE QUERIES: the studio's menu.
//
// The public menu is CACHED (tag 'menu'): the home page and the first
// step of /book are the same for everyone and change only when an admin
// edits a service, stylist or hours, and those actions call
// updateTag('menu'). Admin lists are never cached.
import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { isReferencedError } from '@/lib/db-errors'
import { parseRows } from '@/lib/rows'
import { CATEGORIES } from './categories'

export const MENU_TAG = 'menu'

const ServiceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  category: z.enum(CATEGORIES),
  description: z.string(),
  durationMinutes: z.number().int(),
  bufferMinutes: z.number().int(),
  // bigint arrives from the driver as a string (it could exceed 2^53);
  // prices never get near that, so turn it into a checked number.
  priceKobo: z.coerce.number().int().refine(Number.isSafeInteger),
  archivedAt: z.date().nullable(),
})
export type Service = z.infer<typeof ServiceSchema>

const serviceColumns = () => sql`
  s.id, s.name, s.slug, s.category, s.description,
  s.duration_minutes AS "durationMinutes", s.buffer_minutes AS "bufferMinutes",
  s.price_kobo AS "priceKobo", s.archived_at AS "archivedAt"`

/**
 * The live menu: unarchived services that at least one active stylist
 * offers (a service nobody can do would only lead to "no open times").
 * Uses the partial index services_menu_idx.
 */
export async function listMenu(): Promise<Service[]> {
  'use cache'
  cacheTag(MENU_TAG)
  cacheLife('hours')
  const rows = await sql`
    SELECT ${serviceColumns()}
    FROM services s
    WHERE s.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM stylist_services ss JOIN stylists st ON st.id = ss.stylist_id
                  WHERE ss.service_id = s.id AND st.active)
    ORDER BY s.category, s.name`
  return parseRows(ServiceSchema, rows, 'listMenu')
}

const AdminServiceSchema = ServiceSchema.extend({
  stylistCount: z.number().int(),
  upcomingCount: z.number().int(),
  bookingCount: z.number().int(),
})
export type AdminService = z.infer<typeof AdminServiceSchema>

/** Every service for /admin/services, archived ones last, with how much it's used. */
export async function listServicesForAdmin(): Promise<AdminService[]> {
  const rows = await sql`
    SELECT ${serviceColumns()},
           (SELECT count(*)::int FROM stylist_services ss WHERE ss.service_id = s.id) AS "stylistCount",
           (SELECT count(*)::int FROM bookings b
            WHERE b.service_id = s.id AND b.status = 'confirmed' AND lower(b.during) > now()) AS "upcomingCount",
           (SELECT count(*)::int FROM bookings b WHERE b.service_id = s.id) AS "bookingCount"
    FROM services s
    ORDER BY s.archived_at IS NOT NULL, s.category, s.name`
  return parseRows(AdminServiceSchema, rows, 'listServicesForAdmin')
}

export async function getServiceById(id: number): Promise<Service | null> {
  const rows = await sql`SELECT ${serviceColumns()} FROM services s WHERE s.id = ${id}`
  return parseRows(ServiceSchema, rows, 'getServiceById')[0] ?? null
}

export type ServiceInput = {
  name: string
  slug: string
  category: (typeof CATEGORIES)[number]
  description: string
  durationMinutes: number
  bufferMinutes: number
  priceKobo: number
}

/** Returns the new id. A taken slug throws 23505 (services_slug_key), which the action explains. */
export async function createService(input: ServiceInput): Promise<number> {
  const rows = await sql`
    INSERT INTO services (name, slug, category, description, duration_minutes, buffer_minutes, price_kobo)
    VALUES (${input.name}, ${input.slug}, ${input.category}, ${input.description},
            ${input.durationMinutes}, ${input.bufferMinutes}, ${input.priceKobo})
    RETURNING id`
  return Number(rows[0]?.id)
}

/**
 * Changing a service never touches existing bookings: they copied the
 * price and duration when they were made (bookings.price_kobo,
 * bookings.duration_minutes), so a client keeps what they agreed to.
 */
export async function updateService(id: number, input: ServiceInput): Promise<boolean> {
  const rows = await sql`
    UPDATE services SET
      name = ${input.name}, slug = ${input.slug}, category = ${input.category}, description = ${input.description},
      duration_minutes = ${input.durationMinutes}, buffer_minutes = ${input.bufferMinutes}, price_kobo = ${input.priceKobo}
    WHERE id = ${id}
    RETURNING id`
  return rows.length > 0
}

/** Archive (off the menu, kept on old bookings) or restore. */
export async function setServiceArchived(id: number, archived: boolean): Promise<boolean> {
  const rows = await sql`
    UPDATE services SET archived_at = CASE WHEN ${archived}::boolean THEN now() ELSE NULL END
    WHERE id = ${id} AND (archived_at IS NOT NULL) <> ${archived}::boolean
    RETURNING id`
  return rows.length > 0
}

/**
 * Deletes a service that has NEVER been booked. If any booking points at
 * it, ON DELETE RESTRICT refuses (23001) and we return 'in_use' so the page
 * can offer "Archive instead". The database decides, so a booking made a
 * second before the delete still wins.
 */
export async function deleteService(id: number): Promise<'deleted' | 'in_use' | 'not_found'> {
  try {
    const rows = await sql`DELETE FROM services WHERE id = ${id} RETURNING id`
    return rows.length > 0 ? 'deleted' : 'not_found'
  } catch (error) {
    if (isReferencedError(error)) return 'in_use'
    throw error
  }
}
