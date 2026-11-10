// Back-office API. Every call needs "Authorization: Bearer <ADMIN_TOKEN>" (checked in ../_middleware.js).
//
//   GET    /api/admin/queue?show=open|all          enquiries and bookings, newest first
//   GET    /api/admin/requests/HS-1100             one enquiry or booking with guest, stay and log
//   POST   /api/admin/requests/HS-1100             { status?, quotedStay?, engineRef?, paymentStatus?, note? }
//   POST   /api/admin/requests/HS-1100/ask         enquiry: email the stay (again) for availability
//   POST   /api/admin/requests/HS-1100/answer      enquiry: { answer: available|unavailable, price?, note? } record the stay's
//            answer (e.g. from an emailed reply). Emails the guest an offer (with a price) or a "full" note, as the answer page does.
//   GET    /api/admin/inbound                      replies that matched no enquiry
//            An enquiry set to "accepted" becomes a booking (source 'enquiry') at the quoted price and holds the beds.
//            A booking set to "cancelled" or "failed" frees its beds.
//   GET    /api/admin/blocks?stay=&from=&to=        blocked nights with their ids
//   POST   /api/admin/blocks                        { stayId, from, to, beds?, note? }  blocks nights from..to-1 (whole stay if no beds)
//   DELETE /api/admin/blocks/123
//   PUT    /api/admin/availability                  { stayId, nights: [{ date, status, bedsLeft, price? }] }  (instant stays)
//   GET    /api/admin/stays?q=
//   PATCH  /api/admin/stays/WC-064                  { pricePp?, beds?, mode?, engineRef?, bookingEmail?, bookingPhone?, active?,
//            consent?, consentNote?, contactName?, ratesUrl?, website?, ratesChecked? }   consent decides whether the stay shows on the site
//   GET    /api/admin/venues?q=&consent=yes|no&email=missing&rooms=missing   every stay with contact, consent and room counts
//   GET    /api/admin/venues/WC-064                 one stay with all its rooms and rates
//   POST   /api/admin/venues/WC-064/rooms           { name, sleeps?, bedSetup?, units?, included?, notes?, rates?: [rate] }
//   PATCH  /api/admin/rooms/12  DELETE /api/admin/rooms/12  POST /api/admin/rooms/12/rates  { label?, amount, basis: unit|person,
//            validFrom?, validTo?, minNights?, extraPerson?, notes? }   PATCH / DELETE /api/admin/rates/34
//   GET    /api/admin/rooms-csv                     every room and rate as a spreadsheet (one line per rate)
//   POST   /api/admin/rooms-import                  { csv, apply? }  checks the file (apply false) or saves it; never deletes
//   GET    /api/admin/outreach?q=&status=none|open|<status>&due=1&email=has&parks=1   venues with their outreach state
//   GET    /api/admin/outreach/WC-058               one venue's outreach record and history
//   POST   /api/admin/outreach/WC-058               { status?, template?, sentTo?, sentFrom?, sentAt?, repliedAt?, followUpOn?, note?,
//            followUpSent?, logNote?, consent?, consentNote? }  creates or updates the record; consent true also switches consent on
//   DELETE /api/admin/outreach/WC-058               back to "not contacted" (history kept)
import { json, readJson, bad, HttpError, getStay, isDate, addDays, daysBetween, nightsOf, event, dateRange, FEE_PP, rand } from "../../../lib/api.js";
import { askOperator, recordAnswer, answerUrl, replyAddress } from "../../../lib/operator.js";
import { cleanRoom, cleanRate, insertSql, updateSql, touchRates, roomsOf, toCsv, parseCsv } from "../../../lib/rooms.js";

const ENQ_STATUS = ["new", "asked_operator", "operator_replied", "offer_sent", "accepted", "declined", "unavailable", "cancelled"];
const BK_STATUS = ["received", "booking_operator", "confirmed", "cancelled", "failed"];
const PAY_STATUS = ["none", "stub", "held", "paid", "refunded", "failed"];
const OUT_STATUS = ["planned", "sent", "replied", "yes", "declined", "no_reply", "bounced"];
const OUT_LABEL = { planned: "Planned", sent: "Sent", replied: "Replied", yes: "Said yes", declined: "Declined", no_reply: "No reply", bounced: "Bounced" };
const OPEN_ENQ ="('new','asked_operator','operator_replied','offer_sent')", OPEN_BK = "('received','booking_operator')";

export async function onRequest(ctx) {
  try { return await handle(ctx); }
  catch (err) {
    // Until migration 0006 is applied, the Outreach view says so instead of showing a raw database error.
    if (/no such (table: outreach|column: website)/.test(String(err && err.message))) throw new HttpError(503, "This needs the database update in migrations/0006_outreach.sql, which hasn't been applied yet.");
    throw err;
  }
}

async function handle({ request, env, params, data }) {
  const db = env.DB, method = request.method, url = new URL(request.url);
  const [what, id, action] = params.path || [];

  if (what === "requests" && id && action) {
    if (method !== "POST") throw new HttpError(405, "Use POST");
    const rec = await loadRequest(db, id, env);
    if (rec.type !== "enquiry") throw bad("Only enquiries go to the stay by email");
    if (action === "ask") {
      const r = await askOperator(env, db, rec.ref, "admin");
      if (!r.ok) throw bad(r.reason === "no_email" ? "This stay has no booking email. Add one under Stays first."
        : r.reason === "email_off" ? "Email is switched off (RESEND_API_KEY missing)." : "Sending failed. Check the Resend dashboard and try again.");
      return json(await loadRequest(db, rec.ref, env));
    }
    if (action === "answer") {
      const b = await readJson(request);
      const r = await recordAnswer(env, db, rec.ref, { answer: b.answer, price: b.price, note: b.note }, "admin");
      return json({ ...(await loadRequest(db, rec.ref, env)), emailedGuest: r.emailedGuest });
    }
    throw new HttpError(404, "Not found");
  }

  if (what === "inbound" && method === "GET") {
    const { results } = await db.prepare("SELECT * FROM inbound_unmatched ORDER BY id DESC LIMIT 100").all();
    return json(results);
  }

  if (what === "queue" && method === "GET") {
    const open = url.searchParams.get("show") !== "all";
    const { results } = await db.prepare(`
      SELECT 'enquiry' AS type, e.ref, e.status, e.stay_id, s.name AS stay_name, s.operator, g.name AS guest_name, g.email,
             e.check_in, e.check_out, e.nights, e.hikers, COALESCE(e.quoted_stay + e.quoted_fee, e.guide_total) AS total, NULL AS payment_status, e.created_at AS created_at, e.updated_at AS updated_at
        FROM enquiries e JOIN stays s ON s.id = e.stay_id JOIN guests g ON g.id = e.guest_id ${open ? `WHERE e.status IN ${OPEN_ENQ}` : ""}
      UNION ALL
      SELECT 'booking', b.ref, b.status, b.stay_id, s.name, s.operator, g.name, g.email,
             b.check_in, b.check_out, b.nights, b.hikers, b.total, b.payment_status, b.created_at, b.updated_at
        FROM bookings b JOIN stays s ON s.id = b.stay_id JOIN guests g ON g.id = b.guest_id ${open ? `WHERE b.status IN ${OPEN_BK}` : ""}
      ORDER BY created_at DESC LIMIT 300`).all();
    const counts = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM enquiries WHERE status IN ${OPEN_ENQ}) AS open_enquiries,
      (SELECT COUNT(*) FROM bookings WHERE status IN ${OPEN_BK}) AS open_bookings,
      (SELECT COALESCE(SUM(total), 0) FROM bookings WHERE status = 'confirmed') AS confirmed_value,
      (SELECT COALESCE(SUM(service_fee), 0) FROM bookings WHERE status = 'confirmed') AS confirmed_fees`).first();
    return json({ counts, items: results });
  }

  if (what === "requests" && id) {
    const rec = await loadRequest(db, id, env);
    if (method === "GET") return json(rec);
    if (method === "POST") return json(await updateRequest(db, rec, await readJson(request), env));
  }

  if (what === "blocks") {
    if (method === "GET") {
      const { stay, from, to } = dateRange(url);
      const { results } = await db.prepare("SELECT * FROM blocked_nights WHERE stay_id = ? AND date >= ? AND date <= ? ORDER BY date").bind(stay, from, to).all();
      return json(results);
    }
    if (method === "POST" && !id) {
      const b = await readJson(request), stay = await getStay(db, String(b.stayId || ""));
      if (!isDate(b.from) || !isDate(b.to) || b.to <= b.from) throw bad("from and to must be dates, to after from (to is the first free night)");
      if (daysBetween(b.from, b.to) > 366) throw bad("Block at most a year at a time");
      const beds = b.beds == null ? stay.beds : Number(b.beds);
      if (!Number.isInteger(beds) || beds < 1) throw bad("beds must be a whole number from 1");
      const note = String(b.note || "").slice(0, 200) || null;
      await db.batch(nightsOf(b.from, b.to).map(d => db.prepare("INSERT INTO blocked_nights (stay_id, date, beds, source, ref) VALUES (?, ?, ?, 'manual', ?)").bind(stay.id, d, beds, note)));
      return json({ ok: true, nights: daysBetween(b.from, b.to) }, 201);
    }
    if (method === "DELETE" && id) {
      const r = await db.prepare("DELETE FROM blocked_nights WHERE id = ? AND source != 'booking'").bind(Number(id)).run();
      if (!r.meta.changes) throw new HttpError(404, "No such manual block (booking nights are freed by cancelling the booking)");
      return json({ ok: true });
    }
  }

  if (what === "availability" && method === "PUT") {
    const b = await readJson(request, 200_000), stay = await getStay(db, String(b.stayId || ""));
    if (!Array.isArray(b.nights) || !b.nights.length || b.nights.length > 550) throw bad("nights must be a list of 1 to 550 nights");
    const stmts = b.nights.map(n => {
      if (!isDate(n.date) || !["open", "closed", "notopen"].includes(n.status)) throw bad("Each night needs a date and a status of open, closed or notopen", n);
      const left = Math.max(0, Math.round(+n.bedsLeft || 0)), price = n.price == null ? null : Math.round(+n.price);
      return db.prepare(`INSERT INTO availability (stay_id, date, status, beds_left, price_pp) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(stay_id, date) DO UPDATE SET status = excluded.status, beds_left = excluded.beds_left, price_pp = excluded.price_pp,
        synced_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).bind(stay.id, n.date, n.status, left, price);
    });
    await db.batch(stmts);
    return json({ ok: true, nights: stmts.length });
  }

  // ---------- Venues: every stay with its contact, consent, rooms and rates ----------
  if (what === "venues" && method === "GET" && !id) {
    const q = "%" + (url.searchParams.get("q") || "").trim() + "%", c = url.searchParams.get("consent");
    const where = ["(s.name LIKE ? OR s.id LIKE ? OR s.operator LIKE ? OR s.kind LIKE ?)"];
    if (c === "yes") where.push("s.consent = 1"); else if (c === "no") where.push("s.consent = 0");
    if (url.searchParams.get("email") === "missing") where.push("(s.booking_email IS NULL OR s.booking_email = '')");
    if (url.searchParams.get("rooms") === "missing") where.push("NOT EXISTS (SELECT 1 FROM rooms m WHERE m.stay_id = s.id AND m.active = 1)");
    const { results } = await db.prepare(`
      SELECT s.id, s.name, s.operator, s.op_key, s.kind, s.mode, s.booking_email, s.booking_phone, s.contact_name, s.consent, s.consent_at,
             s.rates_url, s.rates_checked_at,
             (SELECT COUNT(*) FROM rooms m WHERE m.stay_id = s.id AND m.active = 1) AS rooms,
             (SELECT COUNT(*) FROM room_rates r JOIN rooms m ON m.id = r.room_id WHERE m.stay_id = s.id AND m.active = 1) AS rates,
             (SELECT MIN(r.amount) FROM room_rates r JOIN rooms m ON m.id = r.room_id WHERE m.stay_id = s.id AND m.active = 1) AS from_rate
        FROM stays s WHERE ${where.join(" AND ")} ORDER BY s.consent DESC, s.name LIMIT 400`).bind(q, q, q, q).all();
    const counts = await db.prepare(`SELECT COUNT(*) AS total, SUM(consent) AS consented,
      SUM(booking_email IS NULL OR booking_email = '') AS no_email,
      SUM(NOT EXISTS (SELECT 1 FROM rooms m WHERE m.stay_id = stays.id AND m.active = 1)) AS no_rooms FROM stays`).first();
    return json({ counts, items: results });
  }
  if (what === "venues" && id && !action && method === "GET") {
    const s = await db.prepare("SELECT * FROM stays WHERE id = ?").bind(id).first();
    if (!s) throw new HttpError(404, "Unknown stay");
    return json({ ...s, roomList: (await roomsOf(db, [id], true))[id] || [] });
  }
  if (what === "venues" && id && action === "rooms" && method === "POST") {
    const s = await db.prepare("SELECT id FROM stays WHERE id = ?").bind(id).first();
    if (!s) throw new HttpError(404, "Unknown stay");
    const b = await readJson(request), room = cleanRoom(b);
    const rates = (Array.isArray(b.rates) ? b.rates : []).map(r => cleanRate(r));   // checked before anything is saved
    if (room.sort == null) room.sort = await db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM rooms WHERE stay_id = ?").bind(id).first("n");
    const [sql, vals] = insertSql("rooms", { stay_id: id, ...room });
    const roomId = (await db.prepare(sql + " RETURNING id").bind(...vals).first("id"));
    const stmts = rates.map(r => { const [q2, v2] = insertSql("room_rates", { room_id: roomId, ...r }); return db.prepare(q2).bind(...v2); });
    await db.batch([...stmts, touchRates(db, id)]);
    return json({ ok: true, roomId }, 201);
  }

  if (what === "rooms" && id) {
    const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(Number(id)).first();
    if (!room) throw new HttpError(404, "Unknown room");
    if (action === "rates" && method === "POST") {
      const [sql, vals] = insertSql("room_rates", { room_id: room.id, ...cleanRate(await readJson(request)) });
      await db.batch([db.prepare(sql).bind(...vals), touchRates(db, room.stay_id)]);
      return json({ ok: true }, 201);
    }
    if (!action && method === "PATCH") {
      const ch = cleanRoom(await readJson(request), true);
      if (!Object.keys(ch).length) throw bad("Nothing to change");
      const [sql, vals] = updateSql("rooms", ch, room.id);
      await db.batch([db.prepare(sql).bind(...vals), touchRates(db, room.stay_id)]);
      return json({ ok: true });
    }
    if (!action && method === "DELETE") {
      await db.batch([db.prepare("DELETE FROM room_rates WHERE room_id = ?").bind(room.id), db.prepare("DELETE FROM rooms WHERE id = ?").bind(room.id), touchRates(db, room.stay_id)]);
      return json({ ok: true });
    }
  }
  if (what === "rates" && id) {
    const rate = await db.prepare("SELECT r.*, m.stay_id FROM room_rates r JOIN rooms m ON m.id = r.room_id WHERE r.id = ?").bind(Number(id)).first();
    if (!rate) throw new HttpError(404, "Unknown rate");
    if (method === "PATCH") {
      const ch = cleanRate(await readJson(request), true);
      const from = ch.valid_from !== undefined ? ch.valid_from : rate.valid_from, to = ch.valid_to !== undefined ? ch.valid_to : rate.valid_to;
      if (from && to && to < from) throw bad("The rate's end date is before its start date");
      if (!Object.keys(ch).length) throw bad("Nothing to change");
      const [sql, vals] = updateSql("room_rates", ch, rate.id);
      await db.batch([db.prepare(sql).bind(...vals), touchRates(db, rate.stay_id)]);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      await db.batch([db.prepare("DELETE FROM room_rates WHERE id = ?").bind(rate.id), touchRates(db, rate.stay_id)]);
      return json({ ok: true });
    }
  }

  // ---------- Outreach: asking providers for consent to list them ----------
  if (what === "outreach" && method === "GET" && !id) {
    const q = "%" + (url.searchParams.get("q") || "").trim() + "%", st = url.searchParams.get("status") || "";
    const where = ["(s.name LIKE ? OR s.id LIKE ? OR s.operator LIKE ? OR s.booking_email LIKE ?)"];
    // CapeNature and SANParks are consented public operators; outreach is for everyone else unless asked for.
    if (url.searchParams.get("parks") !== "1") where.push("s.op_key NOT IN ('cn', 'sp')");
    if (st === "none") where.push("o.stay_id IS NULL");
    else if (st === "open") where.push("o.status IN ('sent', 'no_reply')");
    else if (OUT_STATUS.includes(st)) where.push("o.status = ?");
    if (url.searchParams.get("due") === "1") where.push("o.follow_up_on IS NOT NULL AND o.follow_up_on <= date('now') AND o.status IN ('sent', 'no_reply', 'replied')");
    if (url.searchParams.get("email") === "has") where.push("s.booking_email IS NOT NULL AND s.booking_email != ''");
    const binds = [q, q, q, q, ...(OUT_STATUS.includes(st) ? [st] : [])];
    const { results } = await db.prepare(`
      SELECT s.id, s.name, s.operator, s.op_key, s.booking_email, s.contact_name, s.consent,
             o.status, o.template, o.sent_to, o.sent_at, o.replied_at, o.follow_up_on, o.follow_ups, o.updated_at
        FROM stays s LEFT JOIN outreach o ON o.stay_id = s.id WHERE ${where.join(" AND ")}
       ORDER BY (o.follow_up_on IS NULL), o.follow_up_on, (o.stay_id IS NULL), o.updated_at DESC, s.name LIMIT 400`).bind(...binds).all();
    const counts = await db.prepare(`SELECT COUNT(o.stay_id) AS contacted,
        COALESCE(SUM(o.status IN ('sent', 'no_reply')), 0) AS awaiting,
        COALESCE(SUM(o.status = 'yes'), 0) AS yes,
        COALESCE(SUM(o.follow_up_on IS NOT NULL AND o.follow_up_on <= date('now') AND o.status IN ('sent', 'no_reply', 'replied')), 0) AS due,
        SUM(o.stay_id IS NULL) AS not_contacted
      FROM stays s LEFT JOIN outreach o ON o.stay_id = s.id WHERE s.op_key NOT IN ('cn', 'sp')`).first();
    return json({ counts, items: results });
  }
  if (what === "outreach" && id) {
    // SELECT * so this works before and after migration 0006 adds stays.website.
    const full = await db.prepare("SELECT * FROM stays WHERE id = ?").bind(id).first();
    if (!full) throw new HttpError(404, "Unknown stay");
    const s = Object.fromEntries(["id", "name", "operator", "op_key", "booking_email", "booking_phone", "contact_name", "website", "consent", "consent_at", "consent_note"].map(k => [k, full[k] ?? null]));
    if (method === "POST") {
      const b = await readJson(request), cur = await db.prepare("SELECT * FROM outreach WHERE stay_id = ?").bind(id).first();
      const row = { status: "sent", template: null, sent_to: null, sent_from: null, sent_at: null, replied_at: null, follow_up_on: null, follow_ups: 0, note: null, ...(cur || {}) };
      const notes = [];
      if (b.status !== undefined) {
        if (!OUT_STATUS.includes(b.status)) throw bad("Unknown outreach status");
        if (b.status !== row.status || !cur) notes.push(cur ? `Status: ${OUT_LABEL[row.status]} → ${OUT_LABEL[b.status]}` : `Status: ${OUT_LABEL[b.status]}`);
        row.status = b.status;
      }
      for (const [k, col] of [["sentAt", "sent_at"], ["repliedAt", "replied_at"], ["followUpOn", "follow_up_on"]]) {
        if (b[k] === undefined) continue;
        const v = b[k] ? String(b[k]) : null;
        if (v && !isDate(v)) throw bad(k + " must be a date (YYYY-MM-DD)");
        row[col] = v;
      }
      for (const [k, col, max] of [["template", "template", 40], ["sentTo", "sent_to", 200], ["sentFrom", "sent_from", 200], ["note", "note", 1000]])
        if (b[k] !== undefined) row[col] = b[k] ? String(b[k]).trim().slice(0, max) : null;
      if (b.followUpSent) { row.follow_ups = (row.follow_ups || 0) + 1; notes.push(`Follow-up ${row.follow_ups} sent`); }
      if (b.logNote) notes.push(String(b.logNote).slice(0, 1000));
      const stmts = [db.prepare(`INSERT INTO outreach (stay_id, status, template, sent_to, sent_from, sent_at, replied_at, follow_up_on, follow_ups, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stay_id) DO UPDATE SET status = excluded.status, template = excluded.template, sent_to = excluded.sent_to, sent_from = excluded.sent_from,
            sent_at = excluded.sent_at, replied_at = excluded.replied_at, follow_up_on = excluded.follow_up_on, follow_ups = excluded.follow_ups,
            note = excluded.note, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`)
        .bind(id, row.status, row.template, row.sent_to, row.sent_from, row.sent_at, row.replied_at, row.follow_up_on, row.follow_ups, row.note),
        ...notes.map(t => db.prepare("INSERT INTO outreach_log (stay_id, text) VALUES (?, ?)").bind(id, t))];
      if (b.consent === true && !s.consent) {
        stmts.push(db.prepare("UPDATE stays SET consent = 1, consent_at = ?, consent_note = COALESCE(?, consent_note), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
          .bind(new Date().toISOString().slice(0, 19) + "Z", b.consentNote ? String(b.consentNote).slice(0, 300) : null, id),
          db.prepare("INSERT INTO outreach_log (stay_id, text) VALUES (?, 'Consent switched on: shown on the map')").bind(id));
      }
      await db.batch(stmts);
    } else if (method === "DELETE") {
      await db.batch([db.prepare("DELETE FROM outreach WHERE stay_id = ?").bind(id), db.prepare("INSERT INTO outreach_log (stay_id, text) VALUES (?, 'Outreach record cleared')").bind(id)]);
    } else if (method !== "GET") throw new HttpError(405, "Use GET, POST or DELETE");
    const o = await db.prepare("SELECT * FROM outreach WHERE stay_id = ?").bind(id).first();
    const { results: log } = await db.prepare("SELECT at, actor, text FROM outreach_log WHERE stay_id = ? ORDER BY id DESC LIMIT 100").bind(id).all();
    const fresh = await db.prepare("SELECT consent, consent_at, consent_note FROM stays WHERE id = ?").bind(id).first();
    return json({ ...s, ...fresh, outreach: o || null, log });
  }

  // Spreadsheet round trip: download every room and rate, edit in Excel or Google Sheets, upload again.
  if (what === "rooms-csv" && method === "GET") {
    const { results } = await db.prepare(`
      SELECT s.id AS stay_id, s.name AS stay_name, m.id AS room_id, m.name AS room_name, m.sleeps, m.bed_setup, m.units, m.included,
             r.id AS rate_id, r.label AS rate_label, r.amount, r.basis, r.valid_from, r.valid_to, r.min_nights, r.extra_person, r.notes AS rate_notes
        FROM stays s LEFT JOIN rooms m ON m.stay_id = s.id AND m.active = 1 LEFT JOIN room_rates r ON r.room_id = m.id
       ${url.searchParams.get("all") ? "" : "WHERE m.id IS NOT NULL OR s.consent = 1"}
       ORDER BY s.name, m.sort, m.id, r.valid_from, r.amount`).all();
    return new Response("﻿" + toCsv(results), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="trailscape-rooms-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  if (what === "rooms-import" && method === "POST") {
    const b = await readJson(request, 2_000_000), apply = !!b.apply;
    const rows = parseCsv(b.csv);
    if (!rows.length) throw bad("The file has no rows");
    if (!("stay_id" in rows[0]) || !("room_name" in rows[0])) throw bad("The file needs the stay_id and room_name columns. Start from a download of this list.");
    const { results: stayRows } = await db.prepare("SELECT id FROM stays").all();
    const stayIds = new Set(stayRows.map(s => s.id));
    const { results: roomRows } = await db.prepare("SELECT id, stay_id FROM rooms").all();
    const roomStay = new Map(roomRows.map(r => [r.id, r.stay_id]));
    const { results: rateRows } = await db.prepare("SELECT id, room_id FROM room_rates").all();
    const rateRoom = new Map(rateRows.map(r => [r.id, r.room_id]));
    const sum = { roomsNew: 0, roomsUpdated: 0, ratesNew: 0, ratesUpdated: 0, skipped: 0 }, errors = [], touched = new Set();
    const newRooms = new Map();   // "stay|room name" → rows creating that room, so one new room can carry several rates
    const stmts = [], updatedRooms = new Set();
    rows.forEach((r, i) => {
      const line = i + 2;
      try {
        if (!r.room_name && !r.amount) { sum.skipped++; return; }
        if (!stayIds.has(r.stay_id)) throw bad(`Unknown stay_id "${r.stay_id}"`);
        const room = cleanRoom({ name: r.room_name, sleeps: r.sleeps, bedSetup: r.bed_setup, units: r.units, included: r.included }, true);
        const hasRate = r.amount !== "" && r.amount != null;
        const rate = hasRate ? cleanRate({ label: r.rate_label, amount: r.amount, basis: r.basis, validFrom: r.valid_from, validTo: r.valid_to,
          minNights: r.min_nights, extraPerson: r.extra_person, notes: r.rate_notes }) : null;
        touched.add(r.stay_id);
        const roomId = r.room_id ? Number(r.room_id) : null;
        if (roomId) {
          if (roomStay.get(roomId) !== r.stay_id) throw bad(`room_id ${roomId} does not belong to ${r.stay_id}`);
          if (!updatedRooms.has(roomId)) { const [s1, v1] = updateSql("rooms", room, roomId); stmts.push(db.prepare(s1).bind(...v1)); updatedRooms.add(roomId); sum.roomsUpdated++; }
          const rateId = r.rate_id ? Number(r.rate_id) : null;
          if (rateId) {
            if (rateRoom.get(rateId) !== roomId) throw bad(`rate_id ${rateId} does not belong to room ${roomId}`);
            if (rate) { const [s2, v2] = updateSql("room_rates", rate, rateId); stmts.push(db.prepare(s2).bind(...v2)); sum.ratesUpdated++; }
          } else if (rate) {
            const [s2, v2] = insertSql("room_rates", { room_id: roomId, ...rate }); stmts.push(db.prepare(s2).bind(...v2)); sum.ratesNew++;
          }
        } else {
          if (!room.name) throw bad("room_name is empty");
          const key = r.stay_id + "|" + room.name.toLowerCase();
          if (!newRooms.has(key)) { newRooms.set(key, { stay: r.stay_id, room, rates: [] }); sum.roomsNew++; }
          if (rate) { newRooms.get(key).rates.push(rate); sum.ratesNew++; }
        }
      } catch (err) { errors.push(`Line ${line}: ${err.message}`); }
    });
    if (errors.length || !apply) return json({ applied: false, ...sum, stays: touched.size, errors: errors.slice(0, 50) });
    // New rooms need their id before their rates, so they go one by one; everything else goes in one batch.
    for (const n of newRooms.values()) {
      const [s1, v1] = insertSql("rooms", { stay_id: n.stay, ...n.room });
      const rid = await db.prepare(s1 + " RETURNING id").bind(...v1).first("id");
      for (const rate of n.rates) { const [s2, v2] = insertSql("room_rates", { room_id: rid, ...rate }); stmts.push(db.prepare(s2).bind(...v2)); }
    }
    stmts.push(...[...touched].map(sid => touchRates(db, sid)));
    if (stmts.length) await db.batch(stmts);
    return json({ applied: true, ...sum, stays: touched.size, errors: [] });
  }

  if (what === "stays") {
    if (method === "GET" && !id) {
      const q = "%" + (url.searchParams.get("q") || "") + "%";
      const { results } = await db.prepare("SELECT * FROM stays WHERE name LIKE ? OR id LIKE ? OR operator LIKE ? ORDER BY mode, name LIMIT 300").bind(q, q, q).all();
      return json(results);
    }
    if (method === "GET") {
      const s = await db.prepare("SELECT * FROM stays WHERE id = ?").bind(id).first();
      if (!s) throw new HttpError(404, "Unknown stay");
      return json(s);
    }
    if (method === "PATCH" && id) {
      const b = await readJson(request), sets = [], vals = [];
      const put = (col, v) => { sets.push(`${col} = ?`); vals.push(v); };
      if (b.pricePp != null) { const p = Math.round(+b.pricePp); if (!(p > 0)) throw bad("pricePp must be above 0"); put("price_pp", p); put("price_estimated", 0); }
      if (b.beds != null) { const n = Math.round(+b.beds); if (!(n > 0)) throw bad("beds must be above 0"); put("beds", n); }
      if (b.mode != null) { if (!["instant", "enquiry"].includes(b.mode)) throw bad("mode is instant or enquiry"); put("mode", b.mode); }
      for (const [k, col] of [["engineRef", "engine_ref"], ["bookingEmail", "booking_email"], ["bookingPhone", "booking_phone"], ["engine", "engine"]])
        if (b[k] !== undefined) put(col, b[k] ? String(b[k]).slice(0, 200) : null);
      if (b.active != null) put("active", b.active ? 1 : 0);
      for (const [k, col, max] of [["contactName", "contact_name", 120], ["ratesUrl", "rates_url", 500], ["consentNote", "consent_note", 300], ["website", "website", 500]])
        if (b[k] !== undefined) put(col, b[k] ? String(b[k]).trim().slice(0, max) : null);
      if (b.website && !/^https?:\/\/\S+\.\S+/i.test(String(b.website).trim())) throw bad("The website should be a full link starting with https://");
      if (b.bookingEmail && !/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(String(b.bookingEmail).trim())) throw bad("That booking email doesn't look right");
      if (b.consent != null) { put("consent", b.consent ? 1 : 0); if (b.consent) put("consent_at", new Date().toISOString().slice(0, 19) + "Z"); }
      if (b.ratesChecked) put("rates_checked_at", new Date().toISOString().slice(0, 19) + "Z");
      if (!sets.length) throw bad("Nothing to change");
      const r = await db.prepare(`UPDATE stays SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).bind(...vals, id).run();
      if (!r.meta.changes) throw new HttpError(404, "Unknown stay");
      return json(await db.prepare("SELECT * FROM stays WHERE id = ?").bind(id).first());
    }
  }

  throw new HttpError(404, "Not found");
}

async function loadRequest(db, ref, env = {}) {
  for (const type of ["enquiry", "booking"]) {
    const table = type === "enquiry" ? "enquiries" : "bookings";
    const row = await db.prepare(`SELECT t.*, g.name AS guest_name, g.email AS guest_email, g.phone AS guest_phone, g.consent_at,
        s.name AS stay_name, s.operator, s.op_key, s.engine, s.engine_ref AS stay_engine_ref, s.booking_email, s.booking_phone, s.price_pp, s.price_estimated, s.beds
      FROM ${table} t JOIN guests g ON g.id = t.guest_id JOIN stays s ON s.id = t.stay_id WHERE t.ref = ?`).bind(ref).first();
    if (row) {
      const { results: log } = await db.prepare("SELECT at, actor, text FROM events WHERE ref = ? ORDER BY id").bind(ref).all();
      if (type === "booking") return { type, ...row, log };
      const { results: messages } = await db.prepare("SELECT id, direction, channel, from_addr, to_addr, subject, body, at FROM enquiry_messages WHERE ref = ? ORDER BY id").bind(ref).all();
      const { op_token, ...rest } = row;
      return { type, ...rest, log, messages,
        answerLink: op_token ? answerUrl(ref, op_token) : null, replyAddress: op_token ? replyAddress(env, ref, op_token) : null };
    }
  }
  throw new HttpError(404, "No enquiry or booking with that reference");
}

async function updateRequest(db, rec, b, env) {
  const stmts = [], notes = [];
  const table = rec.type === "enquiry" ? "enquiries" : "bookings";
  const sets = [], vals = [];
  const put = (col, v) => { sets.push(`${col} = ?`); vals.push(v); };

  if (b.status != null && b.status !== rec.status) {
    if (!(rec.type === "enquiry" ? ENQ_STATUS : BK_STATUS).includes(b.status)) throw bad("Unknown status for " + rec.type);
    put("status", b.status); notes.push(`Status: ${rec.status} → ${b.status}`);
  }
  if (rec.type === "enquiry" && b.quotedStay != null) {
    const q = Math.round(+b.quotedStay); if (!(q >= 0)) throw bad("quotedStay must be a number");
    put("quoted_stay", q); put("quoted_fee", FEE_PP * rec.hikers); notes.push(`Operator price: ${rand(q)} (+ fee ${rand(FEE_PP * rec.hikers)})`);
  }
  if (rec.type === "booking" && b.engineRef != null) { put("engine_ref", String(b.engineRef).slice(0, 100)); notes.push(`Operator reference: ${b.engineRef}`); }
  if (rec.type === "booking" && b.paymentStatus != null) {
    if (!PAY_STATUS.includes(b.paymentStatus)) throw bad("Unknown payment status");
    put("payment_status", b.paymentStatus); notes.push(`Payment: ${b.paymentStatus}`);
  }
  if (b.note) notes.push(String(b.note).slice(0, 2000));
  if (!sets.length && !notes.length) throw bad("Nothing to change");

  // Accepting an enquiry turns it into a booking at the quoted price and holds the beds.
  let bookingRef = null;
  if (rec.type === "enquiry" && b.status === "accepted") {
    const quoted = b.quotedStay != null ? Math.round(+b.quotedStay) : rec.quoted_stay;
    if (quoted == null) throw bad("Enter the operator's price (quotedStay) before marking an enquiry accepted");
    if (rec.booking_ref) throw bad("This enquiry already has booking " + rec.booking_ref);
    bookingRef = "HS-" + await db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'ref' RETURNING value").first("value");
    const fee = FEE_PP * rec.hikers;
    put("booking_ref", bookingRef);
    stmts.push(
      db.prepare(`INSERT INTO bookings (ref, stay_id, guest_id, source, check_in, check_out, nights, hikers, notes, stay_fees, service_fee, total, payment_status, status)
        VALUES (?, ?, ?, 'enquiry', ?, ?, ?, ?, ?, ?, ?, ?, 'none', 'booking_operator')`)
        .bind(bookingRef, rec.stay_id, rec.guest_id, rec.check_in, rec.check_out, rec.nights, rec.hikers, rec.notes, quoted, fee, quoted + fee),
      ...nightsOf(rec.check_in, rec.check_out).map(d => db.prepare("INSERT INTO blocked_nights (stay_id, date, beds, source, ref) VALUES (?, ?, ?, 'booking', ?)").bind(rec.stay_id, d, rec.hikers, bookingRef)),
      event(db, bookingRef, "admin", `Created from enquiry ${rec.ref} at ${rand(quoted + fee)}`),
    );
    notes.push(`Guest accepted; booking ${bookingRef} created`);
  }
  if (rec.type === "booking" && ["cancelled", "failed"].includes(b.status)) {
    stmts.push(db.prepare("DELETE FROM blocked_nights WHERE ref = ? AND source = 'booking'").bind(rec.ref));
    notes.push("Beds released");
  }

  if (sets.length) stmts.unshift(db.prepare(`UPDATE ${table} SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE ref = ?`).bind(...vals, rec.ref));
  stmts.push(...notes.map(n => event(db, rec.ref, "admin", n)));
  await db.batch(stmts);
  return { ...(await loadRequest(db, rec.ref, env)), ...(bookingRef ? { createdBooking: bookingRef } : {}) };
}
