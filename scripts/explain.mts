// npm run db:explain
//
// Prints EXPLAIN ANALYZE for the queries that matter most, twice:
//   1. on the seeded data (a couple of hundred bookings), then
//   2. after adding 50,000 more bookings across 200 extra stylists,
//      inside a transaction that is ROLLED BACK at the end: nothing is
//      kept, but the planner sees a realistically large table.
//
// What to look for in the output:
//   - open_slots for one day: the stylist's bookings come from the GiST
//     index (bookings_stylist_during_idx or the exclusion constraint's own
//     index), not a scan of every booking ever made;
//   - a stylist's week: an index scan on (stylist_id, during);
//   - a client's upcoming bookings: bookings_client_start_idx;
//   - tomorrow's reminders: the small partial index bookings_reminder_due_idx.
//
// Uses only "erasable" TypeScript, so Node runs it without a build step.

import { neonConfig, Pool } from '@neondatabase/serverless'

neonConfig.webSocketConstructor = WebSocket

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const pool = new Pool({ connectionString })
const db = await pool.connect()

const { rows: [ids] } = await db.query(`
  SELECT (SELECT id FROM services WHERE slug = 'haircut-lineup') AS service,
         (SELECT id FROM stylists WHERE display_name = 'Kunle') AS stylist,
         (SELECT id FROM users WHERE email = 'client@example.com') AS client,
         to_char((now() AT TIME ZONE 'Africa/Lagos')::date + 3, 'YYYY-MM-DD') AS day`)
if (!ids?.service || !ids.stylist) {
  console.error('Run `npm run db:seed` first: this uses the seeded services and stylists.')
  process.exit(1)
}

const QUERIES: { title: string; sql: string; params: unknown[] }[] = [
  {
    title: 'Open times for one day, "any stylist" (the time grid on /book)',
    sql: `SELECT o.starts_at, array_agg(o.stylist_id) FROM open_slots($1::int, NULL::int, $2::date) o GROUP BY o.starts_at ORDER BY o.starts_at`,
    params: [ids.service, ids.day],
  },
  {
    title: 'Open times for 31 days (the date strip on /book)',
    sql: `SELECT d::date, count(DISTINCT o.starts_at)
          FROM generate_series($2::date, $2::date + 30, interval '1 day') d
          CROSS JOIN LATERAL open_slots($1::int, NULL::int, d::date) o GROUP BY d`,
    params: [ids.service, ids.day],
  },
  {
    title: "A stylist's bookings in one week (the stylist's week view)",
    sql: `SELECT b.id FROM bookings b
          WHERE b.during && tstzrange(now(), now() + interval '7 days') AND b.stylist_id = $1
          ORDER BY lower(b.during)`,
    params: [ids.stylist],
  },
  {
    title: "A client's bookings, newest first (/appointments)",
    sql: `SELECT b.id FROM bookings b WHERE b.client_id = $1 ORDER BY lower(b.during) DESC LIMIT 200`,
    params: [ids.client],
  },
  {
    title: "Tomorrow's reminders still to send (the cron job, as a SELECT)",
    sql: `SELECT b.id FROM bookings b
          WHERE b.status = 'confirmed' AND b.client_id IS NOT NULL AND b.reminder_sent_at IS NULL
            AND lower(b.during) >= now() + interval '1 day' AND lower(b.during) < now() + interval '2 days'`,
    params: [],
  },
]

async function explainAll(label: string) {
  console.log(`\n${'='.repeat(78)}\n${label}\n${'='.repeat(78)}`)
  for (const q of QUERIES) {
    const { rows } = await db.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, SUMMARY ON) ${q.sql}`, q.params)
    console.log(`\n--- ${q.title}`)
    for (const row of rows) console.log(row['QUERY PLAN'])
  }
}

try {
  const { rows: [{ count }] } = await db.query(`SELECT count(*)::int AS count FROM bookings`)
  await explainAll(`1. Seeded data: ${count} bookings`)

  await db.query('BEGIN')
  // 200 extra stylists, each with 250 past bookings one after another (so
  // no two overlap and the exclusion constraint accepts them): 50,000 rows.
  await db.query(`
    WITH new_users AS (
      INSERT INTO users (email, name, password_hash, role)
      SELECT 'explain-' || g || '@example.invalid', 'Explain ' || g, '$argon2id$explain', 'stylist'
      FROM generate_series(1, 200) g
      RETURNING id
    ),
    new_stylists AS (
      INSERT INTO stylists (user_id, display_name) SELECT id, 'Explain' FROM new_users RETURNING id
    )
    INSERT INTO bookings (client_id, stylist_id, service_id, booked_by, during, duration_minutes, price_kobo, status)
    SELECT $1, s.id, $2, $1,
           tstzrange(now() - interval '400 days' + make_interval(hours => n * 2),
                     now() - interval '400 days' + make_interval(hours => n * 2 + 1), '[)'),
           45, 700000, 'completed'
    FROM new_stylists s, generate_series(1, 250) n`, [ids.client, ids.service])
  // Fresh statistics, so the planner knows the table is now big.
  await db.query('ANALYZE bookings')
  const { rows: [{ count: big }] } = await db.query(`SELECT count(*)::int AS count FROM bookings`)
  await explainAll(`2. After adding 50,000 bookings (rolled back afterwards): ${big} bookings`)
} finally {
  await db.query('ROLLBACK').catch(() => {})
  db.release()
  await pool.end()
}
