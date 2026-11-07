// Build step (Cloudflare Pages): writes trails-data.js for the Map page from OpenStreetMap.
// trail-ids.json lists each hike's OpenStreetMap hiking route relations ("rel") or named paths ("ways"), plus the
// details shown on the map. This script downloads those lines from the OpenStreetMap API, joins the pieces,
// simplifies them to about 10 m and writes them in the compact format map-layers.js reads.
// It never fails the build: if OpenStreetMap can't be reached, it writes an empty file and the map shows no trails.
// Afterwards it copies the site's files into public/, the folder Cloudflare Pages serves.
// Pages settings: build command `node build-trails.mjs`, build output directory `public`.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";

const API = "https://api.openstreetmap.org/api/0.6";
const HEADERS = { "User-Agent": "Trailscape-site-build/1.0 (static trail overlay; runs once per deploy)" };
const SKIP_ROLE = /alternative|excursion|approach|connection|escape/i;
const TOLERANCE_M = 10;

async function getJSON(path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(API + path, { headers: HEADERS });
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} for ${path}`);
    } catch (e) { if (attempt === 3) throw e; }
    await new Promise(res => setTimeout(res, 1500 * attempt));
  }
}

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
// Join way coordinate lists that touch end-to-end, flipping direction where needed.
function stitch(lists) {
  const segs = lists.filter(l => l.length > 1).map(l => l.slice());
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < segs.length; i++) for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const a = segs[i], b = segs[j];
      if (same(a[a.length - 1], b[0])) segs[i] = a.concat(b.slice(1));
      else if (same(a[a.length - 1], b[b.length - 1])) segs[i] = a.concat(b.slice().reverse().slice(1));
      else if (same(a[0], b[0])) segs[i] = b.slice().reverse().concat(a.slice(1));
      else continue;
      segs.splice(j, 1); merged = true; break outer;
    }
  }
  return segs;
}
// Douglas-Peucker in metres on a local flat projection.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const k = 111320, c = Math.cos(pts[0][1] * Math.PI / 180), P = pts.map(p => [p[0] * k * c, p[1] * k]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); const [x1, y1] = P[a], [x2, y2] = P[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = P[i]; let t = L ? ((x - x1) * dx + (y - y1) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Google polyline (1e-5), with '#' for a backslash and '!' for a backtick so it sits safely in a template literal.
function encode(pts) {
  let out = "", pl = 0, po = 0;
  const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ""; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [lo, la] of pts) { const a = Math.round(la * 1e5), o = Math.round(lo * 1e5); out += e(a - pl) + e(o - po); pl = a; po = o; }
  return out.replace(/\\/g, "#").replace(/`/g, "!");
}

const HEAD = "// Hiking trails for the Map page, generated at build time by build-trails.mjs from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0).\n" +
  "// One trail per line: name;area;type;km;match;osm link;note;encoded lines (Google polyline, 1e-5, simplified to ~10 m,\n" +
  "// with '#' standing for a backslash and '!' for a backtick), read by map-layers.js.\n";

async function main() {
  const trails = JSON.parse(readFileSync(new URL("./trail-ids.json", import.meta.url), "utf8"));
  const nodes = new Map(), ways = new Map(), rels = new Map();
  for (const id of new Set(trails.flatMap(t => t.rel || []))) {
    const j = await getJSON(`/relation/${id}/full.json`);
    for (const e of j.elements) {
      if (e.type === "node") nodes.set(e.id, [e.lon, e.lat]);
      else if (e.type === "way") ways.set(e.id, e.nodes);
      else if (e.type === "relation" && e.id === id) rels.set(id, e.members);
    }
  }
  const needWays = [...new Set(trails.flatMap(t => t.ways || []))].filter(w => !ways.has(w));
  for (let i = 0; i < needWays.length; i += 100) {
    (await getJSON(`/ways.json?ways=${needWays.slice(i, i + 100).join(",")}`)).elements.forEach(e => ways.set(e.id, e.nodes));
  }
  const needNodes = [...new Set(trails.flatMap(t => t.ways || []).flatMap(w => ways.get(w) || []))].filter(n => !nodes.has(n));
  for (let i = 0; i < needNodes.length; i += 400) {
    (await getJSON(`/nodes.json?nodes=${needNodes.slice(i, i + 400).join(",")}`)).elements.forEach(e => { if (e.lon !== undefined) nodes.set(e.id, [e.lon, e.lat]); });
  }
  const coords = w => (ways.get(w) || []).map(n => nodes.get(n)).filter(Boolean);
  const lines = [];
  for (const t of trails) {
    const segs = t.rel
      ? t.rel.flatMap(r => stitch((rels.get(r) || []).filter(m => m.type === "way" && !SKIP_ROLE.test(m.role || "")).map(m => coords(m.ref))))
      : stitch(t.ways.map(coords));
    const enc = segs.filter(s => s.length > 1).map(s => encode(simplify(s, TOLERANCE_M)));
    if (!enc.length) { console.warn("no geometry for", t.n); continue; }
    lines.push([t.n, t.a, t.t, t.km, t.m, t.osm, t.note, enc.join(" ")].map(String).join(";"));
  }
  writeFileSync(new URL("./trails-data.js", import.meta.url), HEAD + "const TRAILS_TXT = `\n" + lines.join("\n") + "\n`;\n");
  console.log(`trails-data.js: ${lines.length} of ${trails.length} trails`);
}

// Copy the site (every top-level file except the build and repo files) into public/ for Cloudflare Pages to serve.
function publish() {
  const root = new URL("./", import.meta.url), out = new URL("./public/", import.meta.url);
  mkdirSync(out, { recursive: true });
  const skip = new Set(["build-trails.mjs", "trail-ids.json", "vercel.json", "package.json", "package-lock.json", "README.md", "wrangler.toml"]);
  for (const f of readdirSync(root)) {
    if (skip.has(f) || f.startsWith(".") || !statSync(new URL(f, root)).isFile()) continue;
    copyFileSync(new URL(f, root), new URL(f, out));
  }
}

main().catch(err => {
  console.warn("Could not build trails from OpenStreetMap; the map will show no trails this deploy.", err);
  writeFileSync(new URL("./trails-data.js", import.meta.url), HEAD + "const TRAILS_TXT = ``;\n");
}).finally(publish);
