// Rooms and nightly rates of a stay (migrations/0005_rooms_consent.sql), shared by the back office and the public API.
import { bad, isDate } from "./api.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
const str = (v, max = 300) => { const s = v == null ? "" : String(v).trim(); return s ? s.slice(0, max) : null; };
const int = (v, name, min = 0) => {
  if (v == null || v === "") return null;
  const n = Math.round(Number(String(v).replace(/[R\s,]/gi, "")));
  if (!Number.isFinite(n) || n < min) throw bad(`${name} must be a whole number${min ? " from " + min : ""}`);
  return n;
};
const date = (v, name) => { const s = str(v, 10); if (s == null) return null; if (!isDate(s)) throw bad(`${name} must be a date (YYYY-MM-DD)`); return s; };

// Cleans room fields from the back office or an imported row. partial = only the fields present (for updates).
export function cleanRoom(b, partial = false) {
  const out = {};
  const has = k => !partial || b[k] !== undefined;
  if (has("name")) { const n = str(b.name, 120); if (!n) throw bad("Every room needs a name"); out.name = n; }
  if (has("sleeps")) out.sleeps = int(b.sleeps, "Sleeps", 1);
  if (has("bedSetup")) out.bed_setup = str(b.bedSetup, 200);
  if (has("units")) out.units = int(b.units, "Units", 1) ?? 1;
  if (has("included")) out.included = str(b.included, 400);
  if (has("notes")) out.notes = str(b.notes, 600);
  if (has("sort")) out.sort = int(b.sort, "Order") ?? 0;
  if (b.active !== undefined) out.active = b.active ? 1 : 0;
  return out;
}
export function cleanRate(b, partial = false) {
  const out = {};
  const has = k => !partial || b[k] !== undefined;
  if (has("label")) out.label = str(b.label, 80) || "Standard";
  if (has("amount")) { const a = int(b.amount, "Rate", 1); if (a == null) throw bad("Every rate needs an amount in rand"); out.amount = a; }
  if (has("basis")) {
    const v = String(b.basis || "unit").toLowerCase();
    out.basis = /person|pp|pppn/.test(v) ? "person" : /unit|room|site|hut|night|^$/.test(v) ? "unit" : null;
    if (!out.basis) throw bad("Rate basis is per unit or per person");
  }
  if (has("validFrom")) out.valid_from = date(b.validFrom, "From date");
  if (has("validTo")) out.valid_to = date(b.validTo, "To date");
  if (out.valid_from && out.valid_to && out.valid_to < out.valid_from) throw bad("The rate's end date is before its start date");
  if (has("minNights")) out.min_nights = int(b.minNights, "Minimum nights", 1);
  if (has("extraPerson")) out.extra_person = int(b.extraPerson, "Extra person rate");
  if (has("notes")) out.notes = str(b.notes, 400);
  return out;
}

export const insertSql = (table, obj) => {
  const cols = Object.keys(obj);
  return [`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map(c => obj[c])];
};
export const updateSql = (table, obj, id) => {
  const cols = Object.keys(obj);
  return [`UPDATE ${table} SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ${NOW} WHERE id = ?`, [...cols.map(c => obj[c]), id]];
};
export const touchRates = (db, stayId) => db.prepare(`UPDATE stays SET rates_checked_at = ${NOW} WHERE id = ?`).bind(stayId);

// Rooms (with their rates) of the given stays: { stayId: [room, ...] }. Archived rooms only when all = true.
export async function roomsOf(db, stayIds, all = false) {
  const out = {};
  if (!stayIds.length) return out;
  // D1 allows 100 bound values per statement, so long lists go in chunks.
  if (stayIds.length > 90) {
    for (let i = 0; i < stayIds.length; i += 90) Object.assign(out, await roomsOf(db, stayIds.slice(i, i + 90), all));
    return out;
  }
  const marks = stayIds.map(() => "?").join(",");
  const [{ results: rooms }, { results: rates }] = await Promise.all([
    db.prepare(`SELECT * FROM rooms WHERE stay_id IN (${marks}) ${all ? "" : "AND active = 1"} ORDER BY sort, id`).bind(...stayIds).all(),
    db.prepare(`SELECT r.* FROM room_rates r JOIN rooms m ON m.id = r.room_id WHERE m.stay_id IN (${marks})
      ORDER BY r.valid_from IS NOT NULL, r.valid_from, r.amount`).bind(...stayIds).all(),
  ]);
  const byRoom = {};
  for (const r of rates) (byRoom[r.room_id] ||= []).push(r);
  for (const m of rooms) (out[m.stay_id] ||= []).push({ ...m, rates: byRoom[m.id] || [] });
  return out;
}

// What the public site shows of a room: no internal notes or ids beyond what it needs.
export const publicRoom = m => ({
  name: m.name, sleeps: m.sleeps, beds: m.bed_setup, units: m.units, included: m.included,
  rates: m.rates.filter(r => !r.valid_to || r.valid_to >= new Date().toISOString().slice(0, 10))
    .map(r => ({ label: r.label, amount: r.amount, basis: r.basis, from: r.valid_from, to: r.valid_to, minNights: r.min_nights, extra: r.extra_person })),
});

// ---------- CSV export / import (one line per rate; a room without rates gets one line with an empty rate) ----------
export const CSV_COLS = ["stay_id", "stay_name", "room_id", "room_name", "sleeps", "bed_setup", "units", "included",
  "rate_id", "rate_label", "amount", "basis", "valid_from", "valid_to", "min_nights", "extra_person", "rate_notes"];

const cell = v => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv(rows) { return [CSV_COLS.join(","), ...rows.map(r => CSV_COLS.map(c => cell(r[c])).join(","))].join("\r\n") + "\r\n"; }

export function parseCsv(text) {
  const rows = []; let row = [], c = "", q = false;
  text = String(text || "").replace(/^﻿/, "");
  // Excel in some regions saves with semicolons; the header line tells us which.
  const first = text.split(/\r?\n/, 1)[0], sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(c); c = ""; }
    else if (ch === "\n") { row.push(c); rows.push(row); row = []; c = ""; }
    else if (ch !== "\r") c += ch;
  }
  if (c !== "" || row.length) { row.push(c); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(x => x.trim() !== "")).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
