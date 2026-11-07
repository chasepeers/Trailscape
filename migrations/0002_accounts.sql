-- Hiker accounts (7 Nov 2026). Hikers sign up and sign in with a 6-digit code emailed through Resend; no passwords.
-- The one admin account signs in with a password instead (password_hash set). A user's trips are the enquiries and
-- bookings made with their email address (guests.email).

CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  phone          TEXT,
  role           TEXT NOT NULL DEFAULT 'hiker' CHECK (role IN ('hiker', 'admin')),
  password_hash  TEXT,                          -- only for the admin: 'pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>'
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_login_at  TEXT
);

-- One-time sign-in codes. Only a hash of the code is stored.
CREATE TABLE login_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL COLLATE NOCASE,
  code_hash   TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('signin', 'signup')),
  name        TEXT,                             -- sign-up details, kept until the code is used
  phone       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX login_codes_email ON login_codes(email, created_at);

-- Signed-in browsers. The cookie holds a random token; only its hash is stored.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Failed password attempts, to slow down guessing.
CREATE TABLE password_failures (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  email  TEXT NOT NULL COLLATE NOCASE,
  at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX password_failures_email ON password_failures(email, at);

-- The admin account itself is inserted separately (not in this file) so its password hash never sits in the repo.
