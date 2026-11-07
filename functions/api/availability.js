// GET /api/availability?stay=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD   (instant-booking stays)
// → [{ date, status: "open" | "closed" | "notopen", bedsLeft, price }]   price is per person per night
import { json, dateRange, getStay, nightlyAvailability, HttpError } from "../../lib/api.js";

export async function onRequestGet({ request, env }) {
  const { stay: id, from, to } = dateRange(new URL(request.url));
  const stay = await getStay(env.DB, id);
  if (stay.mode !== "instant") throw new HttpError(409, "This stay is booked on enquiry; use /api/booked");
  return json(await nightlyAvailability(env.DB, stay, from, to), 200, { "Cache-Control": "public, max-age=30" });
}
