// Prints the SQL that creates (or resets the password of) the Trailscape admin account.
// Usage: ADMIN_PASSWORD='…' node scripts/make-admin.mjs [email]   → paste the output into the D1 console
// The password itself is never stored; only a PBKDF2 hash (same format the API checks, see lib/auth.js).
import { webcrypto as crypto } from "node:crypto";

const email = (process.argv[2] || "hello@trailscape.co.za").toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 10) { console.error("Set ADMIN_PASSWORD (at least 10 characters)"); process.exit(1); }

const iterations = 100000, enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
const b64 = b => Buffer.from(b).toString("base64");
const hash = `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(bits)}`;

console.log(`INSERT INTO users (email, name, role, password_hash) VALUES ('${email}', 'Trailscape', 'admin', '${hash}')
ON CONFLICT(email) DO UPDATE SET role = 'admin', password_hash = excluded.password_hash;
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = '${email}');`);
