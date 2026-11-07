// Accounts and sessions for the Trailscape API.
// Hikers: emailed 6-digit codes (Resend). Admin: password (PBKDF2). Sessions: random token in an HttpOnly cookie.
import { HttpError, bad } from "./api.js";

export const COOKIE = "ts_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const MAX_PASSWORD_FAILURES = 8;      // per email per 15 minutes
const PBKDF2_ITERATIONS = 100000;     // the most Workers allows

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const isoIn = minutes => new Date(Date.now() + minutes * 60e3).toISOString().replace(/\.\d+Z$/, "Z");
const isoAgo = minutes => isoIn(-minutes);

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// ---------- passwords (admin only) ----------
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(bits)}`;
}
export async function checkPassword(password, stored) {
  const [alg, it, salt, hash] = String(stored || "").split("$");
  if (alg !== "pbkdf2-sha256" || !it || !salt || !hash) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: +it }, key, 256);
  return sameBytes(new Uint8Array(bits), unb64(hash));
}

// ---------- codes ----------
export function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}
const codeHash = (email, code) => sha256(`${email.toLowerCase()}:${code}`);

export async function storeCode(db, { email, code, purpose, name, phone }) {
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?").bind(email, isoAgo(60)).first("n");
  if (recent >= MAX_CODES_PER_HOUR) throw new HttpError(429, "Too many codes requested. Please wait an hour and try again.");
  // Only the newest code works: older unused ones are retired.
  await db.batch([
    db.prepare("UPDATE login_codes SET used_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE email = ? AND used_at IS NULL").bind(email),
    db.prepare("INSERT INTO login_codes (email, code_hash, purpose, name, phone, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(email, await codeHash(email, code), purpose, name || null, phone || null, isoIn(CODE_MINUTES)),
  ]);
}

// Checks a code. Returns the login_codes row when it matches; throws with a clear message otherwise.
export async function useCode(db, email, code) {
  if (!/^\d{6}$/.test(String(code || ""))) throw bad("Enter the 6-digit code from the email");
  const row = await db.prepare("SELECT * FROM login_codes WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1").bind(email).first();
  if (!row) throw bad("That code has expired or was already used. Ask for a new one.");
  if (row.expires_at < isoIn(0)) throw bad("That code has expired. Ask for a new one.");
  if (row.attempts >= MAX_CODE_ATTEMPTS) throw bad("Too many wrong tries. Ask for a new code.");
  const ok = sameBytes(enc.encode(await codeHash(email, code)), enc.encode(row.code_hash));
  if (!ok) {
    await db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    const left = MAX_CODE_ATTEMPTS - row.attempts - 1;
    throw bad(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Ask for a new code.");
  }
  await db.prepare("UPDATE login_codes SET used_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(row.id).run();
  return row;
}

// ---------- password attempts ----------
export async function checkPasswordLimit(db, email) {
  const n = await db.prepare("SELECT COUNT(*) AS n FROM password_failures WHERE email = ? AND at > ?").bind(email, isoAgo(15)).first("n");
  if (n >= MAX_PASSWORD_FAILURES) throw new HttpError(429, "Too many attempts. Please wait 15 minutes and try again.");
}
export const recordPasswordFailure = (db, email) => db.prepare("INSERT INTO password_failures (email) VALUES (?)").bind(email).run();

// ---------- sessions ----------
export async function createSession(db, userId) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
  await db.batch([
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), userId, isoIn(SESSION_DAYS * 1440)),
    db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(userId),
    db.prepare("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"),
  ]);
  return token;
}
export const sessionCookie = (token, secure = true) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
export const clearCookie = (secure = true) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
export const isSecure = request => new URL(request.url).protocol === "https:";

export function readToken(request) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}
// The signed-in user for this request, or null.
export async function currentUser(db, request) {
  const token = readToken(request);
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.email, u.name, u.phone, u.role FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).bind(await sha256(token)).first();
}
export async function endSession(db, request) {
  const token = readToken(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
export const publicUser = u => u && { email: u.email, name: u.name, phone: u.phone || "", admin: u.role === "admin" };
