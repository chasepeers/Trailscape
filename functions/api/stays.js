// GET /api/stays → { listed: ["whale", "WC-001", ...], rooms: { "WC-064": [{ name, sleeps, beds, units, included, rates: [...] }] } }
// Which stays the site may show (the provider has consented; see migrations/0005_rooms_consent.sql) and their room types
// and current nightly rates. stays.js reads it before drawing the map, stay lists and stay pages.
import { json } from "../../lib/api.js";
import { roomsOf, publicRoom } from "../../lib/rooms.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare("SELECT id FROM stays WHERE active = 1 AND consent = 1 ORDER BY id").all();
  const listed = results.map(r => r.id);
  const { results: withRooms } = await env.DB.prepare(
    "SELECT DISTINCT m.stay_id AS id FROM rooms m JOIN stays s ON s.id = m.stay_id WHERE m.active = 1 AND s.consent = 1 AND s.active = 1").all();
  const all = await roomsOf(env.DB, withRooms.map(r => r.id));
  const rooms = Object.fromEntries(Object.entries(all).map(([id, list]) => [id, list.map(publicRoom)]));
  // A minute of caching keeps the map fast; a consent switched in the back office shows within a minute.
  return json({ listed, rooms }, 200, { "Cache-Control": "public, max-age=60" });
}
