-- Easy enquire: we email the stay ourselves and capture its answer (8 Nov 2026).
-- Each enquiry gets a secret token. It is part of the reply address (hs1100.<token>@reply.trailscape.co.za) and of the
-- one-click answer page (/api/operator/HS-1100?t=<token>), so a reply can be matched to its enquiry without a login.

ALTER TABLE enquiries ADD COLUMN op_token TEXT;           -- reply token, set when we first email the stay
ALTER TABLE enquiries ADD COLUMN op_asked_at TEXT;        -- last time we emailed the stay
ALTER TABLE enquiries ADD COLUMN op_answer TEXT;          -- 'available' | 'unavailable', from the answer page or the back office
ALTER TABLE enquiries ADD COLUMN op_answered_at TEXT;
ALTER TABLE enquiries ADD COLUMN op_price INTEGER;        -- the stay's total for the group, if they gave one
ALTER TABLE enquiries ADD COLUMN op_note TEXT;            -- anything else they wrote on the answer page

-- Every email to and from the stay about an enquiry, newest last.
CREATE TABLE enquiry_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ref          TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  channel      TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'form')),
  from_addr    TEXT,
  to_addr      TEXT,
  subject      TEXT,
  body         TEXT,                                     -- plain text, quoted history trimmed for replies
  body_full    TEXT,                                     -- whole plain-text body as received (capped)
  provider_id  TEXT UNIQUE,                              -- Resend email id; makes webhook retries harmless
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX enquiry_messages_ref ON enquiry_messages(ref, id);

-- Replies we could not match to an enquiry, so nothing is lost.
CREATE TABLE inbound_unmatched (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id  TEXT UNIQUE,
  from_addr    TEXT,
  to_addr      TEXT,
  subject      TEXT,
  body         TEXT,
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
