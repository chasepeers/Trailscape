// POST /api/bookings   (Instant booking stays: CapeNature, SANParks, NightsBridge. The guest pays when booking, in full or a deposit.)
// Body (sent by booking.js): { stayId, stayName, operator, checkIn, checkOut, nights, hikers, guest: { name, phone, email }, notes,
//   engine, payMethod: "card" | "eft", quote: { stayFees, serviceFee, total, estimated, currency } }
// → { ref: "HS-1101", status: "received", total, payment: { status: "stub" } }
//
// Prices are worked out here from the database, never taken from the browser. The quote the browser showed is kept
// (client_total) so mismatches can be spotted.
//
// PAYMENT IS A STUB: no gateway is connected yet, so nothing is charged and the booking waits in the back office
// with payment_status 'stub'. When a gateway is chosen, takePayment() is the one place to change.
import { json, readJson, getListedStay, cleanTrip, upsertGuest, nextRef, event, nightlyAvailability, todaySA, addDays, nightsOf, bad, HttpError,
  FEE_PP, sendEmail, notifyTo, rand, longDate } from "../../lib/api.js";

// Placeholder for the payment gateway (Peach Payments / Paystack: pre-authorise, then capture once the operator confirms).
async function takePayment(/* env, { ref, amount, method, guest } */) {
  return { status: "stub", ref: null };
}

export async function onRequestPost({ request, env, waitUntil }) {
  const db = env.DB, body = await readJson(request);
  const stay = await getListedStay(db, String(body.stayId || ""));
  if (stay.mode !== "instant") throw new HttpError(409, "This is an Easy enquire stay; use /api/enquiries");
  const t = cleanTrip(body, stay);
  if (t.checkIn < addDays(todaySA(), 1)) throw bad("Pick a check-in date from tomorrow onwards");
  const payMethod = body.payMethod === "eft" ? "eft" : "card";

  // Every night must be open with enough beds.
  const nights = await nightlyAvailability(db, stay, t.checkIn, addDays(t.checkOut, -1));
  const short = nights.filter(n => n.status !== "open" || n.bedsLeft < t.hikers);
  if (short.length) throw new HttpError(409, "Some of those nights are no longer available", short.map(n => ({ date: n.date, bedsLeft: n.bedsLeft, status: n.status })));
  const stayFees = nights.reduce((sum, n) => sum + n.price * t.hikers, 0);
  const serviceFee = FEE_PP * t.hikers, total = stayFees + serviceFee;
  const clientTotal = Number.isFinite(+(body.quote || {}).total) ? Math.round(+body.quote.total) : null;

  const guestId = await upsertGuest(db, t.guest);
  const ref = await nextRef(db);
  const pay = await takePayment(env, { ref, amount: total, method: payMethod, guest: t.guest });

  // One transaction: the booking, the beds it takes each night, and the log.
  await db.batch([
    db.prepare(`INSERT INTO bookings (ref, stay_id, guest_id, source, check_in, check_out, nights, hikers, notes, stay_fees, service_fee, total,
        client_total, pay_method, payment_status, payment_ref) VALUES (?, ?, ?, 'instant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(ref, stay.id, guestId, t.checkIn, t.checkOut, t.nights, t.hikers, t.notes, stayFees, serviceFee, total, clientTotal, payMethod, pay.status, pay.ref),
    ...nightsOf(t.checkIn, t.checkOut).map(d => db.prepare("INSERT INTO blocked_nights (stay_id, date, beds, source, ref) VALUES (?, ?, ?, 'booking', ?)").bind(stay.id, d, t.hikers, ref)),
    event(db, ref, "guest", `Booked ${t.hikers} hikers, ${t.checkIn} to ${t.checkOut}, ${rand(total)} by ${payMethod}`),
    event(db, ref, "system", pay.status === "stub" ? "No payment gateway yet: nothing charged. Book with the operator and collect payment by hand." : `Payment ${pay.status}`),
    ...(clientTotal !== null && clientTotal !== total ? [event(db, ref, "system", `Price check: site showed ${rand(clientTotal)}, server price is ${rand(total)}`)] : []),
  ]);

  waitUntil(Promise.all([
    sendEmail(env, { to: notifyTo(env), replyTo: t.guest.email, subject: `New booking ${ref}: ${stay.name}, ${t.checkIn}`,
      text: `${t.guest.name} (${t.guest.email}, ${t.guest.phone}) booked ${stay.name} through ${stay.engine || "instant booking"}.\n\n`
        + `${longDate(t.checkIn)} to ${longDate(t.checkOut)}, ${t.nights} night(s), ${t.hikers} hiker(s).\n`
        + `Stay ${rand(stayFees)} + fee ${rand(serviceFee)} = ${rand(total)}. Payment: ${pay.status} (${payMethod}).\n\nNotes: ${t.notes || "none"}\n\n`
        + `Book it in ${stay.engine || "the operator's system"} and record their reference: https://trailscape.co.za/admin.html#${ref}` }),
    sendEmail(env, { to: t.guest.email, subject: `Booking received: ${stay.name} (${ref})`,
      text: `Hi ${t.guest.name.split(" ")[0]},\n\nWe've received your booking for ${stay.name}, ${longDate(t.checkIn)} to ${longDate(t.checkOut)}, `
        + `${t.hikers} hiker(s). Total ${rand(total)}.\n\nWe'll email your confirmation as soon as it's booked with the stay. Your reference is ${ref}.\n\nTrailscape` }),
  ]).catch(e => console.error("booking emails", e)));

  return json({ ref, status: "received", total, payment: { status: pay.status } }, 201);
}
