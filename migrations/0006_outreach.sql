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

-- Official website of each venue (shown and edited in Venues & rooms). Prefilled from the stay list where the source is
-- marked "Official"; booking-site and tourism-directory listings are left empty on purpose.
ALTER TABLE stays ADD COLUMN website TEXT;
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/tweede-tol' WHERE id = 'WC-001';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/vrolijkheid-nature-reserve' WHERE id = 'WC-002';
UPDATE stays SET website = 'https://www.robertsonr62.com/nature-walks' WHERE id = 'WC-003';
UPDATE stays SET website = 'https://www.montagu-ashton.info' WHERE id = 'WC-004';
UPDATE stays SET website = 'https://www.montagu-ashton.info' WHERE id = 'WC-005';
UPDATE stays SET website = 'https://www.africamps.com' WHERE id = 'WC-006';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-024';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-025';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-026';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-027';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-028';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-029';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-030';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-031';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-032';
UPDATE stays SET website = 'https://www.sanparks.org/parks/table-mountain/accommodation' WHERE id = 'WC-033';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/algeria-cottages' WHERE id = 'WC-034';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/cederberg-wilderness-area' WHERE id = 'WC-035';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/garskraal' WHERE id = 'WC-036';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/kliphuis-camping' WHERE id = 'WC-037';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/kliphuis-cottages' WHERE id = 'WC-038';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/matjiesrivier-nature-reserve' WHERE id = 'WC-039';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/cederberg-wilderness-area' WHERE id = 'WC-040';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/peerboom' WHERE id = 'WC-041';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/cederberg-wilderness-area' WHERE id = 'WC-042';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/uitkyk' WHERE id = 'WC-043';
UPDATE stays SET website = 'https://www.bushmanskloof.co.za' WHERE id = 'WC-050';
UPDATE stays SET website = 'https://www.cederbergoasis.co.za' WHERE id = 'WC-053';
UPDATE stays SET website = 'https://www.depakhuys.com' WHERE id = 'WC-054';
UPDATE stays SET website = 'https://cederberg-accommodation.co.za' WHERE id = 'WC-055';
UPDATE stays SET website = 'https://www.soulcountry.info' WHERE id = 'WC-056';
UPDATE stays SET website = 'https://jamaka.co.za' WHERE id = 'WC-058';
UPDATE stays SET website = 'https://www.kleinfonteinrocklands.com' WHERE id = 'WC-059';
UPDATE stays SET website = 'https://www.cederbergpark.com' WHERE id = 'WC-060';
UPDATE stays SET website = 'https://www.mountceder.co.za' WHERE id = 'WC-064';
UPDATE stays SET website = 'https://www.mountceder.co.za' WHERE id = 'WC-065';
UPDATE stays SET website = 'https://www.cederbergexperience.co.za' WHERE id = 'WC-066';
UPDATE stays SET website = 'https://www.piekenierskloof.co.za' WHERE id = 'WC-068';
UPDATE stays SET website = 'https://www.sanddrif.com' WHERE id = 'WC-069';
UPDATE stays SET website = 'https://thebaths.co.za' WHERE id = 'WC-070';
UPDATE stays SET website = 'https://www.travellersrest.co.za' WHERE id = 'WC-072';
UPDATE stays SET website = 'https://www.cherryfarm.co.za' WHERE id = 'WC-082';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/buffalo-valley-forest-lodge' WHERE id = 'WC-087';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/fish-eagle-loft' WHERE id = 'WC-088';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/mvubu-bush-lodge' WHERE id = 'WC-089';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/otters-rest-lodge' WHERE id = 'WC-090';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/fountain-shack' WHERE id = 'WC-091';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/whiskey-creek-cabin' WHERE id = 'WC-092';
UPDATE stays SET website = 'https://www.africamps.com' WHERE id = 'WC-094';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-107';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-108';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-109';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-110';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-111';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-112';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-113';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-114';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-115';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-116';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-117';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-118';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-119';
UPDATE stays SET website = 'https://www.sanparks.org/parks/garden-route/accommodation' WHERE id = 'WC-120';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/hottentots-holland-huts' WHERE id = 'WC-121';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/hottentots-holland-huts' WHERE id = 'WC-122';
UPDATE stays SET website = 'https://www.sanparks.org/parks/karoo/accommodation' WHERE id = 'WC-125';
UPDATE stays SET website = 'https://www.sanparks.org/parks/karoo/accommodation' WHERE id = 'WC-126';
UPDATE stays SET website = 'https://www.sanparks.org/parks/karoo/accommodation' WHERE id = 'WC-127';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/anysberg-campsites' WHERE id = 'WC-128';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/anysberg-nature-reserve' WHERE id = 'WC-129';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/gamkaberg-campsite' WHERE id = 'WC-130';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/fossil-ridge-eco-lodge' WHERE id = 'WC-131';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/ou-kraal' WHERE id = 'WC-132';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/tierkloof-eco-lodge' WHERE id = 'WC-133';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/swartberg-nature-reserve-gamkaskloof-die-hel' WHERE id = 'WC-134';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/swartberg-nature-reserve-gamkaskloof-die-hel' WHERE id = 'WC-135';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/swartberg-nature-reserve-gamkaskloof-die-hel' WHERE id = 'WC-136';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/swartberg-nature-reserve-gamkaskloof-die-hel' WHERE id = 'WC-137';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/swartberg-nature-reserve-gamkaskloof-die-hel' WHERE id = 'WC-138';
UPDATE stays SET website = 'https://www.africamps.com' WHERE id = 'WC-139';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/mbali-collection' WHERE id = 'WC-153';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/oudebosch-eco-cabins' WHERE id = 'WC-154';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/una-eco-venue-at-stony-point-nature-reserve' WHERE id = 'WC-155';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/boosmansbos-shelter' WHERE id = 'WC-156';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/helderfontein' WHERE id = 'WC-157';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/grootvadersbosch-cabins' WHERE id = 'WC-158';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/grootvadersbosch-campsites' WHERE id = 'WC-159';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/marloth-nature-reserve' WHERE id = 'WC-160';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/marloth-nature-reserve' WHERE id = 'WC-161';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/marloth-nature-reserve' WHERE id = 'WC-162';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/marloth-nature-reserve' WHERE id = 'WC-163';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/marloth-nature-reserve' WHERE id = 'WC-164';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/marloth-nature-reserve' WHERE id = 'WC-165';
UPDATE stays SET website = 'https://grootvadersbosch.co.za' WHERE id = 'WC-167';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/de-mond-nature-reserve-2' WHERE id = 'WC-173';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/potberg-eco-venue-at-de-hoop-nature-reserve-2' WHERE id = 'WC-174';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/whale-trail-cottages' WHERE id = 'WC-175';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/whale-trail-cottages' WHERE id = 'WC-176';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/whale-trail-cottages' WHERE id = 'WC-177';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/whale-trail-cottages' WHERE id = 'WC-178';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/whale-trail-cottages' WHERE id = 'WC-179';
UPDATE stays SET website = 'https://www.genadendal.info' WHERE id = 'WC-180';
UPDATE stays SET website = 'https://www.grootbos.com' WHERE id = 'WC-184';
UPDATE stays SET website = 'https://www.dehoopcollection.com' WHERE id = 'WC-188';
UPDATE stays SET website = 'https://www.sanparks.org/parks/agulhas/accommodation' WHERE id = 'WC-189';
UPDATE stays SET website = 'https://www.sanparks.org/parks/bontebok/accommodation' WHERE id = 'WC-190';
UPDATE stays SET website = 'https://www.sanparks.org/parks/bontebok/accommodation' WHERE id = 'WC-191';
UPDATE stays SET website = 'https://www.sanparks.org/parks/agulhas/accommodation' WHERE id = 'WC-192';
UPDATE stays SET website = 'https://www.sanparks.org/parks/agulhas/accommodation' WHERE id = 'WC-193';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/rocherpan-nature-reserve' WHERE id = 'WC-194';
UPDATE stays SET website = 'https://westcoastdm.co.za/ganzekraal-holiday-resort/' WHERE id = 'WC-195';
UPDATE stays SET website = 'https://sbm.gov.za/cape-columbine-nature-reserve-tietiesbaai/' WHERE id = 'WC-196';
UPDATE stays SET website = 'https://www.duinepos.co.za' WHERE id = 'WC-204';
UPDATE stays SET website = 'https://www.sanparks.org/parks/west-coast/accommodation' WHERE id = 'WC-205';
UPDATE stays SET website = 'https://www.sanparks.org/parks/west-coast/accommodation' WHERE id = 'WC-206';
UPDATE stays SET website = 'https://www.sanparks.org/parks/west-coast/accommodation' WHERE id = 'WC-207';
UPDATE stays SET website = 'https://www.sanparks.org/parks/west-coast/accommodation' WHERE id = 'WC-208';
UPDATE stays SET website = 'https://www.sanparks.org/parks/west-coast/accommodation' WHERE id = 'WC-209';
UPDATE stays SET website = 'https://www.capenature.co.za/reserves/groot-winterhoek-wilderness-area' WHERE id = 'WC-210';
UPDATE stays SET website = 'https://www.capenature.co.za/accommodation/disa' WHERE id = 'WC-211';
UPDATE stays SET website = 'http://www.beaverlac.co.za' WHERE id = 'WC-213';
