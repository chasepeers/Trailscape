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
//   PATCH  /api/admin/stays/WC-064                  { pricePp?, beds?, mode?, engineRef?, bookingEmail?, bookingPhone?, active? }
import { json, readJson, bad, HttpError, getStay, isDate, addDays, daysBetween, nightsOf, event, dateRange, FEE_PP, rand } from "../../../lib/api.js";
import { askOperator, recordAnswer, answerUrl, replyAddress } from "../../../lib/operator.js";

const ENQ_STATUS = ["new", "asked_operator", "operator_replied", "offer_sent", "accepted", "declined", "unavailable", "cancelled"];
const BK_STATUS = ["received", "booking_operator", "confirmed", "cancelled", "failed"];
const PAY_STATUS = ["none", "stub", "held", "paid", "refunded", "failed"];
const OPEN_ENQ = "('new','asked_operator','operator_replied','offer_sent')", OPEN_BK = "('received','booking_operator')";

export async function onRequest({ request, env, params, data }) {
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
