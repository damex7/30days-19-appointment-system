// THE BOOKING FLOW'S STATE LIVES IN THE URL.
//
//   /book                                   step 1: choose a service
//   /book?service=knotless-braids            step 2: choose a stylist (or "any")
//   …&stylist=3 | &stylist=any               step 3: choose a day
//   …&date=2026-10-21                        step 4: choose a time
//   …&time=10:30                             step 5: confirm
//
// Every choice is a navigation to a new URL, so the BACK button goes back
// one step, a REFRESH keeps every choice, a link can be shared on WhatsApp,
// and the login detour can return to exactly the same step
// (/login?next=/book?service=…&time=10:30).
//
// The URL is only a REQUEST: the page checks each value (does the service
// exist, does this stylist offer it, is the day inside the booking window,
// is that time still open?) and the booking action checks again. Pure
// functions, no server-only imports.
import { z } from 'zod'
import { isLocalDate, isLocalTime, type LocalDate, type LocalTime } from '@/lib/time'

export type BookingChoice = {
  service: string | null
  /** A stylist id, 'any', or null if not chosen yet. */
  stylist: number | 'any' | null
  date: LocalDate | null
  time: LocalTime | null
}

const first = (value: unknown) => (Array.isArray(value) ? value[0] : value)

/** Bad or tampered values become "not chosen", so the flow falls back a step instead of erroring. */
/** One query value: the first if repeated, and anything invalid becomes null ("not chosen"). */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(first, schema.nullable()).catch(null)

/** Bad or tampered values become "not chosen", so the flow falls back a step instead of erroring. */
const choiceSchema = z.object({
  service: optional(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80)),
  stylist: optional(z.union([z.literal('any'), z.coerce.number().int().positive().max(1_000_000)])),
  date: optional(z.string().refine(isLocalDate)),
  time: optional(z.string().refine(isLocalTime)),
})

export function parseChoice(params: Record<string, string | string[] | undefined>): BookingChoice {
  const parsed = choiceSchema.parse(params)
  return {
    service: (parsed.service as string | null | undefined) ?? null,
    stylist: (parsed.stylist as number | 'any' | null | undefined) ?? null,
    date: (parsed.date as string | null | undefined) ?? null,
    time: (parsed.time as string | null | undefined) ?? null,
  }
}

/**
 * The URL for a choice. Changing an earlier step clears the later ones
 * (a new service may not be offered by the chosen stylist, a new day has
 * different times).
 */
export function bookHref(choice: BookingChoice, base = '/book'): string {
  const params = new URLSearchParams()
  if (choice.service) params.set('service', choice.service)
  if (choice.service && choice.stylist !== null) params.set('stylist', String(choice.stylist))
  if (choice.service && choice.stylist !== null && choice.date) params.set('date', choice.date)
  if (choice.service && choice.stylist !== null && choice.date && choice.time) params.set('time', choice.time)
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

/** Step numbers, for the progress indicator. */
export function currentStep(choice: BookingChoice): 1 | 2 | 3 | 4 | 5 {
  if (!choice.service) return 1
  if (choice.stylist === null) return 2
  if (!choice.date) return 3
  if (!choice.time) return 4
  return 5
}

/** The longest note a client can leave with a booking (bookings.client_note CHECK is 500). */
export const NOTE_MAX = 500
