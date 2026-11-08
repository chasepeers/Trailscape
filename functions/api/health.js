// GET /api/health → { ok, stays, email, stayReplies } : quick check that the database is connected and seeded.
import { json } from "../../lib/api.js";

export async function onRequestGet({ env }) {
  const stays = await env.DB.prepare("SELECT COUNT(*) AS n FROM stays WHERE active = 1").first("n");
  return json({ ok: true, stays, email: !!env.RESEND_API_KEY, backOffice: !!env.ADMIN_TOKEN,
    stayReplies: { replyDomain: env.REPLY_DOMAIN || null, webhook: !!env.RESEND_WEBHOOK_SECRET } });
}
