// npm run db:seed
//
// Fills the database with a believable studio: Ìpàdé Hair & Beauty in
// Lekki Phase 1, Lagos. It creates:
//   - the studio settings (address, WhatsApp number);
//   - 13 services across the five categories, with realistic Lagos prices
//     and durations (knotless braids 4 hours, barbing 45 minutes);
//   - 4 stylists with different working days and a lunch break, and the
//     services each offers;
//   - some time off, and the Nigerian public holidays of the coming months;
//   - an admin, the stylists and five clients, all with confirmed emails:
//       admin@example.com    password from SEED_ADMIN_PASSWORD
//       stylist@example.com  (Funmi; the other stylists are
//                            kunle@, ijeoma@ and bisi@example.com)
//                            password from SEED_STYLIST_PASSWORD
//       client@example.com   (and four more clients)
//                            password from SEED_CLIENT_PASSWORD
//   - bookings spread over the past two weeks and the next two, so every
//     view has something to show.
//
// The passwords come from environment variables (.env.local), never from
// this file: a password committed to git is public forever.
//
// SAFE TO RUN TWICE: rows are inserted with ON CONFLICT DO NOTHING (or "if
// not there yet"), the settings are only filled in while they still hold
// the placeholder from migration 007, and bookings are only generated
// into an EMPTY bookings table. A second run changes nothing.
//
// Bookings are generated in JavaScript in local studio time (dates and
// "HH:MM"), and PostgreSQL turns them into instants with AT TIME ZONE, the
// same conversion open_slots() uses. Each stylist's day is filled block by
// block, so seeded bookings never overlap and always sit inside working
// hours (the exclusion constraint would refuse them otherwise).
//
// Run `npm run db:migrate` first. Uses only "erasable" TypeScript, so Node
// runs it without a build step.

import { hash } from '@node-rs/argon2'
import { neonConfig, Pool } from '@neondatabase/serverless'

neonConfig.webSocketConstructor = WebSocket

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string.')
  process.exit(1)
}

// The same argon2id settings as lib/auth/password.ts (that file is
// server-only, so scripts repeat them).
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 }

const PASSWORD_VARS = ['SEED_ADMIN_PASSWORD', 'SEED_STYLIST_PASSWORD', 'SEED_CLIENT_PASSWORD'] as const
for (const name of PASSWORD_VARS) {
  const value = process.env[name]
  if (!value || value.length < 8 || value.length > 128) {
    console.error(`${name} must be set to a password of 8 to 128 characters (in .env.local).`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// The data
// ---------------------------------------------------------------------------

const STUDIO = {
  name: 'Ìpàdé Hair & Beauty',
  // A fictional number in the 0700 000 0xxx range, not given to real subscribers.
  whatsapp: '+2347000000190',
  address: '14 Admiralty Way, Lekki Phase 1, Lagos',
}

type Category = 'braids' | 'barbing' | 'nails' | 'makeup' | 'hair_care'
type SeedService = { slug: string; name: string; category: Category; minutes: number; buffer: number; naira: number; description: string }

const SERVICES: SeedService[] = [
  { slug: 'knotless-braids', name: 'Knotless braids (mid-back)', category: 'braids', minutes: 240, buffer: 15, naira: 45_000, description: 'Medium knotless braids to mid-back. Extensions (1b or 99J) included.' },
  { slug: 'cornrows', name: 'Cornrows (straight back)', category: 'braids', minutes: 90, buffer: 15, naira: 12_000, description: 'Neat straight-back cornrows, with or without extensions.' },
  { slug: 'passion-twists', name: 'Passion twists', category: 'braids', minutes: 210, buffer: 15, naira: 38_000, description: 'Soft, bohemian twists, shoulder to mid-back.' },
  { slug: 'haircut-lineup', name: 'Haircut and line-up', category: 'barbing', minutes: 45, buffer: 15, naira: 7_000, description: 'Clipper cut, sharp line-up and a hot towel.' },
  { slug: 'fade-beard', name: 'Fade with beard shaping', category: 'barbing', minutes: 60, buffer: 15, naira: 10_000, description: 'Skin or low fade, beard trimmed and shaped.' },
  { slug: 'kids-cut', name: 'Kids’ haircut', category: 'barbing', minutes: 30, buffer: 10, naira: 4_500, description: 'For under-12s. Patience included.' },
  { slug: 'gel-manicure', name: 'Gel manicure', category: 'nails', minutes: 60, buffer: 15, naira: 12_000, description: 'Shape, cuticle care and a gel colour that lasts two to three weeks.' },
  { slug: 'acrylic-full-set', name: 'Acrylic full set', category: 'nails', minutes: 120, buffer: 15, naira: 22_000, description: 'Full set of acrylic extensions in your choice of shape and length.' },
  { slug: 'spa-pedicure', name: 'Spa pedicure', category: 'nails', minutes: 60, buffer: 15, naira: 10_000, description: 'Soak, scrub, massage and polish.' },
  { slug: 'soft-glam', name: 'Soft glam makeup', category: 'makeup', minutes: 90, buffer: 15, naira: 25_000, description: 'Lashes included. Great for parties and photos.' },
  { slug: 'bridal-makeup', name: 'Bridal makeup', category: 'makeup', minutes: 150, buffer: 30, naira: 85_000, description: 'Full bridal look with a consultation on the day.' },
  { slug: 'wash-deep-condition', name: 'Wash and deep conditioning', category: 'hair_care', minutes: 60, buffer: 15, naira: 9_000, description: 'For natural or relaxed hair, finished with a blow-dry.' },
  { slug: 'silk-press', name: 'Silk press', category: 'hair_care', minutes: 120, buffer: 15, naira: 20_000, description: 'Wash, treatment and a sleek, bouncy press on natural hair.' },
]

// day_of_week: 0 = Sunday … 6 = Saturday. Every stylist has a lunch break,
// which is just two blocks with a gap between them.
type SeedStylist = {
  email: string
  name: string
  displayName: string
  bio: string
  services: string[]
  hours: { days: number[]; blocks: [string, string][] }[]
}

const STYLISTS: SeedStylist[] = [
  {
    email: 'stylist@example.com',
    name: 'Funmilayo Adebayo',
    displayName: 'Funmi',
    bio: 'Braids specialist for twelve years. Known for knotless braids that last.',
    services: ['knotless-braids', 'cornrows', 'passion-twists', 'wash-deep-condition', 'silk-press'],
    hours: [{ days: [2, 3, 4, 5, 6], blocks: [['09:00', '13:00'], ['14:00', '18:00']] }],
  },
  {
    email: 'kunle@example.com',
    name: 'Kunle Ajayi',
    displayName: 'Kunle',
    bio: 'Barber. Clean fades, sharp line-ups, and he’s good with nervous kids.',
    services: ['haircut-lineup', 'fade-beard', 'kids-cut'],
    hours: [{ days: [1, 2, 3, 4, 5, 6], blocks: [['10:00', '14:00'], ['15:00', '19:00']] }],
  },
  {
    email: 'ijeoma@example.com',
    name: 'Ijeoma Okeke',
    displayName: 'Ijeoma',
    bio: 'Nail technician. Gel, acrylics and very calm pedicures.',
    services: ['gel-manicure', 'acrylic-full-set', 'spa-pedicure'],
    hours: [{ days: [2, 3, 4, 5, 6], blocks: [['10:00', '13:30'], ['14:30', '18:00']] }],
  },
  {
    email: 'bisi@example.com',
    name: 'Bisola Lawal',
    displayName: 'Bisi',
    bio: 'Makeup artist and braider. Weekend bridal bookings fill up fast.',
    services: ['soft-glam', 'bridal-makeup', 'cornrows', 'wash-deep-condition'],
    hours: [
      { days: [3, 4, 5, 6], blocks: [['08:00', '12:00'], ['12:45', '16:00']] },
      // Sundays after church.
      { days: [0], blocks: [['13:00', '18:00']] },
    ],
  },
]

const CLIENTS = [
  { email: 'client@example.com', name: 'Tolulope Bankole', phone: '+2347000000201' },
  { email: 'amaka@example.com', name: 'Amaka Eze', phone: '+2347000000202' },
  { email: 'seun@example.com', name: 'Seun Oladipo', phone: null },
  { email: 'zainab@example.com', name: 'Zainab Musa', phone: '+2347000000204' },
  { email: 'chidi@example.com', name: 'Chidi Obi', phone: '+2347000000205' },
]
const WALK_INS = [
  { name: 'Mrs Okonkwo (walk-in)', phone: '+2347000000301' },
  { name: 'Damilola (phone booking)', phone: null },
]

// Public holidays in the coming months. Islamic holidays depend on the
// moon sighting, so their dates are the expected ones.
const CLOSURES: [string, string][] = [
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Boxing Day'],
  ['2027-01-01', 'New Year’s Day'],
  ['2027-03-10', 'Eid el-Fitr (expected)'],
  ['2027-03-11', 'Eid el-Fitr holiday (expected)'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-29', 'Easter Monday'],
  ['2027-05-01', 'Workers’ Day'],
  ['2027-05-17', 'Eid el-Kabir (expected)'],
  ['2027-06-12', 'Democracy Day'],
]

// ---------------------------------------------------------------------------
// A small seeded random-number generator (mulberry32), so every run of a
// fresh database produces the same schedule.
// ---------------------------------------------------------------------------
let state = 19_2026
function random(): number {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const dayOfWeek = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString })
const db = await pool.connect()

try {
  const [adminHash = '', stylistHash = '', clientHash = ''] = await Promise.all(PASSWORD_VARS.map((name) => hash(process.env[name] as string, ARGON2_OPTIONS)))

  await db.query('BEGIN')

  // Settings: only while they still hold migration 007's placeholder.
  await db.query(
    `UPDATE settings SET studio_name = $1, whatsapp_number = $2, address = $3 WHERE whatsapp_number = '+2348000000000'`,
    [STUDIO.name, STUDIO.whatsapp, STUDIO.address],
  )

  // Accounts. ON CONFLICT DO NOTHING: an existing account (and a password
  // someone has since changed) is left alone.
  const addUser = (email: string, name: string, role: string, passwordHash: string, phone: string | null = null) =>
    db.query(
      `INSERT INTO users (email, name, role, password_hash, phone, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (email) DO NOTHING`,
      [email, name, role, passwordHash, phone],
    )
  await addUser('admin@example.com', 'Adaeze Nwankwo', 'admin', adminHash)
  for (const s of STYLISTS) await addUser(s.email, s.name, 'stylist', stylistHash)
  for (const c of CLIENTS) await addUser(c.email, c.name, 'client', clientHash, c.phone)

  // Services, keyed by slug.
  for (const s of SERVICES) {
    await db.query(
      `INSERT INTO services (slug, name, category, description, duration_minutes, buffer_minutes, price_kobo)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (slug) DO NOTHING`,
      [s.slug, s.name, s.category, s.description, s.minutes, s.buffer, s.naira * 100],
    )
  }

  // Stylists, their services and their hours. Hours are only added for a
  // stylist who has none yet, so re-running doesn't trip the no-overlap rule.
  for (const s of STYLISTS) {
    await db.query(
      `INSERT INTO stylists (user_id, display_name, bio)
       SELECT id, $2, $3 FROM users WHERE email = $1 ON CONFLICT (user_id) DO NOTHING`,
      [s.email, s.displayName, s.bio],
    )
    await db.query(
      `INSERT INTO stylist_services (stylist_id, service_id)
       SELECT st.id, sv.id FROM stylists st JOIN users u ON u.id = st.user_id, services sv
       WHERE u.email = $1 AND sv.slug = ANY($2::text[]) ON CONFLICT DO NOTHING`,
      [s.email, s.services],
    )
    const rows = s.hours.flatMap((h) => h.days.flatMap((day) => h.blocks.map(([start, end]) => ({ day, start, end }))))
    await db.query(
      `INSERT INTO working_hours (stylist_id, day_of_week, start_time, end_time)
       SELECT st.id, r.day, r.start::time, r."end"::time
       FROM stylists st JOIN users u ON u.id = st.user_id,
            jsonb_to_recordset($2::jsonb) AS r(day int, start text, "end" text)
       WHERE u.email = $1 AND NOT EXISTS (SELECT 1 FROM working_hours w WHERE w.stylist_id = st.id)`,
      [s.email, JSON.stringify(rows)],
    )
  }

  for (const [date, name] of CLOSURES) {
    await db.query(`INSERT INTO closures (closed_on, name) VALUES ($1, $2) ON CONFLICT (closed_on) DO NOTHING`, [date, name])
  }

  // The studio's "today", from the database, in the studio's zone.
  const { rows: [{ today, tz }] } = await db.query(
    `SELECT to_char((now() AT TIME ZONE time_zone)::date, 'YYYY-MM-DD') AS today, time_zone AS tz FROM settings`,
  )

  // Time off (only into an empty table): Ijeoma takes next Thursday off for a
  // course, and Kunle has a two-hour appointment on Saturday afternoon.
  const { rows: [{ count: timeOffCount }] } = await db.query(`SELECT count(*)::int AS count FROM time_off`)
  if (timeOffCount === 0) {
    const nextThursday = addDays(today, ((4 - dayOfWeek(today) + 7) % 7) + 7)
    const nextSaturday = addDays(today, ((6 - dayOfWeek(today) + 7) % 7) || 7)
    const timeOff = [
      { email: 'ijeoma@example.com', from: [nextThursday, '00:00'], to: [addDays(nextThursday, 1), '00:00'], reason: 'Nail art course' },
      { email: 'kunle@example.com', from: [nextSaturday, '15:00'], to: [nextSaturday, '17:00'], reason: 'Family event' },
    ]
    for (const t of timeOff) {
      await db.query(
        `INSERT INTO time_off (stylist_id, during, reason)
         SELECT st.id, tstzrange(($2::date + $3::time) AT TIME ZONE $6, ($4::date + $5::time) AT TIME ZONE $6, '[)'), $7
         FROM stylists st JOIN users u ON u.id = st.user_id WHERE u.email = $1`,
        [t.email, t.from[0], t.from[1], t.to[0], t.to[1], tz, t.reason],
      )
    }
  }

  // Bookings: only into an empty table.
  const { rows: [{ count: bookingCount }] } = await db.query(`SELECT count(*)::int AS count FROM bookings`)
  if (bookingCount > 0) {
    console.log(`Bookings already exist (${bookingCount}); leaving them alone.`)
  } else {
    const { rows: ids } = await db.query(`
      SELECT u.email, u.id AS user_id, st.id AS stylist_id FROM users u LEFT JOIN stylists st ON st.user_id = u.id`)
    const userId = (email: string) => ids.find((r) => r.email === email)?.user_id as string
    const stylistId = (email: string) => ids.find((r) => r.email === email)?.stylist_id as number
    const { rows: serviceRows } = await db.query(`SELECT id, slug FROM services`)
    const serviceId = (slug: string) => serviceRows.find((r) => r.slug === slug)?.id as number
    const { rows: closed } = await db.query(`SELECT to_char(closed_on, 'YYYY-MM-DD') AS d FROM closures`)
    const closedDays = new Set(closed.map((r) => r.d as string))
    const { rows: off } = await db.query(`
      SELECT st.id AS stylist_id, to_char(lower(t.during) AT TIME ZONE $1, 'YYYY-MM-DD') AS d FROM time_off t JOIN stylists st ON st.id = t.stylist_id`, [tz])
    const offDays = new Set(off.map((r) => `${r.stylist_id}:${r.d}`))

    const adminId = userId('admin@example.com')
    type Row = {
      client_id: string | null; walk_in_name: string | null; walk_in_phone: string | null
      stylist_id: number; service_id: number; booked_by: string
      day: string; start: string; minutes: number; buffer: number; kobo: number
      outcome: 'show' | 'no_show' | 'cancel'; note: string; cancel_reason: string | null
    }
    const bookings: Row[] = []

    for (const stylist of STYLISTS) {
      const sid = stylistId(stylist.email)
      const offered = SERVICES.filter((s) => stylist.services.includes(s.slug))
      for (let offset = -14; offset <= 14; offset++) {
        const day = addDays(today, offset)
        if (closedDays.has(day) || offDays.has(`${sid}:${day}`)) continue
        const blocks = stylist.hours.filter((h) => h.days.includes(dayOfWeek(day))).flatMap((h) => h.blocks)
        // Busier in the past (a full history), lighter ahead (room to book).
        const fill = offset < 0 ? 0.6 : offset === 0 ? 0.55 : 0.4
        for (const [blockStart, blockEnd] of blocks) {
          let cursor = toMinutes(blockStart)
          const end = toMinutes(blockEnd)
          while (cursor < end) {
            const service = pick(offered)
            const total = service.minutes + service.buffer
            if (cursor + total > end) break
            if (random() < fill) {
              const isWalkIn = random() < 0.12
              const client = offset >= 0 && stylist.email === 'stylist@example.com' && bookings.every((b) => b.client_id !== userId('client@example.com') || b.day < today)
                ? CLIENTS[0]! // make sure the demo client has an upcoming booking with the demo stylist
                : pick(CLIENTS)
              const walkIn = pick(WALK_INS)
              // What happens to it. Whether it has already ENDED is decided
              // in SQL against now(), after the local time becomes an instant.
              const outcome = random() < 0.07 ? 'cancel' : random() < 0.08 ? 'no_show' : 'show'
              const cancelReason = outcome === 'cancel' ? pick(['Traffic on the Lekki–Epe expressway', 'Something came up at work', 'Feeling unwell', '']) : null
              bookings.push({
                client_id: isWalkIn ? null : userId(client.email),
                walk_in_name: isWalkIn ? walkIn.name : null,
                walk_in_phone: isWalkIn ? walkIn.phone : null,
                stylist_id: sid,
                service_id: serviceId(service.slug),
                booked_by: isWalkIn ? adminId : userId(client.email),
                day,
                start: toTime(cursor),
                minutes: service.minutes,
                buffer: service.buffer,
                kobo: service.naira * 100,
                outcome,
                note: random() < 0.2 ? pick(['Please use 99J extensions.', 'I’m tender-headed, please be gentle.', 'Running from work, might be 5 minutes late.', 'Same style as last time.']) : '',
                cancel_reason: cancelReason,
              })
              cursor += total
            } else {
              // Leave a gap of 30-90 minutes.
              cursor += 30 * (1 + Math.floor(random() * 3))
            }
          }
        }
      }
    }

    // One INSERT for all bookings and one for their history. Times are
    // converted from studio-local to instants by PostgreSQL (AT TIME ZONE).
    // Cancelled bookings are given cancellation details so the CHECK holds.
    const inserted = await db.query(
      `WITH parsed AS (
         SELECT r.*, (r.day::date + r.start::time) AT TIME ZONE $2 AS starts_at
         FROM jsonb_to_recordset($1::jsonb) AS r(
           client_id uuid, walk_in_name text, walk_in_phone text, stylist_id int, service_id int, booked_by uuid,
           day text, start text, minutes int, buffer int, kobo bigint, outcome text, note text, cancel_reason text)
       ),
       input AS (
         SELECT parsed.*,
                CASE WHEN outcome = 'cancel' THEN 'cancelled'
                     WHEN starts_at + make_interval(mins => minutes + buffer) > now() THEN 'confirmed'
                     WHEN outcome = 'no_show' THEN 'no_show'
                     ELSE 'completed' END AS status
         FROM parsed
       )
       INSERT INTO bookings (client_id, walk_in_name, walk_in_phone, stylist_id, service_id, booked_by, during,
                             duration_minutes, price_kobo, status, client_note,
                             cancelled_at, cancelled_by, cancel_reason, reminder_sent_at, created_at)
       SELECT client_id, walk_in_name, walk_in_phone, stylist_id, service_id, booked_by,
              tstzrange(starts_at, starts_at + make_interval(mins => minutes + buffer), '[)'),
              minutes, kobo, status, note,
              CASE WHEN status = 'cancelled' THEN LEAST(starts_at - interval '1 day', now() - interval '30 minutes') END,
              CASE WHEN status = 'cancelled' THEN booked_by END,
              CASE WHEN status = 'cancelled' THEN NULLIF(cancel_reason, '') END,
              -- Past bookings were reminded the day before.
              CASE WHEN starts_at < now() AND client_id IS NOT NULL THEN starts_at - interval '18 hours' END,
              LEAST(starts_at - interval '3 days', now() - interval '1 hour')
       FROM input
       RETURNING id, status, during, booked_by, cancelled_at, created_at`,
      [JSON.stringify(bookings), tz],
    )

    // The history: 'created' for every booking, then what happened to it.
    await db.query(
      `INSERT INTO booking_events (booking_id, type, actor_id, to_during, created_at)
       SELECT id, 'created', booked_by, during, created_at FROM bookings`,
    )
    await db.query(
      `INSERT INTO booking_events (booking_id, type, actor_id, created_at)
       SELECT b.id, b.status, CASE WHEN b.status = 'cancelled' THEN b.cancelled_by ELSE st.user_id END,
              CASE WHEN b.status = 'cancelled' THEN b.cancelled_at ELSE upper(b.during) END
       FROM bookings b JOIN stylists st ON st.id = b.stylist_id
       WHERE b.status <> 'confirmed'`,
    )
    console.log(`Generated ${inserted.rowCount} bookings from ${addDays(today, -14)} to ${addDays(today, 14)}.`)
  }

  await db.query('COMMIT')
  console.log('Seed complete. Sign in as admin@example.com, stylist@example.com or client@example.com with the passwords in .env.local.')
} catch (error) {
  await db.query('ROLLBACK')
  throw error
} finally {
  db.release()
  await pool.end()
}
