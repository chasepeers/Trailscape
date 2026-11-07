// Sign up and sign in.
//   POST /api/auth/start     { email, mode: "signin" | "signup", name?, phone? }
//        → { sent: true }                 a 6-digit code was emailed
//        → { password: true }             this account signs in with a password instead (the admin)
//   POST /api/auth/verify    { email, code }       → { user }  and sets the session cookie
//   POST /api/auth/password  { email, password }   → { user }  admin only
//   GET  /api/auth/me        → { user } (user is null when signed out)
//   POST /api/auth/logout    → { ok: true }
import { json, readJson, bad, HttpError, cleanGuest } from "../../../lib/api.js";
import { newCode, storeCode, useCode, checkPassword, checkPasswordLimit, recordPasswordFailure, createSession, sessionCookie,
  clearCookie, isSecure, currentUser, endSession, publicUser } from "../../../lib/auth.js";

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
const cleanEmail = e => { const v = String(e || "").trim().toLowerCase().slice(0, 200); if (!EMAIL_RE.test(v)) throw bad("Please give a valid email address"); return v; };
const findUser = (db, email) => db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();

async function signedIn(request, db, user) {
  const token = await createSession(db, user.id);
  return json({ user: publicUser(user) }, 200, { "Set-Cookie": sessionCookie(token, isSecure(request)) });
}

async function emailCode(env, to, code, purpose) {
  // Local testing only (.dev.vars): print the code in the server log instead of emailing it.
  if (!env.RESEND_API_KEY && env.DEV_EMAIL_LOG === "1") { console.log(`[dev] ${purpose} code for ${to}: ${code}`); return; }
  if (!env.RESEND_API_KEY) throw new HttpError(503, "Email sign-in isn't switched on yet. Please try again later.");
  const subject = `${code} is your Trailscape ${purpose === "signup" ? "sign-up" : "sign-in"} code`;
  const text = `Your Trailscape code is ${code}\n\nEnter it on the site within 10 minutes. If you didn't ask for this, you can ignore this email.\n\nTrailscape · hello@trailscape.co.za`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0d1321;max-width:420px">
    <p style="font-size:16px">Your Trailscape ${purpose === "signup" ? "sign-up" : "sign-in"} code:</p>
    <p style="font-size:32px;letter-spacing:6px;font-weight:600;margin:12px 0">${code}</p>
    <p style="font-size:14px;color:#6b7079">Enter it on the site within 10 minutes. If you didn't ask for this, you can ignore this email.</p>
    <p style="font-size:13px;color:#6b7079">Trailscape · hello@trailscape.co.za</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Trailscape <hello@trailscape.co.za>", to: [to], subject, text, html }),
  });
  if (!r.ok) {
    console.error("Resend failed", r.status, await r.text());
    throw new HttpError(502, "We couldn't send the email just now. Please try again in a minute.");
  }
}

export async function onRequest({ request, env, params }) {
  const db = env.DB, action = (params.path || [])[0], method = request.method;

  if (action === "me" && method === "GET") return json({ user: publicUser(await currentUser(db, request)) });

  if (action === "logout" && method === "POST") {
    await endSession(db, request);
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie(isSecure(request)) });
  }

  if (action === "start" && method === "POST") {
    const b = await readJson(request), email = cleanEmail(b.email);
    const existing = await findUser(db, email);
    if (existing && existing.password_hash) return json({ password: true });
    let purpose = "signin", name = null, phone = null;
    if (b.mode === "signup" && !existing) {
      ({ name, phone } = cleanGuest({ name: b.name, email, phone: b.phone }));
      purpose = "signup";
    } else if (!existing) {
      throw new HttpError(404, "There's no account with that email yet. Sign up instead.");
    }
    const code = newCode();
    await storeCode(db, { email, code, purpose, name, phone });
    await emailCode(env, email, code, purpose);
    return json({ sent: true, existing: !!existing });
  }

  if (action === "verify" && method === "POST") {
    const b = await readJson(request), email = cleanEmail(b.email);
    const row = await useCode(db, email, String(b.code || "").replace(/\s/g, ""));
    let user = await findUser(db, email);
    if (user && user.password_hash) throw new HttpError(403, "This account signs in with a password");
    if (!user) {
      if (row.purpose !== "signup" || !row.name) throw bad("Please sign up first");
      user = await db.prepare("INSERT INTO users (email, name, phone) VALUES (?, ?, ?) RETURNING *").bind(email, row.name, row.phone).first();
    }
    return signedIn(request, db, user);
  }

  if (action === "password" && method === "POST") {
    const b = await readJson(request), email = cleanEmail(b.email);
    await checkPasswordLimit(db, email);
    const user = await findUser(db, email);
    if (!user || !user.password_hash || !(await checkPassword(String(b.password || ""), user.password_hash))) {
      await recordPasswordFailure(db, email);
      throw new HttpError(401, "Wrong email or password");
    }
    return signedIn(request, db, user);
  }

  throw new HttpError(404, "Not found");
}
