// GET /api/booked?stay=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD   (enquiry stays)
// → [{ date, bedsBooked }] for nights with any beds taken: our confirmed bookings, manual blocks and owner calendars.
import { json, dateRange, getStay, blockedBeds } from "../../lib/api.js";

export async function onRequestGet({ request, env }) {
  const { stay: id, from, to } = dateRange(new URL(request.url));
  const stay = await getStay(env.DB, id);
  const blocked = await blockedBeds(env.DB, stay.id, from, to);
  const out = Object.entries(blocked).sort(([a], [b]) => a < b ? -1 : 1).map(([date, beds]) => ({ date, bedsBooked: Math.min(stay.beds, beds) }));
  return json(out, 200, { "Cache-Control": "public, max-age=30" });
}
