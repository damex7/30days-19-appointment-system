-- 008: what the studio offers, and who offers it.

-- ---------------------------------------------------------------------------
-- services: the menu (knotless braids, barbing, gel nails…)
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  -- Integer identity: services are listed and linked a lot, and an id
  -- like 7 reads well in a URL. GENERATED ALWAYS means the database alone
  -- hands out ids; an INSERT can't pick its own.
  id               integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  name             text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),

  -- The URL form of the name (/book?service=knotless-braids), so a booking
  -- link reads well and survives the id changing between databases.
  -- UNIQUE: two services can't share a URL. The regex keeps it lower-case
  -- words joined by single hyphens.
  slug             text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),

  -- A fixed list, so the home page can group by it. A CHECK rather than a
  -- separate table: there are five, they come with the business, and adding
  -- one is a migration plus a label in lib/studio/categories.ts anyway.
  category         text        NOT NULL CHECK (category IN ('braids', 'barbing', 'nails', 'makeup', 'hair_care')),

  description      text        NOT NULL DEFAULT '' CHECK (length(description) <= 500),

  -- How long the client is in the chair. Whole multiples of 5 minutes, so
  -- every appointment ends on a sensible time. Knotless braids take ~4 h
  -- (240), barbing 45.
  duration_minutes integer     NOT NULL CHECK (duration_minutes BETWEEN 5 AND 720 AND duration_minutes % 5 = 0),

  -- CLEAN-UP TIME after the service (sweeping hair, sterilising tools)
  -- that nobody else may be booked into. A booking's `during` covers
  -- duration + buffer, so the no-overlap rule protects the buffer too.
  buffer_minutes   integer     NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 120 AND buffer_minutes % 5 = 0),

  -- MONEY IN KOBO (1 naira = 100 kobo), as a whole number. Floats can't
  -- store most decimal fractions exactly (0.1 + 0.2 ≠ 0.3), so sums drift.
  -- bigint, because ₦21 million in kobo is already past a 32-bit integer.
  price_kobo       bigint      NOT NULL CHECK (price_kobo >= 0),

  -- ARCHIVED, not deleted, once anyone has booked it: bookings point here
  -- with ON DELETE RESTRICT. An archived service disappears from the menu
  -- and the booking flow but stays on old bookings. NULL = on the menu.
  archived_at      timestamptz NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The home page and the booking flow list the LIVE menu by category. A
-- partial index holds only unarchived rows, already in display order.
CREATE INDEX services_menu_idx ON services (category, name) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- stylists: the public face of a stylist account
-- ---------------------------------------------------------------------------
CREATE TABLE stylists (
  id           integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ONE ROW PER STYLIST USER (UNIQUE). The login lives in users (Day 17's
  -- auth); the things clients see (display name, bio) and the schedule
  -- hang off this row.
  -- ON DELETE RESTRICT: users are deactivated, never deleted, and a
  -- stylist with bookings must keep existing for that history.
  user_id      uuid        NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,

  -- "Funmi", not "Olufunmilayo Adebayo-Williams": what clients pick from.
  display_name text        NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 60),
  bio          text        NOT NULL DEFAULT '' CHECK (length(bio) <= 500),

  -- DEACTIVATED, not deleted (same reason as above). An inactive stylist
  -- gets no new bookings (open_slots skips them) but keeps their history.
  active       boolean     NOT NULL DEFAULT true,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER stylists_set_updated_at
  BEFORE UPDATE ON stylists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- stylist_services: who offers what (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE stylist_services (
  -- ON DELETE CASCADE on both sides: a link row describes nothing on its
  -- own, so if either end ever went, the link should go with it. (In
  -- practice neither is deleted once booked; RESTRICT on bookings sees to
  -- that.)
  stylist_id integer NOT NULL REFERENCES stylists (id) ON DELETE CASCADE,
  service_id integer NOT NULL REFERENCES services (id) ON DELETE CASCADE,

  -- COMPOSITE PRIMARY KEY: the pair is the identity, so the same link
  -- can't be stored twice. Its index (stylist_id first) also answers "what
  -- does this stylist offer?".
  PRIMARY KEY (stylist_id, service_id)
);

-- The other direction, "who offers this service?", is the first step of
-- every availability search, so it gets its own index.
CREATE INDEX stylist_services_service_idx ON stylist_services (service_id, stylist_id);
