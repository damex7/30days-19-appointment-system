-- 007: the building blocks for scheduling, and the studio's settings.

-- BTREE_GIST lets a GiST index (the kind that understands ranges and
-- "overlaps") also handle plain equality on ordinary columns such as an
-- integer stylist_id. The exclusion constraints in 009 and 010 need exactly
-- that combination: "SAME stylist (=) AND OVERLAPPING time (&&)". Without
-- this extension PostgreSQL has no GiST operator class for `integer =`.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- TIMERANGE: a range of WALL-CLOCK times of day, like [09:00, 13:00).
-- PostgreSQL has ranges of timestamps (tstzrange) built in, but not of
-- plain `time`, so we define one. working_hours (009) uses it to refuse two
-- overlapping blocks on the same day for the same stylist.
--
-- subtype_diff tells the GiST index how far apart two times are, which
-- helps it build a better index. (This is the example from the PostgreSQL
-- documentation on range types.)
CREATE FUNCTION time_subtype_diff(x time, y time) RETURNS float8
LANGUAGE sql IMMUTABLE STRICT AS 'SELECT EXTRACT(EPOCH FROM (x - y))';

CREATE TYPE timerange AS RANGE (subtype = time, subtype_diff = time_subtype_diff);

-- ---------------------------------------------------------------------------
-- settings: ONE row of studio-wide configuration
-- ---------------------------------------------------------------------------
--
-- Why a table and not constants in the code? The admin can change these
-- from /admin/settings without a deploy, and the SQL slot function (011)
-- reads them in the same query that works out availability, so the code and
-- the database can never disagree about, say, the slot step.
CREATE TABLE settings (
  -- EXACTLY ONE ROW. The primary key is a boolean that must be true, so a
  -- second row (which would also have to be `true`) breaks the PK. Every
  -- query can then say `FROM settings` without a WHERE.
  id                        boolean     PRIMARY KEY DEFAULT true CHECK (id),

  studio_name               text        NOT NULL CHECK (length(btrim(studio_name)) BETWEEN 1 AND 100),

  -- THE STUDIO'S TIME ZONE, as an IANA name ('Africa/Lagos'). Every time a
  -- person sees or types is in this zone, whatever their phone is set to:
  -- a client in London booking for their visit home must see Lagos times,
  -- because that's when they must be in the chair.
  --
  -- Lagos has no daylight saving and has been UTC+1 since 1964, yet the
  -- code never hard-codes "+01:00":
  --   * countries DO change their rules (Nigeria's offset itself changed
  --     in the 1960s), and the IANA tz database that PostgreSQL and every
  --     browser ship is updated when they do;
  --   * the studio could open a branch in a zone that has DST;
  --   * an offset is a property of an INSTANT in a zone, not of the zone,
  --     so conversions always ask the tz database "what was the offset
  --     in Africa/Lagos at this moment?" (lib/time.ts, and AT TIME ZONE
  --     in SQL). Doing it properly costs nothing here.
  -- A trigger below checks the name is one PostgreSQL knows.
  time_zone                 text        NOT NULL DEFAULT 'Africa/Lagos',

  -- Start times are offered on this grid: 10:00, 10:15, 10:30… Must divide
  -- an hour evenly, so the grid lines up the same way every hour.
  slot_step_minutes         integer     NOT NULL DEFAULT 15 CHECK (slot_step_minutes IN (5, 10, 15, 20, 30, 60)),

  -- No bookings sooner than this from now: stylists need time to prepare
  -- (and to see the booking at all). Admin walk-in bookings skip it.
  min_notice_hours          integer     NOT NULL DEFAULT 2 CHECK (min_notice_hours BETWEEN 0 AND 168),

  -- How far ahead clients may book. Keeps the slot search bounded and
  -- stops bookings landing before next quarter's hours are known.
  booking_window_days       integer     NOT NULL DEFAULT 30 CHECK (booking_window_days BETWEEN 1 AND 365),

  -- Clients may reschedule or cancel up to this many hours before the
  -- start; after that the buttons are replaced by "contact the studio".
  cancellation_cutoff_hours integer     NOT NULL DEFAULT 12 CHECK (cancellation_cutoff_hours BETWEEN 0 AND 168),

  -- +234 form, so it drops straight into a wa.me link.
  whatsapp_number           text        NOT NULL CHECK (whatsapp_number ~ '^\+234[0-9]{10}$'),
  address                   text        NOT NULL CHECK (length(btrim(address)) BETWEEN 1 AND 300),

  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER settings_set_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A CHECK constraint can't look things up in another table, so a trigger
-- checks the time zone against PostgreSQL's own list. A typo like
-- 'Africa/Lagoss' is refused here instead of breaking every AT TIME ZONE
-- later. (The admin form also checks it with Intl.supportedValuesOf.)
CREATE FUNCTION check_time_zone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'Unknown time zone: %', NEW.time_zone USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER settings_check_time_zone
  BEFORE INSERT OR UPDATE OF time_zone ON settings
  FOR EACH ROW EXECUTE FUNCTION check_time_zone();

-- The row exists from the start, so the app never has to handle "no
-- settings yet". The seed fills in the real studio details.
INSERT INTO settings (studio_name, whatsapp_number, address)
VALUES ('Ìpàdé Hair & Beauty', '+2348000000000', 'Lekki Phase 1, Lagos')
ON CONFLICT (id) DO NOTHING;
