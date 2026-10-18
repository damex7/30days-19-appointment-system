-- 012: a small fix to open_slots(), found with `npm run db:explain`.
--
-- In 011 the weekday test was `wh.day_of_week = EXTRACT(DOW FROM p_day)`.
-- EXTRACT returns NUMERIC, so PostgreSQL cast every row's smallint
-- day_of_week to numeric to compare them. The plan showed it as a Filter
-- that read all of a stylist's working-hours rows and threw most away
-- ("Rows Removed by Filter: 10"), instead of an Index Cond. Casting the
-- one computed value to smallint instead lets the index on
-- (stylist_id, day_of_week, timerange) answer it directly.
--
-- Applied migrations are history, so the fix is a NEW file that replaces
-- the function (CREATE OR REPLACE keeps its name, arguments and callers),
-- not an edit to 011. Nothing else in the function changes.

CREATE OR REPLACE FUNCTION open_slots(
  p_service_id        integer,
  -- NULL = every active stylist who offers the service ("any stylist").
  p_stylist_id        integer,
  -- A LOCAL calendar date in the studio's zone, e.g. '2026-10-21'.
  p_day               date,
  -- When rescheduling, the booking being moved must not block itself.
  p_ignore_booking_id integer DEFAULT NULL,
  -- An admin booking a walk-in at the desk skips the minimum notice and
  -- the booking window (but still can't book in the past).
  p_staff             boolean DEFAULT false
)
RETURNS TABLE (stylist_id integer, starts_at timestamptz)
-- STABLE: reads tables and now(), changes nothing, and gives the same answer
-- for the same arguments within one statement. A single-SELECT SQL function
-- like this can be INLINED by the planner into the calling query, so
-- EXPLAIN shows (and optimises) the real plan.
LANGUAGE sql STABLE
AS $$
  WITH studio AS (
    SELECT
      s.time_zone,
      make_interval(mins => s.slot_step_minutes) AS step,
      -- Local midnight at the start and end of D, as real instants. In a
      -- zone with daylight saving a "day" can be 23 or 25 hours long; this
      -- gets that right because AT TIME ZONE asks the tz database.
      (p_day::timestamp AT TIME ZONE s.time_zone) AS day_start,
      ((p_day + 1)::timestamp AT TIME ZONE s.time_zone) AS day_end,
      -- The earliest and latest moments a booking may occupy.
      CASE WHEN p_staff THEN now()
           ELSE now() + make_interval(hours => s.min_notice_hours) END AS earliest,
      CASE WHEN p_staff THEN 'infinity'::timestamptz
           -- "Book up to 30 days ahead" = up to the END of the 30th local day.
           ELSE (((now() AT TIME ZONE s.time_zone)::date + s.booking_window_days + 1)::timestamp AT TIME ZONE s.time_zone) END AS latest
    FROM settings s
  ),
  service AS (
    -- Archived services can't be booked.
    SELECT make_interval(mins => sv.duration_minutes + sv.buffer_minutes) AS total
    FROM services sv
    WHERE sv.id = p_service_id AND sv.archived_at IS NULL
  ),
  pool AS (
    -- Active stylists who offer this service (all of them, or the one asked
    -- for), unless the whole studio is closed that day.
    SELECT st.id
    FROM stylists st
    JOIN stylist_services ss ON ss.stylist_id = st.id AND ss.service_id = p_service_id
    WHERE st.active
      AND (p_stylist_id IS NULL OR st.id = p_stylist_id)
      AND NOT EXISTS (SELECT 1 FROM closures c WHERE c.closed_on = p_day)
  ),
  work AS (
    -- Working hours on D's weekday, as ONE multirange per stylist (a lunch
    -- break makes it two pieces). "D + 09:00" is a local wall-clock
    -- timestamp; AT TIME ZONE turns it into the real instant in the zone.
    SELECT wh.stylist_id,
           range_agg(tstzrange((p_day + wh.start_time) AT TIME ZONE studio.time_zone,
                               (p_day + wh.end_time) AT TIME ZONE studio.time_zone)) AS hours
    FROM working_hours wh
    JOIN pool ON pool.id = wh.stylist_id
    CROSS JOIN studio
    -- EXTRACT returns numeric; cast it, so the comparison is smallint =
    -- smallint and can use the working_hours_no_overlap index (see 012).
    WHERE wh.day_of_week = EXTRACT(DOW FROM p_day)::smallint
    GROUP BY wh.stylist_id
  ),
  free AS (
    SELECT
      work.stylist_id,
      (
        work.hours
        - COALESCE((SELECT range_agg(t.during) FROM time_off t
                    WHERE t.stylist_id = work.stylist_id
                      AND t.during && tstzrange(studio.day_start, studio.day_end)), '{}')
        - COALESCE((SELECT range_agg(b.during) FROM bookings b
                    WHERE b.stylist_id = work.stylist_id
                      AND b.status = 'confirmed'
                      AND b.during && tstzrange(studio.day_start, studio.day_end)
                      AND b.id IS DISTINCT FROM p_ignore_booking_id), '{}')
      )
      -- ∩ the allowed window (multirange * multirange is intersection).
      * tstzmultirange(tstzrange(studio.earliest, studio.latest)) AS free_time
    FROM work
    CROSS JOIN studio
  ),
  pieces AS (
    -- One row per separate piece of free time.
    SELECT free.stylist_id, unnest(free.free_time) AS piece
    FROM free
  )
  SELECT pieces.stylist_id, slot.starts_at
  FROM pieces
  CROSS JOIN studio
  CROSS JOIN service
  CROSS JOIN LATERAL generate_series(
    -- The first grid point at or after the piece's start. The grid is
    -- counted from LOCAL midnight, so slots read 10:00, 10:15… on the
    -- clock in Lagos (and would in a zone with a :30 offset too).
    studio.day_start + studio.step * ceil(
      extract(epoch FROM lower(pieces.piece) - studio.day_start) / extract(epoch FROM studio.step)
    ),
    -- The last start whose service + buffer still ends inside the piece.
    upper(pieces.piece) - service.total,
    studio.step
  ) AS slot(starts_at)
  ORDER BY slot.starts_at, pieces.stylist_id
$$;
