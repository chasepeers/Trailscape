-- Trailscape back end: first schema (7 Nov 2026).
-- Dates are 'YYYY-MM-DD' text; timestamps are ISO 8601 UTC text. Money is whole rand (ZAR).

-- Every bookable stay: the trail packages (PLACES in app-core.js) and the accommodation listings (stays-data.js).
CREATE TABLE stays (
  id               TEXT PRIMARY KEY,             -- 'whale', 'WC-064', ...
  name             TEXT NOT NULL,
  operator         TEXT NOT NULL,                -- 'CapeNature', 'SANParks', 'Private', ...
  op_key           TEXT NOT NULL,                -- cn | sp | pv | cm | mu
  kind             TEXT,
  mode             TEXT NOT NULL DEFAULT 'enquiry' CHECK (mode IN ('instant', 'enquiry')),
  fixed_nights     INTEGER NOT NULL DEFAULT 0,   -- >0 for multi-day trails booked as one package
  beds             INTEGER NOT NULL DEFAULT 8,
  price_pp         INTEGER NOT NULL,             -- per person per night
  price_estimated  INTEGER NOT NULL DEFAULT 1,   -- 1 until a real rate is entered
  engine           TEXT,                         -- 'NightsBridge' for instant stays
  engine_ref       TEXT,                         -- the stay's property ID in that engine
  booking_email    TEXT,
  booking_phone    TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Lead hikers. One row per email address; details are updated on each new request.
CREATE TABLE guests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  phone       TEXT,
  consent_at  TEXT NOT NULL,                     -- when they ticked the sharing consent (POPIA)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Reference numbers HS-1100, HS-1101, ... shared by enquiries and bookings.
CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counters (name, value) VALUES ('ref', 1099);

CREATE TABLE enquiries (
  ref             TEXT PRIMARY KEY,
  stay_id         TEXT NOT NULL REFERENCES stays(id),
  guest_id        INTEGER NOT NULL REFERENCES guests(id),
  check_in        TEXT NOT NULL,
  check_out       TEXT NOT NULL,
  nights          INTEGER NOT NULL,
  hikers          INTEGER NOT NULL,
  flexible        INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  guide_total     INTEGER,                       -- what the site showed the guest
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN
                    ('new', 'asked_operator', 'operator_replied', 'offer_sent', 'accepted', 'declined', 'unavailable', 'cancelled')),
  quoted_stay     INTEGER,                       -- operator's exact price, once known
  quoted_fee      INTEGER,
  booking_ref     TEXT,                          -- set when an accepted offer becomes a booking
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX enquiries_status ON enquiries(status, created_at);

CREATE TABLE bookings (
  ref             TEXT PRIMARY KEY,
  stay_id         TEXT NOT NULL REFERENCES stays(id),
  guest_id        INTEGER NOT NULL REFERENCES guests(id),
  source          TEXT NOT NULL DEFAULT 'instant' CHECK (source IN ('instant', 'enquiry', 'manual')),
  check_in        TEXT NOT NULL,
  check_out       TEXT NOT NULL,
  nights          INTEGER NOT NULL,
  hikers          INTEGER NOT NULL,
  notes           TEXT,
  stay_fees       INTEGER NOT NULL,              -- worked out on the server, not taken from the browser
  service_fee     INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  client_total    INTEGER,                       -- what the browser showed, kept to spot price mismatches
  currency        TEXT NOT NULL DEFAULT 'ZAR',
  pay_method      TEXT,                          -- card | eft
  payment_status  TEXT NOT NULL DEFAULT 'none' CHECK (payment_status IN
                    ('none', 'stub', 'held', 'paid', 'refunded', 'failed')),
  payment_ref     TEXT,
  status          TEXT NOT NULL DEFAULT 'received' CHECK (status IN
                    ('received', 'booking_operator', 'confirmed', 'cancelled', 'failed')),
  engine_ref      TEXT,                          -- the operator's own booking reference
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX bookings_stay_dates ON bookings(stay_id, check_in);
CREATE INDEX bookings_status ON bookings(status, created_at);

-- Beds taken per night. Filled from our bookings (one row per night, source 'booking') and by hand
-- or from owners' calendars (source 'manual', 'ical'). /api/booked sums this table.
CREATE TABLE blocked_nights (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  stay_id    TEXT NOT NULL REFERENCES stays(id),
  date       TEXT NOT NULL,
  beds       INTEGER NOT NULL,
  source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('booking', 'manual', 'ical')),
  ref        TEXT,                               -- booking ref, or a note
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX blocked_stay_date ON blocked_nights(stay_id, date);

-- Availability for instant stays, as last read from the stay's booking engine (or entered by hand).
-- Nights without a row fall back to the stay's beds minus blocked_nights.
CREATE TABLE availability (
  stay_id    TEXT NOT NULL REFERENCES stays(id),
  date       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('open', 'closed', 'notopen')),
  beds_left  INTEGER NOT NULL DEFAULT 0,
  price_pp   INTEGER,
  synced_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (stay_id, date)
);

-- What happened to each enquiry or booking, for the back office.
CREATE TABLE events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ref    TEXT NOT NULL,
  at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor  TEXT NOT NULL,                          -- 'guest', 'system', 'admin'
  text   TEXT NOT NULL
);
CREATE INDEX events_ref ON events(ref, at);
