-- Rooms, rates and provider consent (9 Nov 2026).
--
-- Consent: a stay is shown on the site (map, stay lists, stay pages) only while stays.consent = 1, i.e. the provider has
-- agreed to be listed and to have Trailscape book on guests' behalf. With consent off the record is kept but hidden, and
-- new enquiries and bookings for it are refused. CapeNature and SANParks start as consented (public operators with
-- central reservations); every other stay starts hidden until the provider says yes.
ALTER TABLE stays ADD COLUMN consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stays ADD COLUMN consent_at TEXT;            -- when consent was last switched on
ALTER TABLE stays ADD COLUMN consent_note TEXT;          -- e.g. "Email reply from owner, 12 Nov"
ALTER TABLE stays ADD COLUMN contact_name TEXT;          -- person to deal with
ALTER TABLE stays ADD COLUMN rates_url TEXT;             -- link to the provider's own room / rate sheet (PDF or page)
ALTER TABLE stays ADD COLUMN rates_checked_at TEXT;      -- last time the rooms and rates below were confirmed

UPDATE stays SET consent = 1, consent_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  consent_note = 'Public operator with central reservations (set at start)' WHERE op_key IN ('cn', 'sp');

-- Room or unit types of a stay: "Hut A", "Double en-suite", "Campsite (6 people)".
CREATE TABLE rooms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  stay_id     TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sleeps      INTEGER,                                    -- most people per unit
  bed_setup   TEXT,                                       -- "1 double + 2 bunks"
  units       INTEGER NOT NULL DEFAULT 1,                 -- how many of this type the stay has
  included    TEXT,                                       -- "Linen, towels, firewood; self-catering"
  notes       TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,                 -- 0 = archived, not shown
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX rooms_stay ON rooms(stay_id, sort);

-- Nightly rates of a room. Several rows cover seasons, weekends and so on; a rate with no dates applies all year.
CREATE TABLE room_rates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id       INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Standard',         -- "Standard", "Peak season", "Weekend"
  amount        INTEGER NOT NULL,                         -- whole rand per night
  basis         TEXT NOT NULL DEFAULT 'unit' CHECK (basis IN ('unit', 'person')),
  valid_from    TEXT,                                     -- 'YYYY-MM-DD' or NULL
  valid_to      TEXT,                                     -- last night the rate applies, or NULL
  min_nights    INTEGER,
  extra_person  INTEGER,                                  -- rand per extra person per night, if any
  notes         TEXT,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX room_rates_room ON room_rates(room_id);
