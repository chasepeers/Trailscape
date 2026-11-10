-- Provider outreach tracking (10 Nov 2026).
--
-- One row per venue we have contacted (or plan to): which email went out, when, whether they replied, and when to
-- chase. Venues with no row count as "not contacted". Consent itself stays on stays.consent: a "yes" here is the
-- reply; switching consent on is what puts the venue on the map.
CREATE TABLE outreach (
  stay_id      TEXT PRIMARY KEY REFERENCES stays(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'sent'
               CHECK (status IN ('planned', 'sent', 'replied', 'yes', 'declined', 'no_reply', 'bounced')),
  template     TEXT,                                       -- 'short', 'full' or free text
  sent_to      TEXT,                                       -- address the outreach went to
  sent_from    TEXT,                                       -- address it was sent from
  sent_at      TEXT,                                       -- 'YYYY-MM-DD' first outreach
  replied_at   TEXT,                                       -- 'YYYY-MM-DD' of their reply
  follow_up_on TEXT,                                       -- 'YYYY-MM-DD' next chase, NULL = none
  follow_ups   INTEGER NOT NULL DEFAULT 0,                 -- reminders sent after the first email
  note         TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX outreach_status ON outreach(status, follow_up_on);

-- History per venue: "Sent short email", "Replied: yes, sent rate sheet", ...
CREATE TABLE outreach_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  stay_id TEXT NOT NULL,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor   TEXT NOT NULL DEFAULT 'admin',
  text    TEXT NOT NULL
);
CREATE INDEX outreach_log_stay ON outreach_log(stay_id, id);

-- First outreach email: Jamaka Organic Farm, 9 Nov 2026 (sent by mistake from the personal Gmail, so a reply may land there).
INSERT INTO outreach (stay_id, status, template, sent_to, sent_from, sent_at, follow_up_on, note)
  SELECT id, 'sent', 'short', 'stay@jamaka.co.za', 'chasepeers1@gmail.com', '2026-11-09', '2026-11-16',
         'Sent from the personal Gmail by mistake; check that inbox for a reply too.'
    FROM stays WHERE name = 'Jamaka Organic Farm' LIMIT 1;
INSERT INTO outreach_log (stay_id, at, text)
  SELECT id, '2026-11-09T04:53:00Z', 'Sent short outreach email to stay@jamaka.co.za (from chasepeers1@gmail.com)'
    FROM stays WHERE name = 'Jamaka Organic Farm' LIMIT 1;
