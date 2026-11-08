// Easy enquire, operator side: email the stay for availability, then record its answer and tell the guest.
//
// Flow
//   1. POST /api/enquiries saves the enquiry and calls askOperator(). We email stays.booking_email from OPERATOR_FROM with
//      Reply-To hs1100.<token>@REPLY_DOMAIN, plus a link to a one-click answer page (/api/operator/HS-1100?t=<token>).
//   2a. The stay clicks the link and answers Yes (with an optional total) or No → recordAnswer(). The guest is emailed
//       automatically: an offer when there is a price, a "sorry" when there is no space.
//   2b. The stay replies to the email instead → Resend Receiving posts to /api/inbound/resend → recordInbound().
//       The reply is saved on the enquiry, status becomes "operator_replied", and the admin is emailed to read it and
//       record the answer in the back office (which then emails the guest, as in 2a). Free text is never guessed at.
import { sendEmail, notifyTo, event, rand, longDate, FEE_PP, HttpError, bad } from "./api.js";

export const OPEN_FOR_ANSWER = ["new", "asked_operator", "operator_replied", "offer_sent", "unavailable"];
const SITE = "https://trailscape.co.za";
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export const replyDomain = env => env.REPLY_DOMAIN || "";
export const replyAddress = (env, ref, token) => replyDomain(env) ? `${ref.toLowerCase().replace("-", "")}.${token}@${replyDomain(env)}` : null;
export const answerUrl = (ref, token) => `${SITE}/api/operator/${encodeURIComponent(ref)}?t=${token}`;

export function newToken() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789", b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, x => a[x % a.length]).join("");
}

export async function loadEnquiry(db, ref) {
  const e = await db.prepare(`SELECT e.*, g.name AS guest_name, g.email AS guest_email, g.phone AS guest_phone,
      s.name AS stay_name, s.operator, s.op_key, s.booking_email, s.booking_phone, s.fixed_nights
    FROM enquiries e JOIN guests g ON g.id = e.guest_id JOIN stays s ON s.id = e.stay_id WHERE e.ref = ?`).bind(ref).first();
  if (!e) throw new HttpError(404, "No enquiry with that reference");
  return e;
}

export function tokenOk(e, token) {
  if (!e.op_token || typeof token !== "string" || token.length !== e.op_token.length) return false;
  let d = 0; for (let i = 0; i < token.length; i++) d |= token.charCodeAt(i) ^ e.op_token.charCodeAt(i);
  return d === 0;
}

const firstName = n => String(n || "").trim().split(/\s+/)[0] || "there";
const hikersTxt = n => `${n} hiker${n === 1 ? "" : "s"}`;
const nightsTxt = n => `${n} night${n === 1 ? "" : "s"}`;
const escHtml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- 1. ask the stay ----------
// Returns { ok: true } or { ok: false, reason }. Never throws for a missing email so a new enquiry still succeeds.
export async function askOperator(env, db, ref, actor = "system") {
  const e = await loadEnquiry(db, ref);
  const to = (e.booking_email || "").trim();
  if (!to) {
    await event(db, ref, "system", "Not emailed to the stay: no booking email on file").run();
    return { ok: false, reason: "no_email" };
  }
  if (!env.RESEND_API_KEY) {
    await event(db, ref, "system", "Not emailed to the stay: email is switched off (RESEND_API_KEY missing)").run();
    return { ok: false, reason: "email_off" };
  }
  const token = e.op_token || newToken();
  const reply = replyAddress(env, ref, token) || notifyTo(env);
  const link = answerUrl(ref, token);
  const again = !!e.op_asked_at;
  const subject = `${again ? "Reminder: " : ""}Availability request ${ref}: ${e.stay_name}, ${longDate(e.check_in)}`;
  const lines = [
    `Hello ${e.stay_name},`,
    "",
    `A hiker has asked Trailscape (trailscape.co.za) to check availability with you:`,
    "",
    `  Arriving:   ${longDate(e.check_in)}`,
    `  Leaving:    ${longDate(e.check_out)} (${nightsTxt(e.nights)})`,
    `  Group:      ${hikersTxt(e.hikers)}`,
    `  Lead guest: ${e.guest_name}`,
    ...(e.flexible ? ["  Dates:      flexible, so other dates close by are welcome"] : []),
    ...(e.notes ? ["", `Their note: ${e.notes}`] : []),
    "",
    `Do you have space? The quickest way to answer is this link (no login, takes 20 seconds):`,
    link,
    "",
    `Or simply reply to this email with yes or no and the total price for the group.`,
    `Please quote ${ref} if you contact us another way.`,
    "",
    "Thank you,",
    "Trailscape",
    `${notifyTo(env)}`,
  ];
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#1d2a22;max-width:560px">
  <p>Hello ${escHtml(e.stay_name)},</p>
  <p>A hiker has asked Trailscape (<a href="${SITE}">trailscape.co.za</a>) to check availability with you:</p>
  <table style="border-collapse:collapse;margin:8px 0 14px">
    <tr><td style="padding:3px 14px 3px 0;color:#5b6b60">Arriving</td><td><b>${escHtml(longDate(e.check_in))}</b></td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#5b6b60">Leaving</td><td><b>${escHtml(longDate(e.check_out))}</b> (${nightsTxt(e.nights)})</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#5b6b60">Group</td><td><b>${hikersTxt(e.hikers)}</b></td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#5b6b60">Lead guest</td><td>${escHtml(e.guest_name)}</td></tr>
    ${e.flexible ? `<tr><td style="padding:3px 14px 3px 0;color:#5b6b60">Dates</td><td>Flexible: other dates close by are welcome</td></tr>` : ""}
  </table>
  ${e.notes ? `<p style="color:#5b6b60">Their note: “${escHtml(e.notes)}”</p>` : ""}
  <p><a href="${link}" style="display:inline-block;background:#1f6f43;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">Answer in one click</a></p>
  <p>Or simply reply to this email with yes or no and the total price for the group.<br>Please quote <b>${ref}</b> if you contact us another way.</p>
  <p>Thank you,<br>Trailscape<br><a href="mailto:${escHtml(notifyTo(env))}">${escHtml(notifyTo(env))}</a></p></div>`;
  const text = lines.join("\n");
  const from = env.OPERATOR_FROM || env.MAIL_FROM || "Trailscape <hello@trailscape.co.za>";
  const sent = await sendEmail(env, { to, from, replyTo: reply, subject, text, html, headers: { "X-Trailscape-Ref": ref } });
  if (!sent.ok) {
    await event(db, ref, "system", `Emailing the stay failed (${sent.status || "error"})`).run();
    return { ok: false, reason: "send_failed" };
  }
  await db.batch([
    db.prepare(`UPDATE enquiries SET op_token = ?, op_asked_at = ?, status = CASE WHEN status = 'new' THEN 'asked_operator' ELSE status END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE ref = ?`).bind(token, now(), ref),
    db.prepare(`INSERT INTO enquiry_messages (ref, direction, channel, from_addr, to_addr, subject, body, provider_id) VALUES (?, 'out', 'email', ?, ?, ?, ?, ?)`)
      .bind(ref, from, to, subject, text, sent.id || null),
    event(db, ref, actor, `${again ? "Reminder emailed" : "Availability request emailed"} to ${to}`),
  ]);
  return { ok: true, to };
}

// ---------- 2a. a structured answer (answer page or back office) ----------
// answer: 'available' | 'unavailable'; price: the stay's total for the group in rand (optional); note: free text.
export async function recordAnswer(env, db, ref, { answer, price, note }, actor) {
  const e = await loadEnquiry(db, ref);
  if (!["available", "unavailable"].includes(answer)) throw bad("answer must be available or unavailable");
  if (!OPEN_FOR_ANSWER.includes(e.status)) throw new HttpError(409, `This enquiry is already ${e.status.replace("_", " ")}`);
  let p = null;
  if (answer === "available" && price != null && String(price).trim() !== "") {
    p = Math.round(+String(price).replace(/[^\d.]/g, ""));
    if (!(p > 0) || p > 5_000_000) throw bad("Please enter the total in rand, e.g. 4800");
  }
  note = String(note || "").trim().slice(0, 2000) || null;

  const same = e.op_answer === answer && (e.op_price ?? null) === p;
  const fee = FEE_PP * e.hikers;
  const status = answer === "unavailable" ? "unavailable" : p != null ? "offer_sent" : "operator_replied";
  const stmts = [
    db.prepare(`UPDATE enquiries SET op_answer = ?, op_answered_at = ?, op_price = ?, op_note = ?, status = ?,
      quoted_stay = COALESCE(?, quoted_stay), quoted_fee = CASE WHEN ? IS NULL THEN quoted_fee ELSE ? END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE ref = ?`)
      .bind(answer, now(), p, note, status, p, p, fee, ref),
    event(db, ref, actor, answer === "available"
      ? `Stay has space${p != null ? `: ${rand(p)} for the group (+ fee ${rand(fee)})` : ", price still to come"}${note ? `. Note: ${note}` : ""}`
      : `Stay is full for these dates${note ? `. Note: ${note}` : ""}`),
  ];
  if (actor === "operator") stmts.push(db.prepare(`INSERT INTO enquiry_messages (ref, direction, channel, from_addr, subject, body) VALUES (?, 'in', 'form', ?, ?, ?)`)
    .bind(ref, e.booking_email, "Answer page", `${answer === "available" ? "Yes, we have space" : "No, we're full"}${p != null ? `. Total ${rand(p)}` : ""}${note ? `\n\n${note}` : ""}`));
  await db.batch(stmts);

  // Tell the guest when there is something definite to say, once per distinct answer.
  const jobs = [];
  if (!same && (answer === "unavailable" || p != null)) {
    jobs.push(guestUpdate(env, e, answer, p, fee).then(r => r.ok && event(db, ref, "system", `Guest emailed: ${answer === "unavailable" ? "no space" : "offer " + rand(p + fee)}`).run()));
  }
  if (actor === "operator") {
    jobs.push(sendEmail(env, { to: notifyTo(env), subject: `${ref}: ${e.stay_name} answered ${answer === "available" ? "YES" : "NO"}`,
      text: `${e.stay_name} answered ${ref} on the answer page.\n\n${answer === "available" ? `Space available${p != null ? `, ${rand(p)} for ${hikersTxt(e.hikers)}` : ", no price given yet: please ask them for it"}` : "No space for those dates"}.\n`
        + (note ? `Their note: ${note}\n` : "")
        + `\n${!same && (answer === "unavailable" || p != null) ? "The guest has been emailed automatically." : "The guest has NOT been emailed yet."}\n\nBack office: ${SITE}/admin.html#${ref}` }));
  }
  await Promise.all(jobs).catch(err => console.error("answer emails", err));
  return { status, emailedGuest: !same && (answer === "unavailable" || p != null) };
}

function guestUpdate(env, e, answer, price, fee) {
  const hi = `Hi ${firstName(e.guest_name)},\n\n`;
  const trip = `${e.stay_name}, ${longDate(e.check_in)} to ${longDate(e.check_out)} (${nightsTxt(e.nights)}, ${hikersTxt(e.hikers)})`;
  if (answer === "unavailable") {
    return sendEmail(env, { to: e.guest_email, replyTo: notifyTo(env), subject: `${e.stay_name} is full on your dates (${e.ref})`,
      text: hi + `We've heard back from ${e.stay_name}: unfortunately they're full for ${longDate(e.check_in)} to ${longDate(e.check_out)}. `
        + `Nothing has been charged.\n\n${e.flexible ? "You said your dates are flexible, so we'll look at nearby dates and similar stays and get back to you.\n\n" : ""}`
        + `You can also browse other stays at ${SITE}/#stays, or reply to this email and we'll help you find another spot.\n\nYour reference is ${e.ref}.\n\nTrailscape` });
  }
  return sendEmail(env, { to: e.guest_email, replyTo: notifyTo(env), subject: `Good news: ${e.stay_name} has space (${e.ref})`,
    text: hi + `${e.stay_name} has confirmed they have space for your trip:\n\n  ${trip}\n\n`
      + `  Stay:            ${rand(price)}\n  Trailscape fee:  ${rand(fee)}\n  Total:           ${rand(price + fee)}\n\n`
      + `To go ahead, just reply to this email and we'll send payment details and lock in your booking. `
      + `Space isn't held until it's paid, so the sooner the better.\n\nYour reference is ${e.ref}. Nothing has been charged yet.\n\nTrailscape` });
}

// ---------- 2b. an emailed reply ----------
// msg: { id, from, to: [], cc: [], subject, text, html, headers }
export async function recordInbound(env, db, msg) {
  const fromAddr = addrOf(msg.from);
  const rcpts = [].concat(msg.to || [], msg.cc || [], msg.received_for || []).map(addrOf).filter(Boolean);
  const textFull = (msg.text && String(msg.text).trim()) || htmlToText(msg.html || "");
  const body = trimQuoted(textFull).slice(0, 8000), bodyFull = textFull.slice(0, 20000);

  // Match by reply address first (hs1100.token@reply...), then by a reference in the subject from the stay's own address.
  let e = null, how = "";
  for (const r of rcpts) {
    const m = /^hs(\d+)\.([a-z0-9]{6,20})@/i.exec(r);
    if (!m) continue;
    const cand = await db.prepare("SELECT ref, op_token FROM enquiries WHERE ref = ?").bind("HS-" + m[1]).first();
    if (cand && tokenOk(cand, m[2].toLowerCase())) { e = await loadEnquiry(db, cand.ref); how = "reply address"; break; }
  }
  if (!e) {
    const m = /\bHS-?(\d{3,})\b/i.exec(msg.subject || "") || /\bHS-(\d{3,})\b/.exec(body);
    if (m) {
      const cand = await loadEnquiry(db, "HS-" + m[1]).catch(() => null);
      if (cand && cand.booking_email && sameAddr(cand.booking_email, fromAddr)) { e = cand; how = "reference from the stay's address"; }
    }
  }

  if (!e) {
    const r = await db.prepare("INSERT OR IGNORE INTO inbound_unmatched (provider_id, from_addr, to_addr, subject, body) VALUES (?, ?, ?, ?, ?)")
      .bind(msg.id || null, fromAddr, rcpts.join(", "), msg.subject || "", bodyFull).run();
    if (r.meta.changes) await sendEmail(env, { to: notifyTo(env), replyTo: fromAddr || undefined, subject: `Unmatched reply: ${msg.subject || "(no subject)"}`,
      text: `A reply came in to ${rcpts.join(", ") || "the reply address"} that doesn't match any enquiry.\n\nFrom: ${msg.from}\nSubject: ${msg.subject || ""}\n\n${body || "(empty)"}` });
    return { matched: false };
  }

  const ins = await db.prepare(`INSERT OR IGNORE INTO enquiry_messages (ref, direction, channel, from_addr, to_addr, subject, body, body_full, provider_id)
    VALUES (?, 'in', 'email', ?, ?, ?, ?, ?, ?)`).bind(e.ref, msg.from || fromAddr, rcpts.join(", "), msg.subject || "", body, bodyFull, msg.id || null).run();
  if (!ins.meta.changes) return { matched: true, ref: e.ref, duplicate: true };

  const fromStay = e.booking_email && sameAddr(e.booking_email, fromAddr);
  await db.batch([
    db.prepare(`UPDATE enquiries SET status = CASE WHEN status IN ('new', 'asked_operator') THEN 'operator_replied' ELSE status END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE ref = ?`).bind(e.ref),
    event(db, e.ref, "operator", `Email reply from ${fromAddr}${fromStay ? "" : " (not the stay's address on file)"}: ${oneLine(body, 140)}`),
  ]);
  await sendEmail(env, { to: notifyTo(env), replyTo: fromAddr || undefined, subject: `Reply on ${e.ref}: ${e.stay_name}`,
    text: `${e.stay_name} replied about ${e.ref} (${e.guest_name}, ${longDate(e.check_in)} to ${longDate(e.check_out)}, ${hikersTxt(e.hikers)}).\n`
      + `Matched by ${how}.\n\n----\n${body || "(empty)"}\n----\n\n`
      + `Record their answer in the back office to email the guest: ${SITE}/admin.html#${e.ref}\n(Replying to this email goes straight to the stay.)` });
  return { matched: true, ref: e.ref };
}

// ---------- text helpers ----------
export function addrOf(s) {
  if (!s) return "";
  const m = /<([^>]+)>/.exec(String(s));
  return (m ? m[1] : String(s)).trim().toLowerCase();
}
const sameAddr = (a, b) => addrOf(a) === addrOf(b);
const oneLine = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t || "(empty)"; };

export function htmlToText(html) {
  return String(html)
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n> (quoted text)\n")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Keep only the new part of a reply: stop at the quoted original.
export function trimQuoted(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], next = (lines[i + 1] || "");
    if (/^\s*>/.test(l)) break;
    if (/^\s*On .{4,200}wrote:\s*$/i.test(l) || (/^\s*On /i.test(l) && /wrote:\s*$/i.test(next))) break;
    if (/^\s*Op .{4,200}(schreef|het .* geskryf).*:\s*$/i.test(l)) break;
    if (/^\s*-{2,}\s*(Original Message|Forwarded message|Oorspronklike)/i.test(l)) break;
    if (/^\s*_{10,}\s*$/.test(l)) break;
    if (/^\s*(From|Van):\s/i.test(l) && /^\s*(Sent|Date|Gestuur|Datum|To|Aan):\s/i.test(next)) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
