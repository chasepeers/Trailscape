// GET /api/me/trips → { trips: [...] }  enquiries and bookings made with the signed-in user's email address.
// An enquiry that has become a booking is shown once, as the booking.
import { json, HttpError } from "../../../lib/api.js";
import { currentUser } from "../../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(env.DB, request);
  if (!user) throw new HttpError(401, "Please sign in");
  const { results } = await env.DB.prepare(`
    SELECT 'enquiry' AS kind, e.ref, e.stay_id, e.check_in, e.check_out, e.nights, e.hikers, e.status,
           COALESCE(e.quoted_stay + e.quoted_fee, e.guide_total) AS total, NULL AS payment_status, e.created_at
      FROM enquiries e JOIN guests g ON g.id = e.guest_id WHERE g.email = ?1 AND e.booking_ref IS NULL
    UNION ALL
    SELECT 'booking', b.ref, b.stay_id, b.check_in, b.check_out, b.nights, b.hikers, b.status, b.total, b.payment_status, b.created_at
      FROM bookings b JOIN guests g ON g.id = b.guest_id WHERE g.email = ?1
    ORDER BY check_in DESC LIMIT 200`).bind(user.email).all();
  return json({ trips: results });
}
