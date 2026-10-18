-- 009: when people can work. Three different shapes of time, on purpose:
--
--   working_hours  "10:00-18:00 every Tuesday"   a RULE in local wall-clock time
--   time_off       "from this instant to that"    real moments (tstzrange)
--   closures       "the studio is shut on 1 Oct"  a local CALENDAR date
--
-- "10:00 every Tuesday" is not a moment: it names a different instant each
-- week, and which instant depends on the time zone (and, in places with
-- daylight saving, on the date). So it is stored as wall-clock time and only
-- turned into instants when slots are worked out (open_slots in 011), using
-- the studio's zone from settings. A holiday is also a local idea ("all of
-- 1 October in Lagos"), so it's a date. Time off, on the other hand, is
-- entered for specific dates and times, so it's stored as real instants.

-- ---------------------------------------------------------------------------
-- working_hours: each stylist's weekly pattern
-- ---------------------------------------------------------------------------
CREATE TABLE working_hours (
  id          integer  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- CASCADE: hours only describe a stylist and mean nothing without them.
  stylist_id  integer  NOT NULL REFERENCES stylists (id) ON DELETE CASCADE,

  -- 0 = Sunday … 6 = Saturday: the same numbering as PostgreSQL's
  -- EXTRACT(DOW …) and JavaScript's getDay(), so nothing needs translating.
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),

  -- Local wall-clock times in the studio's zone (see the note at the top).
  start_time  time     NOT NULL,
  end_time    time     NOT NULL,

  -- A block must have positive length. (A night shift across midnight
  -- would need two rows, which a studio doesn't have.)
  CONSTRAINT working_hours_start_before_end CHECK (start_time < end_time),

  -- NO OVERLAPPING BLOCKS for the same stylist on the same day. Several
  -- blocks per day ARE allowed: 09:00-13:00 and 14:00-18:00 is a lunch
  -- break. Ranges are half-open, [start, end), so 09:00-13:00 and
  -- 13:00-17:00 merely touch and are allowed; 09:00-13:00 and 12:00-17:00
  -- overlap and are refused with error 23P01.
  -- The GiST index this creates also serves "this stylist's hours on
  -- day N" lookups (btree_gist provides the = part).
  CONSTRAINT working_hours_no_overlap EXCLUDE USING gist (
    stylist_id WITH =,
    day_of_week WITH =,
    timerange(start_time, end_time) WITH &&
  )
);

-- ---------------------------------------------------------------------------
-- time_off: a stylist is away (leave, a course, a hospital visit)
-- ---------------------------------------------------------------------------
CREATE TABLE time_off (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- CASCADE: time off only describes the stylist.
  stylist_id integer     NOT NULL REFERENCES stylists (id) ON DELETE CASCADE,

  -- A RANGE of real instants, half-open [from, until). One column instead
  -- of two means PostgreSQL's range operators work on it directly: &&
  -- (overlaps), <@ (is contained by), and multirange subtraction in 011.
  during     tstzrange   NOT NULL,

  reason     text        NOT NULL DEFAULT '' CHECK (length(reason) <= 200),

  -- Who entered it (the stylist, or an admin on their behalf). RESTRICT:
  -- users are never deleted. NULL only for seeded rows.
  created_by uuid        NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- A real, finite, half-open range: not empty, with both ends given,
  -- including the start and excluding the end. Every range in this schema
  -- has the same shape, so "touching" ranges never count as overlapping.
  CONSTRAINT time_off_range_shape CHECK (
    NOT isempty(during) AND NOT lower_inf(during) AND NOT upper_inf(during)
    AND lower_inc(during) AND NOT upper_inc(during)
  ),

  -- A stylist's own time off can't overlap itself: two overlapping
  -- entries would make "edit" and "remove" ambiguous. Extend one instead.
  CONSTRAINT time_off_no_overlap EXCLUDE USING gist (stylist_id WITH =, during WITH &&)
);

-- ---------------------------------------------------------------------------
-- closures: days the whole studio is shut (public holidays, a refit)
-- ---------------------------------------------------------------------------
CREATE TABLE closures (
  id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- A local calendar DATE in the studio's zone. "Closed on Independence
  -- Day" means 00:00-24:00 in Lagos, which open_slots works out with
  -- AT TIME ZONE. UNIQUE: a day is either closed or not; two rows for the
  -- same day would just be a duplicate.
  closed_on  date        NOT NULL UNIQUE,

  name       text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
