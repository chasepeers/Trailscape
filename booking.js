// ---------- On-site booking for every stay, with a calendar ----------
// Loaded last by app.js. Every one of the trail packages (PLACES in app-core.js) and every listed stay (STAYS in stays-data.js)
// gets a stay page (#stay-<id>) and a booking flow (#book-<id>) on this site. Nothing links out to operator or listing sites.
// It replaces app-core.js's hut(), huts(), book() and trips() pages, and turns the map's accommodation card into a booking card.
//
// ---- Two ways to book (bookMode() and BOOK_MODES in app-core.js) ----
// Instant booking: CapeNature, SANParks and NightsBridge stays, where we book straight into the provider's calendar.
//   The calendar shows availability and the guest pays when booking: in full, or a deposit where the stay takes one.
// Easy enquire: every other stay. We email the stay on the guest's behalf. The calendar only greys out nights that
//   Trailscape has already booked there; the guest sends their preferred dates, nothing is charged, and they pay once
//   the stay confirms availability and the exact price.
//
// ---- Connecting the backend (later) ----
// Option A: set the API address before app.js loads, e.g. in index.html:
//   <script>window.HS_CONFIG = { apiBase: "https://api.trailscape.co.za" };</script>
//   GET  {apiBase}/availability?stay=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD      (instant-booking stays: live NightsBridge availability)
//        → [{ "date": "2027-02-12", "status": "open" | "closed" | "notopen", "bedsLeft": 8, "price": 590 }]   (price per person per night; optional)
//   GET  {apiBase}/booked?stay=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD            (enquiry stays: nights we have already booked there)
//        → [{ "date": "2027-02-12", "bedsBooked": 6 }]        (only nights with bookings; a whole-unit stay can send bedsBooked = its beds)
//   POST {apiBase}/bookings    (JSON body: see the booking payload below)   → { "ref": "HS-1050", "status": "confirmed" }
//   POST {apiBase}/enquiries   (JSON body: see the enquiry payload below)   → { "ref": "HS-1051", "status": "enquiry" }
//   HS_CONFIG.instant = ["WC-…"] adds more NightsBridge (instant-booking) stays without editing app-core.js.
// Option B: assign window.HS_BACKEND = { getAvailability, getBooked, createBooking, createEnquiry } (each returns a promise).
// With neither, sample data is generated in the browser so the whole flow can be tried out, and it is labelled as a sample.
(() => {
  "use strict";

  // ---------- dates (plain YYYY-MM-DD strings, worked out in UTC so daylight saving never shifts a day) ----------
  const DAY = 864e5;
  const toD = s => new Date(s + "T00:00:00Z");
  const toS = d => d.toISOString().slice(0, 10);
  const addD = (s, n) => toS(new Date(toD(s).getTime() + n * DAY));
  const diffD = (a, b) => Math.round((toD(b) - toD(a)) / DAY);
  const todayS = () => { const d = new Date(); return toS(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };
  const dow = s => (toD(s).getUTCDay() + 6) % 7; // Monday = 0
  const fmt = (s, o) => toD(s).toLocaleDateString("en-ZA", { timeZone: "UTC", ...o });
  const fmtShort = s => fmt(s, { weekday: "short", day: "numeric", month: "short" });
  const fmtLong = s => fmt(s, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const monthStart = s => s.slice(0, 8) + "01";
  const addMonths = (s, n) => { const d = toD(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + n); return toS(d); };
  const MAX_NIGHTS = 14;


  // ---------- one model for every bookable stay ----------
  const REG = { ...REGIONS, boland: "Boland", gkaroo: "Great Karoo", kogelberg: "Kogelberg", langeberg: "Langeberg", winterhoek: "Winterhoek" };
  const REG_OF = { "Boland": "boland", "Breede": "breede", "Ceres": "breede", "Cape Peninsula": "peninsula", "Cederberg": "cederberg", "Garden Route": "garden",
    "Hottentots Holland": "hh", "Karoo": "gkaroo", "Klein Karoo": "karoo", "Kogelberg": "kogelberg", "Langeberg": "langeberg", "Overberg": "overberg",
    "West Coast": "west", "Winterhoek": "winterhoek" };
  // Municipal operators only appear in the accommodation data. Hidden from Object.entries(OPS) so the map's filter chips don't double up.
  if (!Object.prototype.hasOwnProperty.call(OPS, "mu")) Object.defineProperty(OPS, "mu", { value: { label: "Municipal", c: "#6b7f7a", channel: "email" }, enumerable: false });

  // Nightly price per person until real rates come from the backend. Shown as "est." everywhere.
  const PRICE_EST = [[/luxury/i, 4500], [/lodge|resort|game reserve/i, 950], [/glamping|treehouse|tent|pod|eco-cabin/i, 650], [/backpack|dormitory/i, 280],
    [/hut|shelter|shack/i, 220], [/camp/i, 160], [/cottage|chalet|cabin|house|self-catering|farm|guest|rondavel|loft|villa|barn|venue|boat/i, 480]];
  const priceOf = s => { const t = s.type.split("/")[0]; const hit = PRICE_EST.find(([re]) => re.test(t)); return hit ? hit[1] : 400; };
  function bedsOf(s) {
    const t = `${s.notes} ${s.name}`;
    const m = t.match(/sleeps\s*(\d+)/i) || t.match(/up to\s*(\d+)/i) || t.match(/(\d+)\s*(?:beds|people)/i);
    if (m) return Math.max(2, +m[1]);
    const ty = s.type.toLowerCase();
    if (/camp/.test(ty) && !/cottage|chalet|cabin/.test(ty.split("/")[0])) return 40;
    if (/hut|shelter/.test(ty)) return 12;
    if (/lodge|resort|backpack|reserve|venue/.test(ty)) return 24;
    if (/glamp|tent|pod/.test(ty)) return 10;
    return 8;
  }
  const norm = t => " " + t.toLowerCase().replace(/\(.*?\)/g, " ").replace(/\b(huts?|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim() + " ";

  const U = new Map();      // id -> unified stay
  const DUP = {};           // accommodation id -> trail/stay id it duplicates
  const EXTRA = [];         // accommodation rows shaped like PLACES, so app-core's place() (My trips, back office) finds them
  let ready = false;

  const modeOf = (op, id) => bookMode(op, id);
  // Who we deal with, as written in sentences: the park authority, or the stay itself for private, community and municipal stays.
  const whoOf = (op, opLabel, name, isPackage) => op === "cn" || op === "sp" ? opLabel : isPackage ? "the operator" : name;
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  function fromPlace(p) {
    const fixed = p.nights > 1 && /trail|route|slackpack/i.test(p.kind) ? p.nights : 0;
    return { id: p.id, src: "place", name: p.name, op: p.op, opLabel: OPS[p.op].label, color: BOOK_MODES[modeOf(p.op, p.id)].c, kind: p.kind, regionKey: p.region, region: REGIONS[p.region],
      lat: p.lat, lng: p.lng, price: p.price, est: false, beds: p.beds, fixed, mode: modeOf(p.op, p.id), engine: bookEngine(p.op, p.id), who: whoOf(p.op, OPS[p.op].label, p.name, !!fixed), blurb: p.blurb, stops: p.huts, km: p.km, grade: p.grade,
      nights: p.nights, photo: PLACE_PHOTO[p.id] || null };
  }
  function fromStay(s) {
    const trail = s.type === "Trail hut" ? PLACES.filter(p => p.nights > 1).find(p => s.hike.toLowerCase().includes(p.name.toLowerCase().split(" ")[0])) : null;
    const regionKey = REG_OF[s.region] || "west";
    return { id: s.id, src: "stay", name: s.name, op: s.k, opLabel: s.operator, color: BOOK_MODES[modeOf(s.k, s.id)].c, kind: s.type, regionKey, region: REG[regionKey],
      lat: s.lat, lng: s.lng, price: priceOf(s), est: true, beds: bedsOf(s), fixed: 0, mode: modeOf(s.k, s.id), engine: bookEngine(s.k, s.id), who: whoOf(s.k, s.operator, s.name, false), loc: s.loc, hike: s.hike, notes: s.notes, permit: /permit/i.test(s.book),
      trailOf: trail ? trail.id : null, photo: null };
  }
  PLACES.forEach(p => U.set(p.id, fromPlace(p)));

  function loadStays() {
    const single = PLACES.filter(p => !(p.nights > 1 && /trail|route|slackpack/i.test(p.kind)));
    STAYS.forEach(s => {
      const twin = single.find(p => norm(s.name).includes(norm(p.name)));
      if (twin && !NIGHTSBRIDGE.has(s.id)) { DUP[s.id] = twin.id; return; }
      const u = fromStay(s);
      U.set(u.id, u);
      EXTRA.push({ id: u.id, name: u.name, op: u.op, lat: u.lat, lng: u.lng, region: u.regionKey, kind: u.kind, nights: 1, km: 0, grade: "—", beds: u.beds, price: u.price, huts: [u.name], blurb: u.hike });
    });
    ready = true;
  }
  const _find = Array.prototype.find;
  Object.defineProperty(PLACES, "find", { configurable: true, writable: true, value(fn, t) { const r = _find.call(this, fn, t); return r !== undefined ? r : _find.call(EXTRA, fn, t); } });
  const getU = id => U.get(id) || (DUP[id] ? U.get(DUP[id]) : null);
  const allU = () => [...U.values()];
  const instant = u => u.mode === "instant";
  // The coloured dot is the booking type; the operator follows as plain text.
  const tagOp = u => `<span class="opname">${esc(u.opLabel)}</span>`;
  // The calendar we book into, for an instant stay: "CapeNature's online booking system", "Mount Ceder's NightsBridge calendar".
  const calText = u => u.op === "cn" || u.op === "sp" ? u.engine : `${u.who}'s ${u.engine} calendar`;
  const modeTag = u => `<span class="tag ${instant(u) ? "ok" : "info"}">${BOOK_MODES[u.mode].label}</span>`;
  const modeShort = u => BOOK_MODES[u.mode].short;
  // How payment works for each type, in one sentence.
  const payLine = u => instant(u)
    ? (PAYMENTS ? `You pay when you book: the full amount, or a deposit if ${esc(u.who)} takes one.`
      : `Book now and your beds are held. We confirm with ${esc(u.who)} and send a payment link for the amount due: the full amount, or a deposit if ${esc(u.who)} takes one.`)
    : `Nothing is charged now. You pay only once ${esc(u.who)} confirms availability and the exact price.`;
  const leadDays = u => instant(u) ? 1 : 3;
  const horizonDays = u => u.op === "cn" ? 365 : 540;

  // ---------- backend ----------
  function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  const POP = { whale: 0.45, otter: 0.45, "WC-154": 0.45, cogh: 0.25, landdroskop: 0.2, swellendam: 0.15 };
  // Beds that bookings made in this browser take up, night by night. Enquiries don't hold beds until the operator confirms.
  function localBooked(stayId) {
    const out = {};
    myTrips.forEach(t => {
      if (t.place !== stayId || t.kind === "enquiry" || !t.date) return;
      const end = t.out || addD(t.date, Math.max(1, t.nights || 1));
      for (let d = t.date; d < end; d = addD(d, 1)) out[d] = (out[d] || 0) + (t.n || 1);
    });
    return out;
  }
  const sampleBackend = {
    sample: true,
    async getAvailability({ stay, from, to }) {
      const out = [], today = todayS(), mine = localBooked(stay.id);
      for (let d = from; d <= to; d = addD(d, 1)) {
        const k = diffD(today, d);
        if (k > horizonDays(stay)) { out.push({ date: d, status: "notopen", bedsLeft: 0 }); continue; }
        if (h32(stay.id + d + "c") < 0.015) { out.push({ date: d, status: "closed", bedsLeft: 0 }); continue; }
        const wd = dow(d), m = +d.slice(5, 7), dd = +d.slice(8, 10);
        const weekend = wd === 4 || wd === 5;
        const peak = (m === 12 && dd >= 12) || (m === 1 && dd <= 8) || (m === 4 && dd <= 14) || (m === 9 && dd >= 20);
        const near = k >= 0 && k < 60 ? 0.25 * (1 - k / 60) : 0;
        const occ = h32(stay.id + d) * 0.7 + (weekend ? 0.22 : 0) + (peak ? 0.3 : 0) + (POP[stay.id] || 0) + near;
        const left = Math.round(stay.beds * (1 - occ)) - (mine[d] || 0);
        out.push({ date: d, status: "open", bedsLeft: Math.max(0, Math.min(stay.beds, left)), price: stay.price });
      }
      await new Promise(r => setTimeout(r, 120));
      return out;
    },
    // A few sample nights already booked by Trailscape, plus anything booked in this browser.
    async getBooked({ stay, from, to }) {
      const out = [], mine = localBooked(stay.id);
      for (let d = from; d <= to; d = addD(d, 1)) {
        const wd = dow(d), weekend = wd === 4 || wd === 5;
        const sample = h32(stay.id + d + "b") < (weekend ? 0.12 : 0.04) ? stay.beds : 0;
        const b = Math.min(stay.beds, sample + (mine[d] || 0));
        if (b > 0) out.push({ date: d, bedsBooked: b });
      }
      await new Promise(r => setTimeout(r, 120));
      return out;
    },
    async createBooking() { await new Promise(r => setTimeout(r, 500)); return { ref: "HS-" + (1043 + myTrips.length), status: "confirmed" }; },
    async createEnquiry() { await new Promise(r => setTimeout(r, 500)); return { ref: "HS-" + (1043 + myTrips.length), status: "enquiry" }; },
  };
  const cfg = window.HS_CONFIG || {};
  const apiBackend = cfg.apiBase ? (() => {
    const get = async (path, { stay, from, to }) => {
      const r = await fetch(`${cfg.apiBase}/${path}?stay=${encodeURIComponent(stay.id)}&from=${from}&to=${to}`);
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    };
    const post = async (path, payload) => {
      const r = await fetch(`${cfg.apiBase}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    };
    return { getAvailability: q => get("availability", q), getBooked: q => get("booked", q), createBooking: p => post("bookings", p), createEnquiry: p => post("enquiries", p) };
  })() : null;
  // payments: false while no payment gateway is connected. Instant bookings are then taken as requests: nothing is
  // charged, we book with the stay and send a payment link. Set HS_CONFIG.payments = true once the gateway is live.
  const PAYMENTS = cfg.payments !== false;
  const backend = () => window.HS_BACKEND || apiBackend || sampleBackend;
  const call = (fn, arg) => { const b = backend(); return (b[fn] ? b : sampleBackend)[fn](arg); };
  const isSample = fn => { const b = backend(); return b === sampleBackend || !b[fn]; };

  // ---------- styles ----------
  const st = document.createElement("style");
  st.textContent = `
  .hscal { display: grid; gap: 12px; }
  .hscal-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .hscal-top button { width: 36px; height: 36px; flex: none; border-radius: 50%; border: 0; background: var(--band); cursor: pointer; font-size: 1.15rem; line-height: 1; color: var(--fg); }
  .hscal-top button:disabled { opacity: .3; cursor: default; }
  .hscal-hint { flex: 1; text-align: center; font-size: .88rem; color: var(--muted); }
  .hscal-hint button { border: 0; background: none; padding: 0 0 0 6px; font: inherit; color: var(--fg); text-decoration: underline; cursor: pointer; }
  .hscal-ms { display: grid; grid-template-columns: repeat(var(--m, 1), minmax(0, 1fr)); gap: 28px; }
  .hscal-mt { font-weight: 600; margin: 0 0 8px; font-size: .95rem; }
  .hscal-g { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
  .hscal-dw { font: .7rem "Fragment Mono", ui-monospace, monospace; color: var(--muted); text-align: center; padding: 2px 0 4px; }
  .hscal .d { min-height: 46px; border: 0; border-radius: 8px; background: transparent; font: inherit; color: var(--fg); padding: 3px 1px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: default; }
  .hscal .d b { font-weight: 500; font-size: .92rem; line-height: 1; }
  .hscal .d small { font-size: .6rem; line-height: 1; color: var(--muted); white-space: nowrap; overflow: hidden; max-width: 100%; }
  .hscal .d.ok { background: var(--accent-soft, #ccffe0); cursor: pointer; }
  .hscal .d.ok small { color: #006b2c; }
  .hscal .d.few { background: #fff0d4; cursor: pointer; }
  .hscal .d.few small { color: #8a5300; }
  .hscal .d.enq { background: #fff; box-shadow: inset 0 0 0 1px var(--line); cursor: pointer; }
  .hscal .d.enq small { color: var(--info, #1f5fb3); }
  .hscal .d.full, .hscal .d.booked { background: var(--band); }
  .hscal .d.full b, .hscal .d.closed b, .hscal .d.booked b { color: var(--muted); text-decoration: line-through; text-decoration-color: rgba(13,19,33,.3); }
  .hscal .d.off b { color: #c3c6cc; }
  .hscal .d.soon b { color: var(--muted); }
  .hscal .d.load { background: var(--band); animation: hspulse 1.1s ease-in-out infinite; }
  .hscal .d.co { cursor: pointer; box-shadow: inset 0 0 0 1px rgba(13,19,33,.35); }
  .hscal .d.mid { background: #e6e7ea; border-radius: 0; box-shadow: none; }
  .hscal .d.mid small { color: var(--fg); }
  .hscal .d.in, .hscal .d.out { background: var(--fg); color: #fff; box-shadow: none; }
  .hscal .d.in b, .hscal .d.out b { color: #fff; text-decoration: none; }
  .hscal .d.in small, .hscal .d.out small { color: rgba(255,255,255,.75); }
  .hscal .d.in { border-radius: 8px 0 0 8px; } .hscal .d.out { border-radius: 0 8px 8px 0; } .hscal .d.in.solo { border-radius: 8px; }
  .hscal .d:enabled:hover { box-shadow: inset 0 0 0 1.5px var(--fg); }
  .hscal .d:focus-visible { outline: 2px solid var(--clay); outline-offset: 1px; }
  .hscal .d.today b { text-decoration: underline; text-underline-offset: 3px; }
  .hscal-lg { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: .78rem; color: var(--muted); align-items: center; }
  .hscal-lg i { display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
  .hscal-lg i.enq { background: #fff; box-shadow: inset 0 0 0 1px #c9ccd2; }
  .hscal-err { font-size: .88rem; color: var(--muted); }
  .hsenq { display: flex; gap: 10px; align-items: flex-start; background: var(--info-bg, #e3efff); border-radius: 8px; padding: 10px 12px; font-size: .86rem; line-height: 1.35; }
  .hsenq::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #2f7de1; flex: none; margin-top: 6px; }
  .hsenq b { font-weight: 600; }
  @keyframes hspulse { 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .hscal .d.load { animation: none; } }
  .hsn { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .hsn span { font-size: .92rem; }
  .hsn div { display: flex; align-items: center; gap: 10px; }
  .hsn button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--line); background: var(--card); cursor: pointer; font-size: 1.1rem; line-height: 1; color: var(--fg); }
  .hsn button:disabled { opacity: .35; cursor: default; }
  .hsn b { min-width: 2ch; text-align: center; font-weight: 600; }
  .hssum { display: grid; gap: 10px; font-size: .92rem; }
  .hssum .row2 { display: flex; justify-content: space-between; gap: 12px; }
  .hssum .row2 span:first-child { color: var(--muted); }
  .hssum .sub { font-size: .8rem; color: var(--muted); }
  .hssum .tot { border-top: 1px solid var(--line); padding-top: 10px; font-weight: 600; font-size: 1.02rem; }
  .hssum .dates { font-weight: 600; }
  .hsflow { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
  .hsflow > aside { position: sticky; top: 88px; display: grid; gap: 14px; }
  .hsbox { display: grid; gap: 14px; }
  .hsbox .price small { font-size: .8rem; }
  .hsest { font: .68rem "Fragment Mono", ui-monospace, monospace; color: var(--muted); background: var(--band); border-radius: 4px; padding: 1px 5px; margin-left: 4px; vertical-align: 2px; }
  .hsnote { font-size: .85rem; color: var(--muted); background: var(--band); border-radius: 8px; padding: 10px 12px; }
  .hssample { font-size: .78rem; color: var(--muted); }
  .hstrail { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; background: var(--band); border-radius: 10px; padding: 12px 14px; margin: 18px 0; font-size: .92rem; }
  .hsmore { display: flex; justify-content: center; padding: 20px 0 8px; }
  .hscount { font-size: .88rem; color: var(--muted); margin: 18px 0 0; }
  .hsbook { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
  .hsbook .p { font-size: .92rem; display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
  .hsbook .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .hsbook .btn { text-align: center; justify-content: center; }
  .hsbook small { font-size: .78rem; color: var(--muted); }
  .hscheck { flex-direction: row !important; align-items: flex-start; gap: 10px !important; color: var(--fg) !important; font-size: .9rem !important; }
  .hscheck input { width: auto !important; margin-top: 3px; accent-color: var(--green); }
  @media (max-width: 900px) {
    .hsflow { grid-template-columns: 1fr; }
    .hsflow > aside { position: static; }
  }
  @media (max-width: 960px) { .hsbook .btn { min-height: 46px; } .hscal .d { min-height: 48px; } }
  `;
  document.head.appendChild(st);

  // ---------- calendar ----------
  // Instant booking: a month grid with live beds left per night.
  // Easy enquire: every night shows "Ask" (availability on enquiry) except nights we have already booked there, which show "Booked".
  // Range stays: tap check-in, then check-out. Trail packages: tap the start date.
  function makeCal(host, u, o) {
    const today = todayS(), minDate = addD(today, leadDays(u));
    const maxDate = addD(today, 548);
    const live = instant(u);
    const cache = new Map();
    const sel = { in: null, out: null, ...(o.sel || {}) };
    let view = monthStart(sel.in || minDate), months = o.months || 1, err = false;
    const n = () => o.n();
    const nightOk = d => { const r = cache.get(d); return !!r && d >= minDate && r.status === "open" && r.bedsLeft >= n(); };
    const startOk = d => { if (!u.fixed) return nightOk(d); for (let i = 0; i < u.fixed; i++) if (!nightOk(addD(d, i))) return false; return true; };
    const startBeds = d => { let b = Infinity; for (let i = 0; i < (u.fixed || 1); i++) { const r = cache.get(addD(d, i)); b = Math.min(b, r ? r.bedsLeft : 0); } return b; };
    function maxOut() {
      let last = null;
      for (let i = 1; i <= MAX_NIGHTS; i++) { if (!nightOk(addD(sel.in, i - 1))) break; last = addD(sel.in, i); }
      return last;
    }
    const lastVisible = () => addD(addMonths(view, months), -1);
    async function load() {
      const from = view < minDate ? minDate : view, to = addD(lastVisible(), Math.max(u.fixed, MAX_NIGHTS) + 1);
      let need = false; for (let d = from; d <= to; d = addD(d, 1)) if (!cache.has(d)) { need = true; break; }
      if (!need) return;
      err = false; render();
      try {
        if (live) {
          const rows = await call("getAvailability", { stay: u, from, to });
          rows.forEach(r => cache.set(r.date, { status: r.status || "open", bedsLeft: +r.bedsLeft || 0, price: r.price != null ? +r.price : null }));
          for (let d = from; d <= to; d = addD(d, 1)) if (!cache.has(d)) cache.set(d, { status: "closed", bedsLeft: 0, price: null });
        } else {
          const rows = await call("getBooked", { stay: u, from, to });
          const booked = {}; rows.forEach(r => { booked[r.date] = (booked[r.date] || 0) + (+r.bedsBooked || 0); });
          for (let d = from; d <= to; d = addD(d, 1)) {
            if (cache.has(d)) continue;
            const left = Math.max(0, u.beds - (booked[d] || 0));
            const status = diffD(today, d) > horizonDays(u) ? "notopen" : left > 0 ? "open" : "booked";
            cache.set(d, { status, bedsLeft: left, price: null, ours: !!booked[d] });
          }
        }
      } catch (e) { console.warn("Calendar could not be loaded", e); err = true; }
    }
    function cell(d) {
      const cls = ["d"], r = cache.get(d);
      let small = "", click = false;
      if (d === today) cls.push("today");
      if (d < minDate) cls.push("off");
      else if (!r) cls.push("load");
      else if (r.status === "notopen") { cls.push("soon"); small = "Not open"; }
      else if (r.status === "closed") { cls.push("closed"); small = "Closed"; }
      else if (!live) {
        if (startOk(d)) { click = true; cls.push("enq"); small = "Ask"; }
        else { cls.push("booked"); small = "Booked"; }
      } else {
        const ok = startOk(d), b = u.fixed ? startBeds(d) : r.bedsLeft;
        if (ok) { click = true; cls.push(b < Math.max(n() * 2, Math.ceil(u.beds * 0.25)) ? "few" : "ok"); small = `${b} left`; }
        else { cls.push("full"); small = b > 0 ? `${b} left` : "Full"; }
      }
      const waiting = sel.in && !sel.out && !u.fixed;
      if (waiting && d > sel.in) { const mo = maxOut(); if (mo && d <= mo) { cls.push("co"); click = true; if (!startOk(d)) small = "Out"; } }
      if (d === sel.in) cls.push("in", sel.out ? "" : "solo");
      if (d === sel.out) cls.push("out");
      if (sel.in && sel.out && d > sel.in && d < sel.out) cls.push("mid");
      const spoken = small === "Ask" ? "availability on enquiry" : small === "Booked" ? "already booked" : small;
      const label = `${fmtLong(d)}${spoken ? ", " + spoken : ""}`;
      return `<button type="button" class="${cls.filter(Boolean).join(" ")}" data-d="${d}" ${click ? "" : "disabled"} aria-label="${esc(label)}" aria-pressed="${d === sel.in || d === sel.out}"><b>${+d.slice(8)}</b><small>${small || "&nbsp;"}</small></button>`;
    }
    function month(ms) {
      const days = diffD(ms, addMonths(ms, 1)), lead = dow(ms);
      let g = "", d = ms;
      for (let i = 0; i < lead; i++) g += "<span></span>";
      for (let i = 0; i < days; i++, d = addD(d, 1)) g += cell(d);
      return `<div><div class="hscal-mt">${fmt(ms, { month: "long", year: "numeric" })}</div>
        <div class="hscal-g">${["M", "T", "W", "T", "F", "S", "S"].map(x => `<span class="hscal-dw">${x}</span>`).join("")}${g}</div></div>`;
    }
    function hint() {
      if (err) return `Couldn't load the calendar.<button type="button" data-a="retry">Try again</button>`;
      if (!sel.in) return u.fixed ? `Pick ${live ? "a" : "your preferred"} start date · ${u.fixed} nights` : `Pick your ${live ? "" : "preferred "}check-in date`;
      if (!sel.out) return "Now pick your check-out date";
      return `${diffD(sel.in, sel.out)} ${diffD(sel.in, sel.out) === 1 ? "night" : "nights"} selected<button type="button" data-a="clear">Clear</button>`;
    }
    function legend() {
      const sample = isSample(live ? "getAvailability" : "getBooked") ? `<span class="hssample">${live ? "Sample availability" : "Sample bookings"}</span>` : "";
      return live
        ? `<span><i style="background:var(--accent-soft,#ccffe0)"></i>Available</span><span><i style="background:#fff0d4"></i>Few beds left</span><span><i style="background:var(--band)"></i>Full or closed</span>${sample}`
        : `<span><i class="enq"></i>Availability on enquiry</span><span><i style="background:var(--band)"></i>Already booked</span>${sample}`;
    }
    function render() {
      const ms = []; for (let i = 0; i < months; i++) ms.push(addMonths(view, i));
      host.innerHTML = `<div class="hscal" style="--m:${months}">
        ${live ? "" : `<div class="hsenq"><span><b>Easy enquire.</b> Pick your preferred dates and we'll email ${esc(u.who)} for you. Greyed-out nights are already booked.</span></div>`}
        <div class="hscal-top"><button type="button" data-a="prev" aria-label="Previous month" ${view <= monthStart(minDate) ? "disabled" : ""}>‹</button>
          <span class="hscal-hint" aria-live="polite">${hint()}</span>
          <button type="button" data-a="next" aria-label="Next month" ${addMonths(view, months) > maxDate ? "disabled" : ""}>›</button></div>
        <div class="hscal-ms">${ms.map(month).join("")}</div>
        <div class="hscal-lg">${legend()}</div>
      </div>`;
    }
    function changed() { render(); o.onChange && o.onChange({ ...sel }, api); }
    host.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === "prev" || a === "next") { view = addMonths(view, a === "prev" ? -months : months); render(); await load(); render(); return; }
      if (a === "retry") { await load(); render(); return; }
      if (a === "clear") { sel.in = sel.out = null; changed(); return; }
      const d = b.dataset.d; if (!d) return;
      if (u.fixed) { sel.in = d; sel.out = addD(d, u.fixed); changed(); return; }
      if (sel.in && !sel.out && d > sel.in) { const mo = maxOut(); if (mo && d <= mo) { sel.out = d; changed(); return; } }
      if (startOk(d)) { sel.in = d; sel.out = null; changed(); }
    });
    const api = {
      sel: () => ({ ...sel }),
      nightsPrice() { // stay fees for the selected nights and party, using nightly prices from the backend when it sends them
        if (!sel.in || !sel.out) return null;
        let fees = 0; for (let d = sel.in; d < sel.out; d = addD(d, 1)) { const r = cache.get(d); fees += (r && r.price != null ? r.price : u.price) * n(); }
        return fees;
      },
      valid() { if (!sel.in || !sel.out) return false; for (let d = sel.in; d < sel.out; d = addD(d, 1)) if (!nightOk(d)) return false; return true; },
      refresh() { // hiker count changed: drop a selection that no longer fits
        if (sel.in && !api.valid()) { if (!sel.out || !startOk(sel.in)) { sel.in = sel.out = null; toast(live ? "Those dates don't have enough beds for your group. Pick new dates." : "Some of those nights are already booked. Pick new dates."); } else sel.out = null; }
        changed();
      },
      async setMonths(m) { if (m === months) return; months = m; render(); await load(); render(); },
    };
    render();
    load().then(() => { if (sel.in && !api.valid()) { sel.in = sel.out = null; } changed(); });
    return api;
  }

  // ---------- shared pieces ----------
  function stepper(id, n, max) {
    return `<div class="hsn" id="${id}"><span>Hikers</span><div><button type="button" data-s="-1" aria-label="Fewer hikers" ${n <= 1 ? "disabled" : ""}>−</button><b aria-live="polite">${n}</b><button type="button" data-s="1" aria-label="More hikers" ${n >= max ? "disabled" : ""}>+</button></div></div>`;
  }
  function bindStepper(el, get, set, max) {
    el.onclick = e => { const b = e.target.closest("button[data-s]"); if (!b) return; const v = Math.max(1, Math.min(max, get() + +b.dataset.s)); if (v === get()) return; set(v);
      el.querySelector("b").textContent = v; el.querySelector('[data-s="-1"]').disabled = v <= 1; el.querySelector('[data-s="1"]').disabled = v >= max; };
  }
  function quoteOf(u, cal, n) {
    const s = cal.sel(); if (!s.in || !s.out) return null;
    const nights = diffD(s.in, s.out), stay = cal.nightsPrice(), fee = FEE * n;
    return { in: s.in, out: s.out, nights, stay, fee, total: stay + fee };
  }
  function summaryHTML(u, q, n) {
    if (!q) return `<div class="hssum"><div class="muted" style="font-size:.9rem">${u.fixed ? "Pick a start date" : "Pick your dates"} to see ${instant(u) ? "the price" : "a guide price"}.</div></div>`;
    const guess = u.est || !instant(u);
    return `<div class="hssum">
      <div><div class="dates">${fmtShort(q.in)} → ${fmtShort(q.out)}</div><div class="sub">${q.nights} ${q.nights === 1 ? "night" : "nights"} · ${n} ${n === 1 ? "hiker" : "hikers"}</div></div>
      <div class="row2"><span>Stay fees${guess ? `<span class="hsest">est.</span>` : ""}</span><span>${R(q.stay)}</span></div>
      <div class="row2"><span>Trailscape fee</span><span>${R(q.fee)}</span></div>
      <div class="row2 tot"><span>${instant(u) ? "Total" : "Guide total"}</span><span>${R(q.total)}</span></div>
      ${instant(u)
        ? (u.est ? `<div class="sub">Stay fees are an estimate until ${esc(u.who)}'s live rates load.</div>` : "")
        : `<div class="sub">A guide price only. ${esc(cap(u.who))} confirms the exact price with availability, and you pay only once it's confirmed.</div>`}
    </div>`;
  }
  const howText = u => instant(u)
    ? `We book straight into ${esc(calText(u))}. ${payLine(u)}`
    : `We email ${esc(u.who)} for you and reply within about 48 hours with availability and the exact price. ${payLine(u)}`;
  const notReady = () => { view.innerHTML = `<div class="wrap phead"><p class="muted">Loading stays…</p></div>`; };
  const notFound = () => { view.innerHTML = `<div class="wrap phead"><div class="eyebrow">Stays</div><h1>We couldn't find that stay</h1><p class="lead"><a href="#stays">See every stay</a> or <a href="#map">find one on the map</a>.</p></div>`; };

  // ---------- stay page ----------
  hut = function (id) {
    if (DUP[id]) { location.replace("#stay-" + DUP[id]); return; }
    const u = getU(id);
    if (!u) { if (!ready) notReady(); else notFound(); return; }
    const alerts = store.get("alerts", {});
    let n = Math.min(u.beds, draft && draft.place === u.id ? draft.n : 2);
    const trail = u.trailOf ? getU(u.trailOf) : null;
    const facts = u.src === "place"
      ? [["Nights", u.nights], ["Distance", u.km ? u.km + " km" : "—"], ["Grade", u.grade], ["Booking", modeShort(u)]]
      : [["Type", esc(u.kind.split("/")[0].trim())], ["Sleeps", "about " + u.beds], ["Booking", modeShort(u)], ["From", R(u.price) + `<span class="hsest">est.</span>`]];
    view.innerHTML = `
    <div class="wrap detail">
      <div>
        <div class="crumbs"><a href="#stays">Stays</a> / <a href="#stays-${u.regionKey}">${esc(u.region)}</a></div>
        ${u.photo ? `<div class="stayphoto">${media(u.photo, 0, 1, u.name)}</div>` : ""}
        <span style="font-size:.9rem;display:inline-flex;gap:10px;align-items:center;flex-wrap:wrap">${modeTag(u)}${tagOp(u)}</span>
        <h1 style="font-size:clamp(2rem,4.5vw,3rem);line-height:1.08;margin-top:6px">${esc(u.name)}</h1>
        <p class="muted" style="margin:6px 0 0">${esc(u.kind)} · ${esc(u.region)}${u.loc ? " · " + esc(u.loc) : ""}</p>
        <div class="factrow">${facts.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("")}</div>
        ${trail ? `<div class="hstrail"><span>This hut is on the <b>${esc(trail.name)}</b>, which most hikers book as one ${trail.fixed || trail.nights}-night trip.</span><a class="btn line sm" href="#stay-${trail.id}">See the full trail</a></div>` : ""}
        <div class="prose">
          ${u.blurb ? `<p>${esc(u.blurb)}</p>` : ""}
          ${u.hike ? `<h2>Hiking nearby</h2><p>${esc(u.hike)}</p>` : ""}
          ${u.stops && u.stops.length ? `<h2>Overnight stops</h2><div class="hutchips">${u.stops.map(h => `<span>${esc(h)}</span>`).join("")}</div>` : ""}
          ${u.notes ? `<h2>Good to know</h2><p>${esc(u.notes)}</p>` : ""}
          ${u.permit ? `<p>An overnight permit is needed here. We arrange it as part of your booking.</p>` : ""}
          <h2>How booking works</h2>
          ${instant(u)
            ? `<p>${howText(u)} The calendar shows the beds left each night, so what you see is what you can book. One booking reference covers everything.</p>`
            : `<p>This is an Easy enquire stay. Pick your preferred dates on the calendar and send us an enquiry; there's no need to contact ${esc(u.who)} yourself. We email them on your behalf. Nights we've already booked are greyed out; everything else depends on ${esc(u.who)}'s own bookings, so we confirm it with them.</p>
               <p>We reply within about 48 hours with availability and the exact price. You pay only once availability is confirmed, and then we finalise the booking. Nothing is charged before then.</p>`}
          <h2>What to bring</h2>
          <p>Bring your own sleeping bag, food and stove unless the listing says otherwise. Many stays have no electricity. Trails can close at short notice for fire or extreme weather; we'll tell you straight away if your dates are affected.</p>
        </div>
        <div class="minimap"><div id="hmap" role="region" aria-label="Location map"></div></div>
      </div>
      <aside class="card bookbox hsbox">
        <div class="price">from ${R(u.price)} <small>pp per night${u.est ? `<span class="hsest">est.</span>` : ""}</small></div>
        ${stepper("h-n", n, u.beds)}
        <div id="h-cal"></div>
        <div id="h-sum"></div>
        <button class="btn primary block" id="h-book" disabled>${instant(u) ? (u.fixed ? "Book this start date" : "Book these dates") : "Enquire about these dates"}</button>
        <label class="field" style="flex-direction:row;align-items:center;gap:10px;color:var(--fg);font-size:.92rem"><input type="checkbox" id="h-alert" ${alerts[u.id] ? "checked" : ""} style="width:auto;accent-color:var(--green)"> Alert me about cancellations</label>
        <div class="how"><span><b>${BOOK_MODES[u.mode].label}:</b> ${howText(u)}</span><span>Trailscape adds a flat ${R(FEE)} per hiker.</span></div>
      </aside>
    </div>`;
    const m = baseMap("hmap", { center: [u.lng, u.lat], zoom: 10, styleCtl: false, cooperativeGestures: true });
    htmlMarker(m, u.lng, u.lat, "", "", u.name).getElement().style.setProperty("--c", u.color);
    const sum = $("#h-sum"), btn = $("#h-book");
    const cal = makeCal($("#h-cal"), u, { months: 1, n: () => n, sel: draft && draft.place === u.id ? { in: draft.in, out: draft.out } : null,
      onChange: () => { const q = quoteOf(u, cal, n); sum.innerHTML = summaryHTML(u, q, n); btn.disabled = !q; } });
    bindStepper($("#h-n"), () => n, v => { n = v; cal.refresh(); }, u.beds);
    btn.onclick = () => { const s = cal.sel(); draft = { place: u.id, in: s.in, out: s.out, n, date: s.in }; location.hash = "book-" + u.id; };
    $("#h-alert").onchange = e => { const a = store.get("alerts", {}); if (e.target.checked) a[u.id] = true; else delete a[u.id]; store.set("alerts", a); toast(e.target.checked ? "Alert on. We'll tell you when beds open up." : "Alert off."); };
  };

  // ---------- booking and enquiry flow ----------
  book = function (id) {
    if (DUP[id]) { location.replace("#book-" + DUP[id]); return; }
    const u = getU(id);
    if (!u) { if (!ready) notReady(); else notFound(); return; }
    if (!draft || draft.place !== u.id) draft = { place: u.id, n: Math.min(2, u.beds), in: null, out: null };
    draft.n = Math.max(1, Math.min(u.beds, draft.n || 2));
    const live = instant(u);
    const steps = live ? ["Dates", "Your details", "Booking status"] : ["Preferred dates", "Your details", "Enquiry sent"];
    let stage = 1, cal = null, q = null;
    const phone = matchMedia("(max-width: 760px)");
    function shell(inner) {
      view.innerHTML = `<div class="wrap flow" style="max-width:1120px">
        <div class="crumbs"><a href="#stay-${u.id}">${esc(u.name)}</a> / ${live ? "Book" : "Enquire"}</div>
        <h1 style="font-size:clamp(1.8rem,4vw,2.5rem)">${live ? "Book" : "Enquire about"} ${esc(u.name)}</h1>
        <div class="stepper">${steps.map((s, i) => `<div class="${i + 1 < stage ? "done" : i + 1 === stage ? "on" : ""}">${i + 1}. ${s}</div>`).join("")}</div>
        ${inner}</div>`;
      window.scrollTo(0, 0);
    }
    function aside(extra = "") {
      return `<aside><div class="card panel" style="gap:14px">
        <div><span style="font-size:.85rem;display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap">${modeTag(u)}${tagOp(u)}</span><div style="font-weight:600;margin-top:4px">${esc(u.name)}</div><div class="muted" style="font-size:.85rem">${esc(u.kind)} · ${esc(u.region)}</div></div>
        <div id="b-sum"></div>${extra}</div></aside>`;
    }
    function s1() {
      stage = 1;
      const note = live
        ? `${u.fixed ? `The ${esc(u.name)} is booked as a ${u.fixed}-night trip. Pick the day you start walking.` : `Stays of 1 to ${MAX_NIGHTS} nights. Numbers show beds left each night.`} Availability comes from ${esc(calText(u))}.`
        : `${u.fixed ? `The ${esc(u.name)} is booked as a ${u.fixed}-night trip. Pick the day you'd like to start walking.` : `Stays of 1 to ${MAX_NIGHTS} nights.`} Dates start ${leadDays(u)} days from today so ${esc(u.who)} has time to reply.`;
      shell(`<div class="hsflow">
        <div class="card panel">
          ${stepper("b-n", draft.n, u.beds)}
          <div id="b-cal"></div>
          <div class="hsnote">${note}</div>
        </div>
        ${aside(`<button class="btn primary block" id="b-next" disabled>Continue</button>`)}
      </div>`);
      const sum = $("#b-sum"), next = $("#b-next");
      cal = makeCal($("#b-cal"), u, { months: phone.matches ? 1 : 2, n: () => draft.n, sel: { in: draft.in, out: draft.out },
        onChange: s => { draft.in = s.in; draft.out = s.out; q = quoteOf(u, cal, draft.n); sum.innerHTML = summaryHTML(u, q, draft.n); next.disabled = !q; } });
      bindStepper($("#b-n"), () => draft.n, v => { draft.n = v; cal.refresh(); }, u.beds);
      phone.onchange = () => cal && stage === 1 && cal.setMonths(phone.matches ? 1 : 2);
      next.onclick = () => { if (!cal.valid()) { toast(live ? "Those dates are no longer available. Pick again." : "Some of those nights are already booked. Pick again."); return; } q = quoteOf(u, cal, draft.n); s2(); };
    }
    const acctField = k => { const A = window.TSAccount; return (A && A.user && A.user[k]) || ""; };
    const contactFields = () => `
      <div class="paybox">
        <label class="field">Full name<input id="c-name" required autocomplete="name" placeholder="Lead hiker" value="${esc(draft.name || acctField("name"))}"></label>
        <label class="field">Mobile<input id="c-phone" type="tel" required autocomplete="tel" placeholder="082 000 0000" value="${esc(draft.phone || acctField("phone"))}"></label>
        <label class="field full">Email<input id="c-email" type="email" required autocomplete="email" placeholder="you@example.com" value="${esc(draft.email || acctField("email"))}"></label>
      </div>`;
    const guest = () => ({ name: $("#c-name").value.trim(), phone: $("#c-phone").value.trim(), email: $("#c-email").value.trim() });
    function s2() {
      stage = 2;
      if (live) {
        shell(`<div class="hsflow">
          <form class="card panel" id="payf">
            ${contactFields()}
            <label class="field">Notes for ${esc(u.who)} (optional)<textarea id="c-notes" rows="2" placeholder="e.g. one vegetarian, arriving late on day one">${esc(draft.notes || "")}</textarea></label>
            <div><div class="field" style="margin-bottom:6px">Pay with</div>
              <div class="gw"><label><input type="radio" name="gw" value="card" checked> Card</label><label><input type="radio" name="gw" value="eft"> Instant EFT</label></div></div>
            <label class="field hscheck"><input type="checkbox" required> I agree that Trailscape books on my behalf and may share my name and contact details with ${esc(u.who)} for this booking. ${esc(cap(u.who))}'s own cancellation rules apply to the stay fees; our fee isn't refundable once the booking is confirmed.</label>
            <div class="note">${PAYMENTS ? `These dates are held for you while you pay: the full amount, or a deposit if ${esc(u.who)} takes one. Your booking is confirmed as soon as payment goes through.`
              : `These beds are held for you as soon as you book. Nothing is charged now: we book with ${esc(u.who)}, then email your confirmation and a secure payment link for the amount due: ${R(q.total)}, or a deposit if ${esc(u.who)} takes one.`}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn line" type="button" id="b-back">← Change dates</button><button class="btn primary" type="submit" id="b-go">${PAYMENTS ? `Pay ${R(q.total)} and book` : "Book these dates"}</button></div>
            ${isSample("createBooking") ? `<span class="muted" style="font-size:.8rem">Prototype: no payment is taken and nothing is sent to the operator.</span>` : ""}
          </form>
          ${aside()}
        </div>`);
      } else {
        shell(`<div class="hsflow">
          <form class="card panel" id="payf">
            ${contactFields()}
            <label class="field hscheck"><input type="checkbox" id="c-flex" ${draft.flex ? "checked" : ""}> My dates are flexible by a few days if these nights aren't free</label>
            <label class="field">Anything we should ask ${esc(u.who)}? (optional)<textarea id="c-notes" rows="3" placeholder="e.g. we'd prefer the cottage closest to the river, one vegetarian, arriving late">${esc(draft.notes || "")}</textarea></label>
            <label class="field hscheck"><input type="checkbox" required> I agree that Trailscape may share my name and contact details with ${esc(u.who)} to check availability for this enquiry.</label>
            <div class="note">No payment now. We'll email ${esc(u.who)} for you and reply within about 48 hours with availability and the exact price. You pay only once availability is confirmed.</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn line" type="button" id="b-back">← Change dates</button><button class="btn primary" type="submit" id="b-go">Send enquiry</button></div>
            ${isSample("createEnquiry") ? `<span class="muted" style="font-size:.8rem">Prototype: nothing is sent to the operator.</span>` : ""}
          </form>
          ${aside()}
        </div>`);
      }
      $("#b-sum").innerHTML = summaryHTML(u, q, draft.n);
      $("#b-back").onclick = () => { Object.assign(draft, guest(), { notes: $("#c-notes").value, flex: !!($("#c-flex") || {}).checked }); s1(); };
      $("#payf").onsubmit = async e => {
        e.preventDefault();
        const go = $("#b-go"), label = go.textContent; go.disabled = true; go.textContent = live ? "Placing your booking…" : "Sending your enquiry…";
        const base = { stayId: u.id, stayName: u.name, operator: u.opLabel, checkIn: q.in, checkOut: q.out, nights: q.nights, hikers: draft.n,
          guest: guest(), notes: $("#c-notes").value.trim() };
        const payload = live
          ? { ...base, engine: u.engine, payMethod: (document.querySelector('input[name="gw"]:checked') || {}).value || "card",
              quote: { stayFees: q.stay, serviceFee: q.fee, total: q.total, estimated: u.est, currency: "ZAR" } }
          : { ...base, flexibleDates: $("#c-flex").checked, guidePrice: { stayFees: q.stay, serviceFee: q.fee, total: q.total, currency: "ZAR" } };
        try {
          const res = await call(live ? "createBooking" : "createEnquiry", payload);
          const ref = res.ref || "HS-" + (1043 + myTrips.length);
          myTrips.unshift({ ref, place: u.id, kind: live ? "booking" : "enquiry", date: q.in, out: q.out, nights: q.nights, n: draft.n, total: q.total, made: Date.now() });
          store.set("trips", myTrips);
          draft = null;
          s3(ref);
        } catch (err) {
          console.warn(live ? "Booking failed" : "Enquiry failed", err); go.disabled = false; go.textContent = label;
          toast(live ? "We couldn't place the booking. Nothing was charged. Please try again." : "We couldn't send your enquiry. Please try again.");
        }
      };
    }
    function s3(ref) {
      stage = 3;
      const evs = live && !PAYMENTS
        ? [["Booking received", "Your beds are held. Nothing charged yet"], [`Booking with ${u.who}`, `We reserve your dates in ${calText(u)}`], ["Confirmed", "We email your confirmation and a payment link for the amount due"]]
        : live
        ? [["Booking received", "Payment taken"], [`Booked in ${u.who}'s calendar`, `Your dates are reserved in ${calText(u)}`], ["Confirmed", "Your booking details are sent to your email"]]
        : [["Enquiry received", "No payment taken"], [`Checking with ${u.who}`, "We ask about availability and the exact price"], [`${cap(u.who)} replies`, "Usually within 48 hours"], ["Availability confirmed, you pay", "We send the exact price and a payment link"], ["Confirmed", "Your booking details are sent to your email"]];
      shell(`<div class="card panel">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline"><div><span class="muted" style="font-size:.85rem">${live ? "Booking" : "Enquiry"} reference</span><div class="mono" style="font-size:1.2rem">${esc(ref)}</div></div><span class="tag info" id="stat-tag">In progress</span></div>
        <div class="muted" style="font-size:.92rem">${fmtLong(q.in)} → ${fmtLong(q.out)} · ${q.nights} ${q.nights === 1 ? "night" : "nights"} · ${live ? R(q.total) : "guide price " + R(q.total)}</div>
        <div class="track" id="trk">${evs.map((e, i) => `<div class="trk" data-i="${i}"><span class="dot"></span><div><b>${esc(e[0])}</b><span>${esc(e[1])}</span></div><time></time></div>`).join("")}</div>
        ${live ? "" : `<div class="note">We'll email you as soon as ${esc(u.who)} replies. Your enquiry is saved in My trips.</div>`}
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn line" href="#trips">View my trips</a></div></div>`);
      const limit = live && PAYMENTS ? evs.length : live ? 1 : 2; let i = 0;
      const tick = () => {
        if (!$("#trk")) return;
        document.querySelectorAll(".trk").forEach(r => { const k = +r.dataset.i; r.classList.toggle("done", k < i); r.classList.toggle("now", k === i && i < limit); if (k < i && !r.querySelector("time").textContent) r.querySelector("time").textContent = new Date().toTimeString().slice(0, 5); });
        if (i >= limit) { const done = live && PAYMENTS; $("#stat-tag").textContent = done ? "Confirmed" : live ? `Booking with ${u.who}` : `Waiting for ${u.who}`; $("#stat-tag").className = "tag " + (done ? "ok" : "warn"); return; }
        i++; setTimeout(tick, 900);
      };
      setTimeout(tick, 400);
    }
    if (draft.in && draft.out) {
      // Dates came from the stay page: check them, then go straight to details.
      stage = 1; s1();
      const wait = setInterval(() => { if (!cal) return; const s = cal.sel(); if (cal.valid() && s.in === draft.in && s.out === draft.out) { clearInterval(wait); q = quoteOf(u, cal, draft.n); s2(); } }, 60);
      setTimeout(() => clearInterval(wait), 4000);
    } else s1();
  };

  // ---------- my trips: sign in here (account.js), then your enquiries and bookings from the server ----------
  const ACCT = () => window.TSAccount;
  const tripRow = (t, [s, c]) => {
    const u = getU(t.place), p = u ? null : place(t.place), name = u ? u.name : p ? p.name : t.place;
    return `<a class="row" href="#stay-${esc(t.place)}"><div><h3>${esc(name)}</h3><div class="meta"><span class="mono">${esc(t.ref)}</span><span>${t.out ? `${fmtShort(t.date)} → ${fmtShort(t.out)}` : fmtDate(t.date)}</span><span>${t.n} ${t.n === 1 ? "hiker" : "hikers"}</span>${t.kind === "enquiry" ? "<span>Enquiry</span>" : ""}</div></div>
      <div class="right"><b>${t.kind === "enquiry" ? "≈ " : ""}${t.total != null ? R(t.total) : ""}</b><span class="tag ${c}">${esc(s)}</span></div></a>`;
  };
  function serverStatus(t) {
    const u = getU(t.place), who = u ? u.who : "the operator", past = t.out && t.out <= todayS();
    if (t.kind === "enquiry") return ({ new: [`Enquiry sent · waiting for ${who}`, "warn"], asked_operator: [`Checking with ${who}`, "warn"],
      operator_replied: ["Offer on its way", "info"], offer_sent: ["Offer sent · check your email", "info"], accepted: ["Accepted", "ok"],
      declined: ["Declined", "mute"], unavailable: ["Not available", "mute"], cancelled: ["Cancelled", "mute"] })[t.status] || [t.status, "mute"];
    if (t.status === "confirmed") return past ? ["Completed", "mute"] : ["Confirmed", "ok"];
    if (t.status === "cancelled" || t.status === "failed") return ["Cancelled", "mute"];
    return [`Booked · confirming with ${who}`, "warn"];
  }
  function alertsHTML() {
    const ids = Object.keys(store.get("alerts", {}));
    const nameOf = id => { const u = getU(id); if (u) return u.name; const p = place(id); return p ? p.name : id; };
    return `<h2 style="font-size:1.4rem;margin-top:8px">Cancellation alerts</h2>
    <div class="list">${ids.map(id => `<a class="row" href="#stay-${esc(id)}"><div><h3>${esc(nameOf(id))}</h3><div class="meta"><span>Watching all dates</span></div></div><div class="right"><span class="tag info">Alert on</span></div></a>`).join("") || `<p class="muted">No alerts yet. Turn one on from any stay page.</p>`}</div>`;
  }
  // Without the API (local prototype), trips made in this browser.
  function localTrips() {
    const status = t => t.kind === "enquiry" ? [`Enquiry sent · waiting for ${(getU(t.place) || {}).who || "the operator"}`, "warn"] : [`Booked · confirming with ${(getU(t.place) || {}).who || "the stay"}`, "warn"];
    view.innerHTML = `<div class="wrap phead"><div class="eyebrow">Account</div><h1>My trips</h1><p class="lead">Trips made in this browser.</p></div>
    <div class="wrap"><div class="list">${myTrips.map(t => tripRow(t, status(t))).join("") || `<p class="muted" style="padding:18px 0 0">No bookings or enquiries yet. <a href="#map">Find a stay</a> to see one appear here.</p>`}</div>${alertsHTML()}</div>`;
  }
  trips = function () {
    const A = ACCT();
    if (!cfg.apiBase || !A) return localTrips();
    const head = lead => `<div class="wrap phead"><div class="eyebrow">Account</div><h1>My trips</h1><p class="lead">${lead}</p></div>`;
    if (!A.user) {
      view.innerHTML = head("Sign in to see your bookings and enquiries.") + `<div class="wrap"><div id="acct-box"><p class="muted">One moment…</p></div>
        <p class="muted" style="font-size:.88rem;margin-top:18px">Booked without an account? Create one with the same email address and your trips appear here.</p></div>`;
      A.ready.then(() => {
        if (route() !== "trips") return;
        if (A.user) return nav();
        A.renderSignIn($("#acct-box"), () => { if (route() === "trips") nav(); });
      });
      return;
    }
    const me = A.user;
    view.innerHTML = head("Every booking and enquiry made with your email address, and its status.") + `
      <div class="wrap"><div class="card panel acct-who"><div><b>${esc(me.name)}</b><div class="muted" style="font-size:.9rem">${esc(me.email)}${me.phone ? " · " + esc(me.phone) : ""}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${me.admin ? `<a class="btn line sm" href="/admin.html">Back office</a>` : ""}<button class="btn line sm" type="button" id="acct-out">Sign out</button></div></div>
      <div class="list" id="trip-list"><p class="muted" style="padding:18px 0 0">Loading your trips…</p></div>${alertsHTML()}</div>`;
    $("#acct-out").onclick = async () => { await A.signOut(); if (route() === "trips") nav(); };
    fetch(cfg.apiBase.replace(/\/$/, "") + "/me/trips", { credentials: "same-origin" }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(({ trips: list }) => {
      const el = $("#trip-list"); if (!el) return;
      const rows = list.map(t => ({ ref: t.ref, place: t.stay_id, kind: t.kind, date: t.check_in, out: t.check_out, n: t.hikers, total: t.total, status: t.status }));
      el.innerHTML = rows.map(t => tripRow(t, serverStatus(t))).join("") || `<p class="muted" style="padding:18px 0 0">No bookings or enquiries yet. <a href="#map">Find a stay</a> to see one appear here.</p>`;
    }).catch(err => {
      if (err === 401) { A.signOut().then(() => route() === "trips" && nav()); return; }
      const el = $("#trip-list"); if (el) el.innerHTML = `<p class="muted" style="padding:18px 0 0">We couldn't load your trips. Please refresh the page.</p>`;
    });
  };
  if (ACCT()) ACCT().onChange(() => { if (route() === "trips" && !document.querySelector(".acct")) nav(); });

  // ---------- stays list: every stay, Instant booking or Easy enquire ----------
  huts = function (regionArg) {
    const f = { mode: regionArg === "enquire" ? "enquiry" : regionArg === "instant" ? "instant" : null, region: REG[regionArg] ? regionArg : null, q: "", show: 40, sort: "name" };
    const regions = [...new Set(allU().map(u => u.regionKey))].sort((a, b) => REG[a].localeCompare(REG[b]));
    view.innerHTML = `
    <div class="wrap phead"><div class="eyebrow">Stays &amp; cabins</div><h1>Every overnight stay, one list.</h1>
      <p class="lead">Every stay is either <b>Instant booking</b>, where we book straight into the CapeNature, SANParks or NightsBridge calendar and you pay when you book, or <b>Easy enquire</b>, where we email the stay for you and you pay once availability is confirmed.</p>
      <div class="filters" id="f-ops"></div>
      <div class="filters"><select id="f-region" class="chip" aria-label="Region"><option value="">All regions</option>${regions.map(k => `<option value="${k}" ${k === f.region ? "selected" : ""}>${esc(REG[k])}</option>`).join("")}</select>
      <select id="f-sort" class="chip" aria-label="Sort"><option value="name">A to Z</option><option value="price">Lowest price</option><option value="beds">Most beds</option></select>
      <input id="f-q" class="chip" type="search" placeholder="Search stays, places, trails" aria-label="Search stays" style="min-width:0;flex:1 1 180px"></div>
      <p class="hscount" id="hcount"></p>
    </div>
    <div class="wrap"><div class="list" id="hl"></div><div class="hsmore" id="hmore"></div></div>`;
    const fo = $("#f-ops");
    fo.innerHTML = `<button class="chip" aria-pressed="${!f.mode}" data-mode="">All</button>` + Object.entries(BOOK_MODES).map(([k, b]) => `<button class="chip" aria-pressed="${f.mode === k}" data-mode="${k}" style="--c:${b.c}"><i></i>${b.label}</button>`).join("");
    fo.querySelectorAll(".chip").forEach(b => b.onclick = () => { f.mode = b.dataset.mode || null; f.show = 40; fo.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    $("#f-region").onchange = e => { f.region = e.target.value || null; f.show = 40; draw(); };
    $("#f-sort").onchange = e => { f.sort = e.target.value; draw(); };
    $("#f-q").oninput = e => { f.q = e.target.value.trim().toLowerCase(); f.show = 40; draw(); };
    function draw() {
      const l = allU().filter(u => (!f.mode || u.mode === f.mode) && (!f.region || u.regionKey === f.region)
        && (!f.q || [u.name, u.kind, u.region, u.loc, u.hike, u.opLabel, (u.stops || []).join(" ")].join(" ").toLowerCase().includes(f.q)));
      l.sort(f.sort === "price" ? (a, b) => a.price - b.price : f.sort === "beds" ? (a, b) => b.beds - a.beds : (a, b) => (instant(b) - instant(a)) || a.name.localeCompare(b.name));
      $("#hcount").textContent = `${l.length} ${l.length === 1 ? "stay" : "stays"}${ready ? "" : " (loading more…)"}`;
      $("#hl").innerHTML = l.length ? l.slice(0, f.show).map(u => `
        <a class="row" href="#stay-${u.id}"><div><h3>${esc(u.name)}</h3><div class="meta">${tagOp(u)}<span>${esc(u.kind)}</span><span>${esc(u.region)}</span><span>${u.beds} beds</span></div></div>
        <div class="right"><b>from ${R(u.price)}</b><span class="muted">pp per night${u.est ? " (est.)" : ""}</span><br>${modeTag(u)}</div></a>`).join("")
        : `<p class="muted" style="padding:24px 0">No stays match. Clear the search or pick another region.</p>`;
      $("#hmore").innerHTML = l.length > f.show ? `<button class="btn line" type="button">Show more (${l.length - f.show} left)</button>` : "";
      const mb = $("#hmore button"); if (mb) mb.onclick = () => { f.show += 40; draw(); };
    }
    draw();
  };

  // ---------- map: the accommodation card books or enquires on this site instead of linking out ----------
  function fixCard(card) {
    const idEl = card.querySelector(".fine span:last-child"); if (!idEl) return;
    const u = getU(idEl.textContent.trim()); if (!u) return;
    card.querySelectorAll(".contact").forEach(x => x.remove());
    card.querySelectorAll(".fine a").forEach(a => a.remove());
    card.querySelectorAll('a[target="_blank"], a[href^="http"]').forEach(a => a.remove());
    const box = document.createElement("div");
    box.className = "hsbook";
    box.innerHTML = `<div class="p"><span>from <b>${R(u.price)}</b> pp per night${u.est ? `<span class="hsest">est.</span>` : ""}</span>${modeTag(u)}</div>
      <div class="btns"><a class="btn primary sm" href="#book-${u.id}">${instant(u) ? "Check dates" : "Easy enquire"}</a><a class="btn line sm" href="#stay-${u.id}">View stay</a></div>
      <small>${instant(u) ? "Live calendar. Pay when you book (full amount or deposit)." : "We email the stay for you. Pay once availability is confirmed."}</small>`;
    const dl = card.querySelector("dl");
    if (dl) dl.after(box); else card.appendChild(box);
  }
  const mo = new MutationObserver(() => { const c = document.getElementById("scard"); if (c && !c.hidden && c.querySelector("h3") && !c.querySelector(".hsbook")) fixCard(c); });
  mo.observe(document.getElementById("view"), { childList: true, subtree: true });

  // ---------- start ----------
  const ROUTES = new Set(["stay", "hut", "stays", "huts", "book", "trips", "ops"]);
  const route = () => (location.hash.slice(1) || "home").split("-")[0];
  if (ROUTES.has(route())) nav();
  let tries = 0;
  (function wait() {
    if (typeof STAYS !== "undefined") { loadStays(); if (ROUTES.has(route())) nav(); return; }
    if (++tries > 300) { console.warn("Accommodation data did not load; only trail packages are bookable"); ready = true; if (ROUTES.has(route())) nav(); return; }
    setTimeout(wait, 50);
  })();
})();
