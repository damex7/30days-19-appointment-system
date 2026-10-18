// INPUT RULES FOR THE ADMIN FORMS. Every value is checked here before it
// reaches SQL, and the types come from z.infer. The database's CHECK
// constraints say the same things again (db/migrations/007-010), so a
// mistake here can never store a bad row; these give the friendly message.
// Not server-only: forms read the limits for maxLength and hints.
import { z } from 'zod'
import { parseNaira } from '@/lib/money'
import { normalizeNigerianPhone } from '@/lib/phone'
import { isLocalDate, isLocalTime } from '@/lib/time'
import { CATEGORIES } from './categories'

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}`)
    .max(max, `Use ${max} characters or fewer`)

const minutes = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `Enter ${label} in minutes` })
    .int(`Use whole minutes`)
    .min(min, `${label[0]?.toUpperCase()}${label.slice(1)} must be at least ${min} minutes`)
    .max(max, `${label[0]?.toUpperCase()}${label.slice(1)} can be at most ${max} minutes`)
    .refine((n) => n % 5 === 0, 'Use a multiple of 5 minutes')

/** "15,000" or "₦15,000.50" → kobo, as an exact whole number (lib/money.ts). */
const naira = z.string().transform((value, ctx) => {
  const kobo = parseNaira(value)
  if (kobo === null) {
    ctx.addIssue({ code: 'custom', message: 'Enter a price like 15000 or 15,000.00' })
    return z.NEVER
  }
  return kobo
})

export const serviceSchema = z.object({
  name: text('a name', 80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and single hyphens, like knotless-braids')
    .max(80),
  category: z.enum(CATEGORIES, { error: 'Choose a category' }),
  description: z.string().trim().max(500, 'Use 500 characters or fewer'),
  durationMinutes: minutes('the duration', 5, 720),
  bufferMinutes: minutes('the clean-up time', 0, 120),
  priceKobo: naira,
})
export type ServiceForm = z.infer<typeof serviceSchema>

export const ID = z.coerce.number().int().positive().max(2_147_483_647)

export const stylistProfileSchema = z.object({
  displayName: text('the name clients see', 60),
  bio: z.string().trim().max(500, 'Use 500 characters or fewer'),
  serviceIds: z.array(ID).max(100),
})

export const newStylistSchema = stylistProfileSchema.extend({
  name: text('their full name', 100),
  email: z.string().trim().max(254).pipe(z.email('Enter an email address like funmi@example.com')),
})

/** One weekday's blocks: up to three start/end pairs; an empty pair is "no block". */
export const dayHoursSchema = z
  .object({
    stylistId: ID,
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    blocks: z
      .array(
        z.object({
          start: z.string().refine(isLocalTime, 'Use a time like 09:00'),
          end: z.string().refine(isLocalTime, 'Use a time like 18:00'),
        }),
      )
      .max(3),
  })
  .superRefine((value, ctx) => {
    value.blocks.forEach((block, i) => {
      if (block.start >= block.end) ctx.addIssue({ code: 'custom', path: ['blocks', i], message: 'Each block must end after it starts' })
    })
  })

export const closureSchema = z.object({
  closedOn: z.string().refine(isLocalDate, 'Choose a date'),
  name: text('a name, like Christmas Day', 100),
})

export const settingsSchema = z.object({
  studioName: text('the studio name', 100),
  timeZone: z.string().refine((zone) => Intl.supportedValuesOf('timeZone').includes(zone) || zone === 'UTC', 'Choose a time zone from the list'),
  slotStepMinutes: z.coerce.number().refine((n) => [5, 10, 15, 20, 30, 60].includes(n), 'Choose a step'),
  minNoticeHours: z.coerce.number().int().min(0, 'Use 0 to 168 hours').max(168, 'Use 0 to 168 hours'),
  bookingWindowDays: z.coerce.number().int().min(1, 'Use 1 to 365 days').max(365, 'Use 1 to 365 days'),
  cancellationCutoffHours: z.coerce.number().int().min(0, 'Use 0 to 168 hours').max(168, 'Use 0 to 168 hours'),
  whatsappNumber: z.string().transform((value, ctx) => {
    const phone = normalizeNigerianPhone(value)
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian mobile number like 0803 123 4567' })
      return z.NEVER
    }
    return phone
  }),
  address: text('the address', 300),
})

/** /admin/bookings filters, from the URL: bad values fall back to "no filter". */
export const bookingFiltersSchema = z.object({
  stylist: ID.nullable().catch(null).optional(),
  service: ID.nullable().catch(null).optional(),
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).nullable().catch(null).optional(),
  from: z.string().refine(isLocalDate).nullable().catch(null).optional(),
  to: z.string().refine(isLocalDate).nullable().catch(null).optional(),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).optional(),
})
