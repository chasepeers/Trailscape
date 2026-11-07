// Runs before every /api/* request: back-office password check, and errors returned as JSON.
import { json, HttpError } from "../../lib/api.js";

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder(), [ha, hb] = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  try {
    if (!env.DB) throw new HttpError(503, "Database not connected");
    if (url.pathname.startsWith("/api/admin")) {
      if (!env.ADMIN_TOKEN) throw new HttpError(503, "Back office not set up: add the ADMIN_TOKEN secret in Cloudflare");
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token || !(await timingSafeEqual(token, env.ADMIN_TOKEN))) throw new HttpError(401, "Wrong or missing back-office password");
    }
    return await next();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...(err.detail ? { detail: err.detail } : {}) }, err.status);
    console.error(request.method, url.pathname, err && err.stack || err);
    return json({ error: "Something went wrong on our side. Please try again." }, 500);
  }
}
