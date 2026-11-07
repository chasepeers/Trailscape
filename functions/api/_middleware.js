// Runs before every /api/* request: same-site check on changes, back-office access, and errors returned as JSON.
import { json, HttpError } from "../../lib/api.js";
import { currentUser } from "../../lib/auth.js";

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder(), [ha, hb] = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  try {
    if (!env.DB) throw new HttpError(503, "Database not connected");

    // Anything that changes data must come from this site (stops other sites posting with a visitor's cookie).
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) throw new HttpError(403, "Requests must come from the Trailscape site");
    }

    if (url.pathname.startsWith("/api/admin")) {
      // The admin account's signed-in session, or the ADMIN_TOKEN secret as a bearer token (for scripts).
      const user = await currentUser(env.DB, request);
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const tokenOk = !!(token && env.ADMIN_TOKEN && await timingSafeEqual(token, env.ADMIN_TOKEN));
      if (!(user && user.role === "admin") && !tokenOk) throw new HttpError(401, "Please sign in with the Trailscape admin account");
      data.admin = user ? user.email : "token";
    }
    return await next();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...(err.detail ? { detail: err.detail } : {}) }, err.status);
    console.error(request.method, url.pathname, err && err.stack || err);
    return json({ error: "Something went wrong on our side. Please try again." }, 500);
  }
}
