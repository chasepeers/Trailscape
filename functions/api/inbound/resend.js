// POST /api/inbound/resend   Resend Receiving webhook ("email.received") for replies sent to *@REPLY_DOMAIN.
// The webhook carries only metadata, so we check its signature, then fetch the message itself from Resend's API
// and hand it to recordInbound() in lib/operator.js.
//
// Setup (Resend dashboard): receiving on reply.trailscape.co.za (MX record in Cloudflare DNS), then a webhook for
// "email.received" to https://trailscape.co.za/api/inbound/resend. Its signing secret goes in the Pages secret
// RESEND_WEBHOOK_SECRET.
import { json, HttpError, resendApi } from "../../../lib/api.js";
import { recordInbound } from "../../../lib/operator.js";

const TOLERANCE_S = 5 * 60;

// Svix signature check (Resend signs webhooks with Svix): HMAC-SHA256 over "<id>.<timestamp>.<raw body>",
// keyed with the base64 part of "whsec_...", sent as one or more space-separated "v1,<base64>" values.
export async function verifySvix(secret, headers, body, nowS = Math.floor(Date.now() / 1000)) {
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sigs = headers.get("svix-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (!/^\d+$/.test(ts) || Math.abs(nowS - Number(ts)) > TOLERANCE_S) return false;
  // Tolerate stray whitespace or quotes from pasting the secret into the dashboard.
  const b64 = String(secret).trim().replace(/^["']|["']$/g, "").replace(/^whsec_/, "").replace(/\s+/g, "");
  let keyBytes;
  try { keyBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  catch { throw new HttpError(500, "RESEND_WEBHOOK_SECRET is not a valid whsec_ secret"); }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some(s => {
    const [v, sig] = s.split(",");
    if (v !== "v1" || !sig || sig.length !== expected.length) return false;
    let d = 0; for (let i = 0; i < sig.length; i++) d |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return d === 0;
  });
}

// Errors are reported in the response body (only Resend sees it, in its webhook log) so failures can be diagnosed there.
export async function onRequestPost(ctx) {
  try { return await handle(ctx); }
  catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("inbound webhook", err && err.stack || err);
    return json({ error: "Inbound handler failed", detail: String(err && err.message || err).slice(0, 300) }, 500);
  }
}

async function handle({ request, env }) {
  if (!env.RESEND_WEBHOOK_SECRET) throw new HttpError(503, "Inbound email is not set up");
  const raw = await request.text();
  if (raw.length > 200_000) throw new HttpError(413, "Too large");
  if (!(await verifySvix(env.RESEND_WEBHOOK_SECRET, request.headers, raw))) throw new HttpError(401, "Bad signature");

  const evt = JSON.parse(raw);
  if (evt.type !== "email.received") return json({ ignored: evt.type });
  const meta = evt.data || {};
  if (!meta.email_id) throw new HttpError(400, "No email_id");

  // Fetch body and headers. If Resend can't give it to us yet, fail so the webhook is retried.
  const r = await fetch(`${resendApi(env)}/emails/receiving/${encodeURIComponent(meta.email_id)}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (!r.ok) { const t = await r.text(); console.error("Fetch received email", r.status, t); throw new HttpError(502, `Could not fetch the message from Resend (${r.status}): ${t.slice(0, 200)}`); }
  const full = await r.json();

  const result = await recordInbound(env, env.DB, {
    id: meta.email_id,
    from: full.from || meta.from,
    to: full.to || meta.to || [],
    cc: full.cc || meta.cc || [],
    received_for: full.received_for || meta.received_for || [],
    subject: full.subject ?? meta.subject,
    text: full.text,
    html: full.html,
  });
  return json({ ok: true, ...result });
}
