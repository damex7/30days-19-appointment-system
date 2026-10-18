-- 010: appointments, and their history.

CREATE TABLE bookings (
  -- A plain integer id, deliberately GUESSABLE (/appointments/41,
  -- /appointments/42 …). Guessing gets you nowhere: every query that reads a
  -- booking adds "and it's yours" to its WHERE clause (lib/booking/access.ts),
  -- so someone else's id simply isn't found (404). Security comes from that
  -- check, not from an id being hard to guess.
  id               integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- WHO IT'S FOR: a client account, or a walk-in/phone client an admin
  -- booked by name (they may have no email, and users.password_hash is NOT
  -- NULL, so they can't be a user row). RESTRICT: users are deactivated,
  -- never deleted, and a booking must keep its client.
  client_id        uuid        NULL REFERENCES users (id) ON DELETE RESTRICT,
  walk_in_name     text        NULL CHECK (length(btrim(walk_in_name)) BETWEEN 1 AND 100),
  walk_in_phone    text        NULL CHECK (walk_in_phone ~ '^\+234[0-9]{10}$'),

  -- RESTRICT on both: a stylist is deactivated and a service archived, but
  -- neither may vanish from under a booking.
  stylist_id       integer     NOT NULL REFERENCES stylists (id) ON DELETE RESTRICT,
  service_id       integer     NOT NULL REFERENCES services (id) ON DELETE RESTRICT,

  -- Who made the booking: the client themselves, or an admin on the phone.
  booked_by        uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- WHEN, as a half-open range of real instants [start, end), where end
  -- includes the service's clean-up BUFFER. Storing the buffer inside the
  -- range means the no-overlap rule below protects it automatically.
  during           tstzrange   NOT NULL,

  -- COPIED from the service at booking time. If the admin later changes
  -- the price or the length of "Knotless braids", existing bookings keep
  -- what the client agreed to.
  duration_minutes integer     NOT NULL CHECK (duration_minutes > 0),
  price_kobo       bigint      NOT NULL CHECK (price_kobo >= 0),

  -- confirmed : holds the time (the only status the no-overlap rule sees)
  -- cancelled : by the client or the studio; the time is free again
  -- completed / no_show : set by the stylist once it has started
  status           text        NOT NULL DEFAULT 'confirmed'
                               CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),

  client_note      text        NOT NULL DEFAULT '' CHECK (length(client_note) <= 500),

  -- Filled in only when cancelled (checked below). cancelled_by is NULL if
  -- the system did it; RESTRICT because users are never deleted.
  cancelled_by     uuid        NULL REFERENCES users (id) ON DELETE RESTRICT,
  cancel_reason    text        NULL CHECK (length(cancel_reason) <= 300),
  cancelled_at     timestamptz NULL,

  -- Set by the reminders cron job when it claims this booking, so a
  -- reminder never goes twice (see app/api/cron/reminders/route.ts).
  reminder_sent_at timestamptz NULL,

  -- OPTIMISTIC LOCKING (as on Day 18): every change bumps the version, and
  -- every change is made "WHERE version = the one you saw". If someone
  -- else changed the booking in between, nothing matches and the person is
  -- told to reload, instead of silently overwriting the other change. It
  -- also becomes the SEQUENCE number in the .ics file, so calendar apps
  -- know a rescheduled event replaces the old one.
  version          integer     NOT NULL DEFAULT 1 CHECK (version > 0),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Exactly one kind of client: an account, OR a walk-in with a name.
  -- (Written with IS [NOT] NULL on both sides: a CHECK only fails on
  -- `false`, and `NULL` would slip through. Day 18's lesson.)
  CONSTRAINT bookings_one_kind_of_client CHECK (
    (client_id IS NOT NULL AND walk_in_name IS NULL AND walk_in_phone IS NULL)
    OR (client_id IS NULL AND walk_in_name IS NOT NULL)
  ),

  -- A finite, half-open range (the same shape as time_off).
  CONSTRAINT bookings_range_shape CHECK (
    NOT isempty(during) AND NOT lower_inf(during) AND NOT upper_inf(during)
    AND lower_inc(during) AND NOT upper_inc(during)
  ),

  -- The service itself fits in the range (the rest is buffer).
  CONSTRAINT bookings_duration_fits CHECK (lower(during) + make_interval(mins => duration_minutes) <= upper(during)),

  -- cancelled_at is set exactly when status is 'cancelled', and the other
  -- cancel fields stay empty otherwise. Both sides of `=` are never NULL.
  CONSTRAINT bookings_cancel_fields CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL)
    AND (status = 'cancelled' OR (cancelled_by IS NULL AND cancel_reason IS NULL))
  ),

  -- ===================== NO DOUBLE BOOKING =====================
  -- No two CONFIRMED bookings for the same stylist (=) may overlap (&&).
  --
  -- Why this and not "SELECT for a clash, then INSERT" in the app? Two
  -- clients press "Book" for 10:30 with Funmi at the same moment. Both
  -- SELECTs run before either INSERT, both see a free slot, both insert:
  -- double booked. Any check-then-write in application code has that gap.
  -- The constraint is enforced INSIDE the database as each row is written,
  -- using an index, and PostgreSQL makes the second writer wait for the
  -- first and then fail with error 23P01 (exclusion_violation). It also
  -- protects against every path that isn't the booking form: an admin
  -- edit, a script, a future feature, a bug.
  --
  -- WHERE (status = 'confirmed'): cancelled bookings free their time, and
  -- so do completed and no-show ones (they can only be marked once they
  -- have started, so the stylist may take a walk-in in the rest of it).
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (stylist_id WITH =, during WITH &&)
    WHERE (status = 'confirmed')
);

CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INDEXES for the real queries (see `npm run db:explain`):

-- "A stylist's bookings in a date range" (the stylist's day and week, the
-- admin day view), in EVERY status: the constraint's index above only
-- holds confirmed rows, so it can't answer "show today's cancellations".
CREATE INDEX bookings_stylist_during_idx ON bookings USING gist (stylist_id, during);

-- "A client's upcoming and past bookings", newest first. Partial: walk-ins
-- (no client_id) never appear in that list.
CREATE INDEX bookings_client_start_idx ON bookings (client_id, lower(during) DESC) WHERE client_id IS NOT NULL;

-- The admin's booking list is ordered by start time and filtered by a date
-- range, with optional stylist/service/status filters on top.
CREATE INDEX bookings_start_idx ON bookings (lower(during));

-- The reminder job: "confirmed, has a client, not yet reminded, starting
-- tomorrow". A partial index holds only the rows still waiting, so it stays
-- tiny however long the history grows.
CREATE INDEX bookings_reminder_due_idx ON bookings (lower(during))
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL AND client_id IS NOT NULL;

-- Deleting a never-booked service checks this table first (RESTRICT);
-- without an index that check would read every booking.
CREATE INDEX bookings_service_idx ON bookings (service_id);

-- ---------------------------------------------------------------------------
-- booking_events: the append-only history of every booking
-- ---------------------------------------------------------------------------
CREATE TABLE booking_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- RESTRICT: bookings are never deleted, and the history must not be
  -- removable by deleting its booking either.
  booking_id  integer     NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,

  type        text        NOT NULL CHECK (type IN ('created', 'rescheduled', 'cancelled', 'completed', 'no_show', 'reminder_sent')),

  -- Who did it. NULL = the system (the reminder job). RESTRICT: users are
  -- deactivated, never deleted, so "cancelled by Ada" stays true.
  actor_id    uuid        NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- For a reschedule, the old and the new time, so the history reads
  -- "moved from Tue 10:00 to Thu 14:00" without guessing.
  from_during tstzrange   NULL,
  to_during   tstzrange   NULL,

  note        text        NULL CHECK (length(note) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT booking_events_reschedule_has_times CHECK (
    type <> 'rescheduled' OR (from_during IS NOT NULL AND to_during IS NOT NULL)
  )
);

-- "The history of booking 42", oldest first.
CREATE INDEX booking_events_booking_idx ON booking_events (booking_id, created_at, id);

-- APPEND-ONLY, enforced by the database (as Day 18's stock ledger): a
-- history anyone can quietly edit isn't a history. Mistakes are corrected
-- by adding events, never by changing old ones.
CREATE FUNCTION forbid_history_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING HINT = 'Add a new event instead.';
END;
$$;

CREATE TRIGGER booking_events_no_update_or_delete
  BEFORE UPDATE OR DELETE ON booking_events
  FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();

CREATE TRIGGER booking_events_no_truncate
  BEFORE TRUNCATE ON booking_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_changes();
