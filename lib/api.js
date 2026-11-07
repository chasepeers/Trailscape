// Shared helpers for the Trailscape API (Cloudflare Pages Functions in functions/api/).
// Bindings (wrangler.toml and the Pages dashboard):
//   DB               D1 database "trailscape"
//   ADMIN_TOKEN      secret: back-office password, sent as "Authorization: Bearer <token>"
//   RESEND_API_KEY   secret, optional: turns on emails (new requests to NOTIFY_TO, receipts to guests)
//   NOTIFY_TO        where new-request emails go (default hello@trailscape.co.za)
//   MAIL_FROM        sender, e.g. "Trailscape <bookings@trailscape.co.za>" (domain must be verified in Resend)

export const FEE_PP = 100;          // Trailscape fee, rand per hiker per booking (same as FEE in app-core.js)
export const MAX_NIGHTS = 14;       // longest range stay the site allows
export const MAX_RANGE_DAYS = 400;  // longest date range one availability call may ask for

export class HttpError extends Error {
  constructor(status, message, detail) { super(message); this.status = status; this.detail = detail; }
}
export const bad = (msg, detail) => new HttpError(400, msg, detail);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export async function readJson(request, maxBytes = 16_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large");
  try { return JSON.parse(text); } catch { throw bad("Body must be JSON"); }
}

// ---------- dates: 'YYYY-MM-DD' strings, all in UTC ----------
const DAY = 864e5;
export const isDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"))
  && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
export const addDays = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
// Today in South Africa (UTC+2, no daylight saving), which is what "tomorrow" means to a guest.
export const todaySA = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
export function nightsOf(from, to) { const out = []; for (let d = from; d < to; d = addDays(d, 1)) out.push(d); return out; }

export function dateRange(url) {
  const stay = url.searchParams.get("stay"), from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (!stay) throw bad("stay is required");
  if (!isDate(from) || !isDate(to)) throw bad("from and to must be dates (YYYY-MM-DD)");
  if (to < from) throw bad("to is before from");
  if (daysBetween(from, to) > MAX_RANGE_DAYS) throw bad(`Ask for at most ${MAX_RANGE_DAYS} days at a time`);
  return { stay, from, to };
}

// ---------- stays and nights ----------
export async function getStay(db, id) {
  const s = await db.prepare("SELECT * FROM stays WHERE id = ? AND active = 1").bind(id).first();
  if (!s) throw new HttpError(404, "Unknown stay");
  return s;
}

// Beds already taken per night by our bookings, manual blocks and owner calendars: { date: beds }.
export async function blockedBeds(db, stayId, from, to) {
  const { results } = await db.prepare(
    "SELECT date, SUM(beds) AS beds FROM blocked_nights WHERE stay_id = ? AND date >= ? AND date <= ? GROUP BY date"
  ).bind(stayId, from, to).all();
  return Object.fromEntries(results.map(r => [r.date, r.beds]));
}

// Night-by-night availability for an instant stay. Uses the engine's synced rows where we have them;
// other nights fall back to the stay's beds minus what is blocked.
export async function nightlyAvailability(db, stay, from, to) {
  const [{ results: synced }, { results: blockRows }] = await Promise.all([
    db.prepare("SELECT date, status, beds_left, price_pp FROM availability WHERE stay_id = ? AND date >= ? AND date <= ?").bind(stay.id, from, to).all(),
    // A synced night already counts everything the engine knew at sync time, so only our bookings made since then
    // are taken off it. Nights with no synced row take off every block.
    db.prepare(`SELECT b.date, SUM(b.beds) AS beds FROM blocked_nights b
      LEFT JOIN availability a ON a.stay_id = b.stay_id AND a.date = b.date
      WHERE b.stay_id = ? AND b.date >= ? AND b.date <= ?
        AND (a.date IS NULL OR (b.source = 'booking' AND b.created_at > a.synced_at))
      GROUP BY b.date`).bind(stay.id, from, to).all(),
  ]);
  const byDate = Object.fromEntries(synced.map(r => [r.date, r]));
  const blocked = Object.fromEntries(blockRows.map(r => [r.date, r.beds]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = byDate[d];
    const left = r ? (r.status === "open" ? r.beds_left : 0) - (blocked[d] || 0) : stay.beds - (blocked[d] || 0);
    out.push({ date: d, status: r ? r.status : "open", bedsLeft: Math.max(0, Math.min(stay.beds, left)), price: (r && r.price_pp) || stay.price_pp });
  }
  return out;
}

// ---------- people and references ----------
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
export function cleanGuest(g) {
  if (!g || typeof g !== "object") throw bad("guest is required");
  const name = String(g.name || "").trim().slice(0, 120), email = String(g.email || "").trim().toLowerCase().slice(0, 200), phone = String(g.phone || "").trim().slice(0, 40);
  if (name.length < 2) throw bad("Please give the lead hiker's name");
  if (!EMAIL_RE.test(email)) throw bad("Please give a valid email address");
  if (phone.replace(/\D/g, "").length < 9) throw bad("Please give a mobile number");
  return { name, email, phone };
}
export function upsertGuest(db, g) {
  return db.prepare(`INSERT INTO guests (email, name, phone, consent_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, phone = excluded.phone, consent_at = excluded.consent_at RETURNING id`).bind(g.email, g.name, g.phone).first("id");
}
export async function nextRef(db) {
  const v = await db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'ref' RETURNING value").first("value");
  return "HS-" + v;
}
export const event = (db, ref, actor, text) => db.prepare("INSERT INTO events (ref, actor, text) VALUES (?, ?, ?)").bind(ref, actor, text);

// Common checks for a booking or enquiry request.
export function cleanTrip(body, stay) {
  const { checkIn, checkOut } = body;
  if (!isDate(checkIn) || !isDate(checkOut)) throw bad("checkIn and checkOut must be dates (YYYY-MM-DD)");
  const nights = daysBetween(checkIn, checkOut);
  if (nights < 1) throw bad("checkOut must be after checkIn");
  if (stay.fixed_nights ? nights !== stay.fixed_nights : nights > MAX_NIGHTS) throw bad(stay.fixed_nights ? `${stay.name} is booked as a ${stay.fixed_nights}-night trip` : `Stays are 1 to ${MAX_NIGHTS} nights`);
  const hikers = Number(body.hikers);
  if (!Number.isInteger(hikers) || hikers < 1) throw bad("hikers must be a whole number from 1");
  if (hikers > stay.beds) throw bad(`${stay.name} sleeps at most ${stay.beds}`);
  const notes = String(body.notes || "").trim().slice(0, 2000) || null;
  return { checkIn, checkOut, nights, hikers, notes, guest: cleanGuest(body.guest) };
}

// ---------- email (Resend), sent after the response so it never slows or breaks a request ----------
export async function sendEmail(env, { to, subject, text, replyTo }) {
  if (!env.RESEND_API_KEY) return { skipped: true };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Trailscape <hello@trailscape.co.za>", to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) console.error("Email failed", r.status, await r.text());
  return { ok: r.ok };
}
export const notifyTo = env => env.NOTIFY_TO || "hello@trailscape.co.za";
export const rand = n => "R" + Math.round(n).toLocaleString("en-ZA").replace(/[, ]/g, " ");
export const longDate = s => new Date(s + "T00:00:00Z").toLocaleDateString("en-ZA", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
