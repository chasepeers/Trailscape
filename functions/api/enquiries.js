// POST /api/enquiries   (Easy enquire stays: no payment now. We email the stay, reply within ~48 h, and the guest pays once availability is confirmed)
// Body (sent by booking.js): { stayId, stayName, operator, checkIn, checkOut, nights, hikers, guest: { name, phone, email },
//   notes, flexibleDates, guidePrice: { stayFees, serviceFee, total, currency } }
// → { ref: "HS-1100", status: "enquiry" }
import { json, readJson, getStay, cleanTrip, upsertGuest, nextRef, event, todaySA, addDays, daysBetween, bad, HttpError,
  sendEmail, notifyTo, rand, longDate } from "../../lib/api.js";
import { askOperator } from "../../lib/operator.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const db = env.DB, body = await readJson(request);
  const stay = await getStay(db, String(body.stayId || ""));
  if (stay.mode === "instant") throw new HttpError(409, "This stay takes instant bookings; use /api/bookings");
  const t = cleanTrip(body, stay);
  if (t.checkIn < addDays(todaySA(), 1)) throw bad("Pick a start date from tomorrow onwards");
  if (daysBetween(todaySA(), t.checkIn) > 540) throw bad("That date is too far ahead to ask about yet");
  const flexible = body.flexibleDates ? 1 : 0;
  const guideTotal = Number.isFinite(+(body.guidePrice || {}).total) ? Math.round(+body.guidePrice.total) : null;

  const guestId = await upsertGuest(db, t.guest);
  const ref = await nextRef(db);
  await db.batch([
    db.prepare(`INSERT INTO enquiries (ref, stay_id, guest_id, check_in, check_out, nights, hikers, flexible, notes, guide_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(ref, stay.id, guestId, t.checkIn, t.checkOut, t.nights, t.hikers, flexible, t.notes, guideTotal),
    event(db, ref, "guest", `Enquiry sent: ${t.hikers} hikers, ${t.checkIn} to ${t.checkOut}${flexible ? ", dates flexible" : ""}`),
  ]);

  const who = stay.op_key === "cn" || stay.op_key === "sp" ? stay.operator : stay.name;
  // Email the stay first, so the admin note can say whether that worked; then the admin and the guest.
  waitUntil((async () => {
    const asked = await askOperator(env, db, ref).catch(e => { console.error("askOperator", e); return { ok: false, reason: "error" }; });
    const stayLine = asked.ok ? `We've emailed ${stay.name} at ${asked.to}. Their answer will update this enquiry automatically.`
      : asked.reason === "no_email" ? `ACTION NEEDED: ${stay.name} has no booking email on file, so it was NOT emailed. Add one under Stays in the back office, then press "Email the stay" on this enquiry.`
      : `ACTION NEEDED: emailing ${stay.name} failed (${asked.reason}). Press "Email the stay" on this enquiry to try again.`;
    await Promise.all([
      sendEmail(env, { to: notifyTo(env), replyTo: t.guest.email, subject: `${asked.ok ? "" : "[Action] "}New enquiry ${ref}: ${stay.name}, ${t.checkIn}`,
        text: `${t.guest.name} (${t.guest.email}, ${t.guest.phone}) asked about ${stay.name} (${stay.operator}).\n\n`
          + `${longDate(t.checkIn)} to ${longDate(t.checkOut)}, ${t.nights} night(s), ${t.hikers} hiker(s)${flexible ? ", dates flexible" : ""}.\n`
          + `Guide total shown: ${guideTotal ? rand(guideTotal) : "n/a"}\nOperator contact: ${stay.booking_email || "none on file"} ${stay.booking_phone || ""}\n\n`
          + `${stayLine}\n\nNotes: ${t.notes || "none"}\n\nOpen the back office: https://trailscape.co.za/admin.html#${ref}` }),
      sendEmail(env, { to: t.guest.email, replyTo: notifyTo(env), subject: `We're checking ${stay.name} for you (${ref})`,
        text: `Hi ${t.guest.name.split(" ")[0]},\n\nThanks for your enquiry. We're asking ${who} about ${longDate(t.checkIn)} to ${longDate(t.checkOut)} `
          + `for ${t.hikers} hiker(s), and will email you within about 48 hours with availability and the exact price. Nothing has been charged.\n\n`
          + `Your reference is ${ref}. Just reply to this email if anything changes.\n\nTrailscape` }),
    ]);
  })().catch(e => console.error("enquiry emails", e)));

  return json({ ref, status: "enquiry" }, 201);
}
