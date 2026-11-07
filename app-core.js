const MT_KEY = "27JuJeSB9d8UBWy1o6PZ"; // MapTiler key (restricted to the site address)
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const R = n => "R" + Math.round(n).toLocaleString("en-ZA").replace(/,/g, " ");
const FEE = 100; // Trailscape service fee, rand per person per booking
const CARD = 0.03; // estimated gateway fee on the full amount

const OPS = {
  cn: { label: "CapeNature", c: "#3d7a4f", channel: "portal" },
  sp: { label: "SANParks", c: "#b07a1f", channel: "email" },
  pv: { label: "Private", c: "#2f6a96", channel: "email" },
  cm: { label: "Community", c: "#7a4f8f", channel: "email" },
};

// ---------- sample data (approximate; verify before launch) ----------
const PLACES = [
  { id: "whale", name: "Whale Trail", op: "cn", lat: -34.42, lng: 20.62, region: "overberg", kind: "Multi-day trail", nights: 4, km: 55, grade: "Moderate", beds: 12, price: 590,
    huts: ["Potberg", "Cupidoskraal", "Noetsie", "Hamerkop", "Vaalkrans"], blurb: "Coastal multi-day route through De Hoop Nature Reserve, from Potberg mountain to the limestone coast. Very popular, so dates often sell out up to a year ahead. Cancellation alerts matter most here." },
  { id: "otter", name: "Otter Trail", op: "sp", lat: -34.03, lng: 23.75, region: "garden", kind: "Multi-day trail", nights: 4, km: 45, grade: "Hard", beds: 12, price: 620,
    huts: ["Ngubu", "Scott", "Oakhurst", "André"], blurb: "South Africa's best-known coastal trail, from Storms River Mouth to Nature's Valley, with river crossings timed to the tides. Starts just over the Eastern Cape border." },
  { id: "outeniqua", name: "Outeniqua Trail", op: "sp", lat: -33.95, lng: 23.1, region: "garden", kind: "Multi-day trail", nights: 7, km: 108, grade: "Moderate", beds: 30, price: 180,
    huts: ["Windmeulnek", "Platbos", "Millwood", "Rondebossie", "Diepwalle", "Fiesantehoek", "Harkerville"], blurb: "Forest trail through the Knysna forests. Booked by phone or email with SANParks, with payment due shortly after." },
  { id: "cogh", name: "Cape of Good Hope Trail", op: "sp", lat: -34.33, lng: 18.43, region: "peninsula", kind: "Overnight trail", nights: 1, km: 33.8, grade: "Moderate", beds: 18, price: 450,
    huts: ["Erica (6 sleeper)", "Protea (12 sleeper)"], blurb: "Two-day circular route that starts and ends at the Cape Point gate. Minimum two hikers; stays have a base rate of 4 or 8 people." },
  { id: "landdroskop", name: "Landdroskop Huts", op: "cn", lat: -34.045, lng: 19.045, region: "hh", kind: "Mountain stays", nights: 1, km: 12, grade: "Moderate", beds: 30, price: 240,
    huts: ["Landdroskop (2 stays)"], blurb: "Reached from Nuweberg via the Sphinx route. Weather turns fast, so this is for fit, well-equipped hikers. Children under 12 aren't allowed on overnight trails." },
  { id: "swellendam", name: "Swellendam Hiking Trail", op: "cn", lat: -33.995, lng: 20.44, region: "overberg", kind: "Multi-day trail", nights: 5, km: 74, grade: "Hard", beds: 24, price: 220,
    huts: ["Koloniesbos", "Wolfkloof", "Proteavallei", "Nooitgedacht"], blurb: "Langeberg circuit from Marloth Nature Reserve, with shorter loop options." },
  { id: "oukraal", name: "Oukraal Huts", op: "cn", lat: -33.72, lng: 21.92, region: "karoo", kind: "Herders' stays", nights: 1, km: 0, grade: "Moderate", beds: 8, price: 260,
    huts: ["4 herders' stays"], blurb: "Four stays on a plateau in Gamkaberg Nature Reserve, sleeping eight people in total." },
  { id: "swartberg", name: "Swartberg Hiking Trail", op: "cn", lat: -33.36, lng: 22.05, region: "karoo", kind: "Multi-day trail", nights: 4, km: 0, grade: "Hard", beds: 30, price: 200,
    huts: ["Ou Tol", "Bothashoek"], blurb: "High route across the Swartberg between Oudtshoorn and Prince Albert." },
  { id: "sneeuberg", name: "Sneeuberg Hut", op: "cn", lat: -32.48, lng: 19.16, region: "cederberg", kind: "Mountain stay", nights: 1, km: 0, grade: "Hard", beds: 12, price: 180,
    huts: ["Sneeuberg"], blurb: "Basic stay below the Cederberg's highest peak. Overnight permits come from CapeNature." },
  { id: "arangieskop", name: "Arangieskop Hut", op: "cm", lat: -33.79, lng: 19.93, region: "breede", kind: "Mountain stay", nights: 1, km: 19, grade: "Hard", beds: 12, price: 210,
    huts: ["Arangieskop"], blurb: "Steep overnight climb from Dassieshoek above Robertson, with a stay near the summit ridge." },
  { id: "heritage", name: "Cederberg Heritage Route", op: "cm", lat: -32.27, lng: 19.22, region: "cederberg", kind: "Guided village route", nights: 3, km: 0, grade: "Moderate", beds: 10, price: 950,
    huts: ["Wupperthal", "Heuningvlei", "Brugkraal"], blurb: "Community-run guided route linking Moravian villages, with guesthouse stays along the way." },
  { id: "sanddrif", name: "Sanddrif Cabins", op: "pv", lat: -32.45, lng: 19.25, region: "cederberg", kind: "Cabin base", nights: 1, km: 0, grade: "Easy", beds: 20, price: 380,
    huts: ["Cabins & campsite"], blurb: "Base for day hikes to the Wolfberg Cracks and Maltese Cross." },
  { id: "matroosberg", name: "Matroosberg Huts", op: "pv", lat: -33.37, lng: 19.67, region: "breede", kind: "Mountain stays", nights: 1, km: 0, grade: "Moderate", beds: 16, price: 320,
    huts: ["Mountain stays", "Cottages"], blurb: "Private nature reserve near Ceres, and a popular base for snow hikes in winter." },
  { id: "boesmanskloof", name: "Boesmanskloof Traverse", op: "pv", lat: -33.97, lng: 19.78, region: "breede", kind: "Trail cottages", nights: 1, km: 14, grade: "Moderate", beds: 14, price: 340,
    huts: ["Die Galg cottages"], blurb: "Greyton to McGregor over the Riviersonderend mountains. Most hikers sleep at the McGregor end and walk back." },
  { id: "fivebay", name: "Five Bay Trail", op: "pv", lat: -32.81, lng: 17.89, region: "west", kind: "Slackpack", nights: 2, km: 28, grade: "Easy", beds: 12, price: 1450,
    huts: ["Paternoster guesthouses"], blurb: "Slackpacking along the coast around the fishing village of Paternoster." },
];
const REGIONS = {
  cederberg: "Cederberg", garden: "Garden Route", overberg: "Overberg", karoo: "Klein Karoo", hh: "Hottentots Holland",
  peninsula: "Cape Peninsula", breede: "Breede & Ceres", west: "West Coast",
};

// ---------- media (Unsplash and Pexels licences: free use, no credit required; photographer names kept here for our records) ----------
const HERO_VIDEO = { id: "17786066", by: "Helmut Meijer", page: "https://www.pexels.com/video/wide-view-of-towerkop-pinnacles-17786066/", place: "Towerkop, Klein Swartberg" };
const heroSrc = () => `https://videos.pexels.com/video-files/${HERO_VIDEO.id}/${HERO_VIDEO.id}-${window.innerWidth > 900 ? "hd_1920_1080" : "hd_1280_720"}_30fps.mp4`;
const PHOTOS = {
  dehoop: { id: "photo-1647497508353-6cd45032fef6", by: "Marlin Clark", where: "De Hoop Nature Reserve" },
  storms: { id: "photo-1704034451908-cb1b500900bc", by: "Matthias Wesselmann", where: "Storms River Mouth, Tsitsikamma" },
  capepoint: { id: "photo-1599070158776-9e331c420309", by: "Jean-Baptiste D.", where: "Cape Point" },
  george: { id: "photo-1690969986201-56acaa3794a4", by: "Juan Smith", where: "Outeniqua mountains, George" },
  swellendam: { id: "photo-1652027897155-ce8386119d56", by: "Damien de Gouveia", where: "Langeberg, Swellendam" },
  swellroad: { id: "photo-1657002960606-c52f3bae3013", by: "Adriaan Venner Scheepers", where: "Swellendam" },
  swartberg: { id: "photo-1610299738489-de1b7066aaec", by: "Clara Metivier Beukes", where: "Swartberg Pass" },
  cederberg: { id: "photo-1616258815309-53866115551b", by: "Sean Brookes", where: "Cederberg" },
  tablemtn: { id: "photo-1583409612679-90ecabb5bbb4", by: "Juanita Geldenhuys", where: "Table Mountain" },
  paternoster: { id: "photo-1720206811929-594dc6483578", by: "Grant Durr", where: "Paternoster" },
  franschhoek: { id: "photo-1741338898082-f0d1484d24f8", by: "Hendrik Prinsloo", where: "Franschhoek Pass, Hottentots Holland mountains" },
  ceres: { id: "photo-1563656410378-e5c283afafbc", by: "Brent Ninaber", where: "Snow on the mountains around Ceres" },
};
const PLACE_PHOTO = { whale: "dehoop", otter: "storms", cogh: "capepoint", outeniqua: "george", swellendam: "swellendam", swartberg: "swartberg", sneeuberg: "cederberg", heritage: "cederberg", sanddrif: "cederberg", fivebay: "paternoster" };
const REGION_PHOTO = { cederberg: "cederberg", garden: "george", overberg: "swellroad", karoo: "swartberg", hh: "franschhoek", peninsula: "tablemtn", breede: "ceres", west: "paternoster" };
const photoUrl = (k, w = 900) => `https://images.unsplash.com/${PHOTOS[k].id}?w=${w}&q=72&auto=format&fit=crop`;
// Photo slot for a card: a real photo when we have one for this place, otherwise the drawn ridgeline art.
function media(k, pal, seed, alt) {
  if (k && PHOTOS[k]) return `<div class="ph"><img src="${photoUrl(k)}" srcset="${photoUrl(k, 600)} 600w, ${photoUrl(k, 900)} 900w, ${photoUrl(k, 1400)} 1400w" sizes="(max-width: 560px) 100vw, (max-width: 960px) 50vw, 380px" alt="${esc(alt || PHOTOS[k].where)}" loading="lazy" decoding="async"></div>`;
  return `<canvas data-pal="${pal}" data-seed="${seed}" aria-hidden="true"></canvas>`;
}
const MEDIA_CSS = `
.hero video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.2s ease; z-index: 0; }
.hero video.on { opacity: 1; }
.hero video.front { z-index: 1; }
.hero #heroc { visibility: hidden; }
.hero.still #heroc { visibility: visible; }
.hero .shade { z-index: 2; }
.hero .herowrap { z-index: 3; }
.hero .shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(13,19,33,.18) 0%, rgba(13,19,33,0) 22%, rgba(255,255,255,0) 50%, rgba(255,255,255,.75) 80%, #fff 100%); }
.ph { position: relative; aspect-ratio: 16 / 9; max-width: 100%; overflow: hidden; background: var(--band); }
.feature .ph { aspect-ratio: 4 / 3; border-radius: 10px; }
.ph img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .5s ease; }
.tile:hover .ph img { transform: scale(1.04); }
.ph .cr { position: absolute; left: 8px; bottom: 6px; right: 8px; font-size: .68rem; color: rgba(255,255,255,.9); text-shadow: 0 1px 3px rgba(0,0,0,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rhead { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.rnav { display: flex; gap: 8px; flex: none; }
.rbtn { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--line); background: var(--card, #fff); color: var(--fg); font-size: 1.1rem; cursor: pointer; }
.rbtn:disabled { opacity: .35; cursor: default; }
.rcar { display: flex; gap: 18px; margin-top: 36px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 2px 2px 10px; scroll-padding: 2px; }
.rcar::-webkit-scrollbar { display: none; }
.rcar .tile { flex: 0 0 calc((100% - 36px) / 3); scroll-snap-align: start; }
@media (max-width: 960px) { .rcar .tile { flex-basis: calc((100% - 18px) / 2); } }
@media (max-width: 560px) { .rcar .tile { flex-basis: 85%; } .rnav { display: none; } }
.stayphoto { margin: 0 0 24px; border-radius: var(--radius); overflow: hidden; }
.stayphoto .ph { aspect-ratio: 21 / 9; }
@media (prefers-reduced-motion: reduce) { .ph img { transition: none; } .tile:hover .ph img { transform: none; } }
`;
(() => { const st = document.createElement("style"); st.textContent = MEDIA_CSS; document.head.appendChild(st); })();

// ---------- state ----------
let draft = null;   // current booking being made
let maps = [];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("lt-" + k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("lt-" + k, JSON.stringify(v)); } catch (e) {} },
};
let myTrips = store.get("trips", []);

// ---------- helpers ----------
const place = id => PLACES.find(p => p.id === id);
function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
function opTag(p) { return `<span class="op" style="--c:${OPS[p.op].c}"><i></i>${OPS[p.op].label}</span>`; }
function chanIcon(c) {
  return c === "portal"
    ? `<span class="chan"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="13" height="10" rx="1.5"/><path d="M1.5 5.5h13"/></svg>Online portal</span>`
    : `<span class="chan"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M2 4l6 5 6-5"/></svg>Email</span>`;
}
function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function quote(p, n, nightsOverride) {
  const nights = nightsOverride || p.nights;
  const provider = p.price * n * Math.max(1, nights);
  const fee = FEE * n;
  return { provider, fee, total: provider + fee, nights };
}
function clearMaps() { maps.forEach(m => { try { m.remove(); } catch (e) {} }); maps = []; }

// ---------- map (MapLibre + MapTiler) ----------
const MSTYLES = { outdoor: ["Outdoor", "outdoor-v2"], topo: ["Topo", "topo-v2"], satellite: ["Satellite", "hybrid"] };
let mstyle = store.get("mstyle", "outdoor"); if (!MSTYLES[mstyle]) mstyle = "outdoor";
let m3d = false;
const styleUrl = s => `https://api.maptiler.com/maps/${MSTYLES[s][1]}/style.json?key=${MT_KEY}`;
const FONT = ["Noto Sans Bold"];
class StyleCtl {
  onAdd(map) {
    const d = document.createElement("div"); d.className = "maplibregl-ctrl mstyle";
    d.innerHTML = Object.entries(MSTYLES).map(([k, v]) => `<button type="button" data-s="${k}" class="${k === mstyle ? "on" : ""}">${v[0]}</button>`).join("") + `<button type="button" data-s="3d" class="${m3d ? "on" : ""}" title="3D terrain">3D</button>`;
    d.onclick = e => {
      const b = e.target.closest("button"); if (!b) return; const s = b.dataset.s;
      if (s === "3d") { m3d = !m3d; b.classList.toggle("on", m3d); apply3d(map, true); return; }
      if (s === mstyle) return;
      mstyle = s; store.set("mstyle", s);
      d.querySelectorAll("button").forEach(x => { if (x.dataset.s !== "3d") x.classList.toggle("on", x.dataset.s === s); });
      map.setStyle(styleUrl(s));
    };
    this.d = d; return d;
  }
  onRemove() { this.d.remove(); }
}
function apply3d(m, animate) {
  if (m3d) {
    if (!m.getSource("dem")) m.addSource("dem", { type: "raster-dem", url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MT_KEY}`, tileSize: 256 });
    m.setTerrain({ source: "dem", exaggeration: 1.4 });
    if (animate) m.easeTo({ pitch: 62, duration: 900 });
  } else {
    if (m.getTerrain && m.getTerrain()) m.setTerrain(null);
    if (animate) m.easeTo({ pitch: 0, duration: 700 });
  }
}
function baseMap(el, opts = {}, onStyle = () => {}) {
  const { styleCtl = true, ...rest } = opts;
  const m = new maplibregl.Map({ container: el, style: styleUrl(mstyle), center: [20.4, -33.6], zoom: 6, maxPitch: 75, attributionControl: { compact: true }, ...rest });
  m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  if (styleCtl) m.addControl(new StyleCtl(), "top-left");
  m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  m.on("style.load", () => { apply3d(m, false); onStyle(m); });
  maps.push(m); return m;
}
function hutsFC(list) {
  return { type: "FeatureCollection", features: list.map(p => ({ type: "Feature", properties: { id: p.id, name: p.name, color: OPS[p.op].c }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })) };
}
function addHuts(m, list, onPick) {
  m.addSource("huts", { type: "geojson", data: hutsFC(list), cluster: true, clusterRadius: 44, clusterMaxZoom: 8 });
  m.addLayer({ id: "cl", type: "circle", source: "huts", filter: ["has", "point_count"],
    paint: { "circle-color": "#0d1321", "circle-radius": ["step", ["get", "point_count"], 15, 5, 19, 10, 24], "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" } });
  try {
  m.addLayer({ id: "cl-n", type: "symbol", source: "huts", filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true }, paint: { "text-color": "#ffffff" } });
  } catch (e) { console.warn("labels unavailable", e); }
  m.addLayer({ id: "pt", type: "circle", source: "huts", filter: ["!", ["has", "point_count"]],
    paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 6.5, 12, 9], "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } });
  try {
  m.addLayer({ id: "pt-l", type: "symbol", source: "huts", filter: ["!", ["has", "point_count"]], minzoom: 8.5,
    layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 12, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
    paint: { "text-color": "#0d1321", "text-halo-color": "#ffffff", "text-halo-width": 1.6 } });
  } catch (e) { console.warn("labels unavailable", e); }
  if (m._hh) return; m._hh = true;
  m.on("click", "cl", async e => {
    const f = e.features[0];
    try { const z = await m.getSource("huts").getClusterExpansionZoom(f.properties.cluster_id); m.easeTo({ center: f.geometry.coordinates, zoom: z + 0.2 }); } catch (err) {}
  });
  m.on("click", "pt", e => onPick && onPick(e.features[0].properties.id));
  const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  m.on("mouseenter", "pt", e => { m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.features[0].geometry.coordinates).setText(e.features[0].properties.name).addTo(m); });
  m.on("mouseleave", "pt", () => { m.getCanvas().style.cursor = ""; pop.remove(); });
  m.on("mouseenter", "cl", () => m.getCanvas().style.cursor = "pointer");
  m.on("mouseleave", "cl", () => m.getCanvas().style.cursor = "");
}
function addRoute(m, coords) {
  m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
  m.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.85 } });
  m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#00a043", "line-width": 3.5, "line-dasharray": [2, 1.6] } });
}
function htmlMarker(m, lng, lat, cls, html = "", title = "") {
  const el = document.createElement("div"); el.className = "pin " + cls; el.innerHTML = html; if (title) el.title = title;
  return new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
}
function boundsOf(coords) { const b = new maplibregl.LngLatBounds(coords[0], coords[0]); coords.forEach(c => b.extend(c)); return b; }

// ---------- hero art: layered Cape fold ridgelines ----------
function drawRidges(cv, seed = 1, palette) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const P = palette || { sky: ["#c98a62", "#7d6a63", "#3b4440"], layers: ["#6f6a68", "#545656", "#3d4440", "#2c332e", "#1e231f"], sun: "#f1c48f" };
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, P.sky[2]); sky.addColorStop(0.55, P.sky[1]); sky.addColorStop(0.85, P.sky[0]);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sx = w * (0.62 + rnd() * 0.2), sy = h * 0.5;
  const glow = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.45); glow.addColorStop(0, P.sun + "cc"); glow.addColorStop(1, P.sun + "00");
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  P.layers.forEach((col, i) => {
    const base = h * (0.42 + i * 0.12), amp = h * (0.16 - i * 0.02);
    const f1 = 1.5 + rnd() * 2, f2 = 5 + rnd() * 6, ph = rnd() * 10, ph2 = rnd() * 10;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const t = x / w;
      // Cape fold mountains: long tilted strata with flat-ish tops and steep faces
      let y = Math.sin(t * f1 * Math.PI + ph) * 0.6 + Math.sin(t * f2 * Math.PI + ph2) * 0.25 + Math.sin(t * 23 + i) * 0.05;
      y = Math.max(-0.75, Math.min(0.85, y));
      g.lineTo(x, base - y * amp);
    }
    g.lineTo(w, h); g.closePath(); g.fillStyle = col; g.fill();
  });
  const shade = g.createLinearGradient(0, 0, w, 0); shade.addColorStop(0, "rgba(16,20,17,.62)"); shade.addColorStop(0.65, "rgba(16,20,17,.15)"); shade.addColorStop(1, "rgba(16,20,17,0)");
  g.fillStyle = shade; g.fillRect(0, 0, w, h);
}
const TILE_PAL = [
  { sky: ["#d9a477", "#a48c80", "#64706c"], layers: ["#9b9188", "#7b7670", "#5a5d57", "#3f4640"], sun: "#f7d3a1" },
  { sky: ["#9fb7bd", "#7f9aa3", "#55707a"], layers: ["#7c8d8a", "#5f706b", "#475650", "#323d38"], sun: "#e9f0e6" },
  { sky: ["#e0b78b", "#c4977a", "#8b6f66"], layers: ["#b18a6c", "#8f6e59", "#6b5547", "#4a3c33"], sun: "#ffe1b0" },
];

// ---------- views ----------
const view = $("#view");
function nav() {
  const r = (location.hash.slice(1) || "home");
  const [name, arg] = [r.split("-")[0], r.split("-").slice(1).join("-")];
  if (name === "planner") { location.replace(arg && place(arg) ? "#stay-" + arg : "#map"); return; } // planner page removed
  clearMaps();
  const navName = { stay: "stays", huts: "stays", hut: "stays" }[name] || name;
  document.querySelectorAll(".links a").forEach(a => a.classList.toggle("on", a.dataset.r === navName));
  $("#links").classList.remove("open"); $("#menu").setAttribute("aria-expanded", "false");
  const fn = { home, map: mapPage, trails, stays: huts, huts, stay: hut, hut, book, trips, ops }[name] || home;
  fn(arg);
  if (name !== "map") footer();
  window.scrollTo(0, 0);
}

function footer() {
  view.insertAdjacentHTML("beforeend", `
  <footer><div class="wrap">
    <div class="cols">
      <div><a class="logo" href="#home" style="color:var(--fg)">Trailscape</a><p class="muted" style="max-width:34ch;margin:10px 0 0">Plan and book hikes in South Africa. We find the stays, check the dates and book on your behalf.</p></div>
      <div><h4>Plan</h4><a href="#map">Map</a><a href="#trails">Trails</a><a href="#stays">Stays</a></div>
      <div><h4>Account</h4><a href="#trips">My trips</a><a href="/admin.html" data-admin-link ${window.TSAccount && TSAccount.user && TSAccount.user.admin ? "" : "hidden"}>Back office</a></div>
      <div><h4>Contact</h4><a href="mailto:hello@trailscape.co.za">hello@trailscape.co.za</a><a href="mailto:hello@trailscape.co.za?subject=List%20my%20stay%20on%20Trailscape">List your stay</a></div>
    </div>
    <div class="fine"><span>© 2026 Trailscape. Independent project, not affiliated with CapeNature or SANParks.</span><span>Pack light, book early, bring rusks.</span></div>
  </div></footer>`);
}

// Hero video: two stacked copies of the same clip. Near the end of one, the other starts from
// the beginning and fades in on top, so there is always a video frame on screen and the
// drawn ridgelines never show through. The drawn art is only used when the video can't play.
function startHeroVideo() {
  const hero = $(".hero"), vids = [...document.querySelectorAll(".hero .herov")];
  if (!hero || !vids.length) return;
  const still = () => hero.classList.add("still");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  if (calm) return still(); // drawn ridgelines for people who prefer less motion or save data
  const FADE = 1.2; // seconds; matches the CSS opacity transition
  const src = heroSrc();
  let cur = vids[0], next = vids[1], swapping = false;
  // If the video hasn't started after a few seconds (slow or blocked network), show the drawn art.
  const slow = setTimeout(still, 6000);
  cur.addEventListener("error", () => { clearTimeout(slow); still(); });
  cur.addEventListener("playing", () => {
    clearTimeout(slow);
    cur.classList.add("on", "front");
    if (next && !next.src) { next.src = src; next.load(); } // buffer the second copy once the first is playing
  }, { once: true });
  function swap() {
    swapping = true;
    next.currentTime = 0;
    next.play().then(() => {
      next.classList.add("front", "on");
      cur.classList.remove("front");
      setTimeout(() => {
        cur.classList.remove("on"); cur.pause();
        [cur, next] = [next, cur]; swapping = false;
      }, FADE * 1000 + 150);
    }).catch(() => { swapping = false; });
  }
  vids.forEach(v => {
    v.addEventListener("timeupdate", () => {
      if (v !== cur || swapping || !next || !v.duration) return;
      if (v.duration - v.currentTime < FADE + 0.3) swap();
    });
    // Fallback if the crossfade couldn't start: restart in place without fading out.
    v.addEventListener("ended", () => { if (v === cur && !swapping) { v.currentTime = 0; v.play().catch(() => {}); } });
  });
  cur.src = src;
  cur.play().catch(() => {});
}

function home() {
  const feat = ["whale", "otter", "cogh"];
  view.innerHTML = `
  <section class="hero"><canvas id="heroc" aria-hidden="true"></canvas>
    <video id="herov" class="herov" muted playsinline preload="auto" aria-hidden="true"></video>
    <video class="herov" muted playsinline preload="auto" aria-hidden="true"></video>
    <div class="shade"></div>
    <div class="wrap herowrap">
      <div class="herocard">
        <h1>Take a hike</h1>
        <p class="herosub">Plan and book hikes in South Africa</p>
        <div class="herorows">
          <a class="herorow" href="#map"><b>Map</b><span class="pills"><span class="pill live">Every stay</span><span class="pill">Western Cape</span></span></a>
          <a class="herorow" href="#trails"><b>Trails</b><span class="pills"><span class="pill live">Bookable</span><span class="pill">Multi-day</span></span></a>
          <a class="herorow" href="#stays"><b>Stays</b><span class="pills"><span class="pill live">${PLACES.length} listed</span><span class="pill">4 operators</span></span></a>
        </div>
      </div>
    </div>
  </section>

  <section class="band"><div class="wrap split">
    <div>
      <h2 class="h2">Book a hike in 3 steps.</h2>
      <p class="lead">One place for CapeNature, SANParks, community and private stays.</p>
      <p style="margin-top:28px"><a class="btn primary" href="#map">Explore the map →</a></p>
    </div>
    <div class="steps">
      <div class="step"><span class="n">01</span><b>Pick a trail or stay</b><span>Search the map or start from a classic route like the Whale Trail.</span></div>
      <div class="step"><span class="n">02</span><b>We check your dates</b><span>Online portals are checked instantly. Email-only stays are contacted for you.</span></div>
      <div class="step"><span class="n">03</span><b>Pay once, get confirmed</b><span>Your card is only charged once the beds are secured. One booking reference for everything.</span></div>
    </div>
  </div></section>

  <section class="band alt"><div class="wrap">
    <div class="eyebrow">Classic routes</div>
    <h2 class="h2">Start from a trail people already love.</h2>
    <div class="grid3">${feat.map((id, i) => { const p = place(id); return `
      <a class="tile" href="#stay-${id}">${media(PLACE_PHOTO[id], i, i + 3, p.name)}
        <div class="body"><span style="font-size:.85rem">${opTag(p)}</span><h3>${esc(p.name)}</h3>
        <div class="meta"><span>${p.km} km</span><span>${p.nights} ${p.nights === 1 ? "night" : "nights"}</span><span>${p.grade}</span></div>
        <span class="go">View trail →</span></div></a>`; }).join("")}
    </div>
  </div></section>

  <section class="band"><div class="wrap">
    <div class="feature">
      <div>
        <div class="eyebrow">Sold out?</div>
        <h2 class="h2">Get the cancellation, not the waitlist.</h2>
        <ul>
          <li>Tell us your trail and the dates that work.</li>
          <li>We watch for released beds and alert you first.</li>
          <li>Tap once and we book it before it's gone.</li>
        </ul>
        <a class="btn primary" href="#stay-whale">Set an alert on the Whale Trail</a>
      </div>
      ${media("swellendam", 1, 21, "Clouds over the Langeberg near Swellendam")}
    </div>
  </div></section>

  <section class="band alt"><div class="wrap">
    <div class="rhead"><div><div class="eyebrow">Regions</div>
      <h2 class="h2">${Object.keys(REGIONS).length} hiking regions, one map.</h2></div>
      <div class="rnav"><button type="button" class="rbtn" id="rprev" aria-label="Previous regions">←</button><button type="button" class="rbtn" id="rnext" aria-label="More regions">→</button></div></div>
    <div class="rcar" id="regions" tabindex="0" aria-label="Hiking regions"></div>
  </div></section>

  <section class="band"><div class="wrap">
    <div class="eyebrow">How booking works</div>
    <h2 class="h2">Clear pricing. You see the operator's price and our fee.</h2>
    <div class="howpay">
      <div><span class="k">STEP 1</span><b>Request</b><span>Choose dates and group size. Your card is held, not charged.</span></div>
      <div><span class="k">STEP 2</span><b>We secure it</b><span>Our booking team checks the portal or emails the owner for you.</span></div>
      <div><span class="k">STEP 3</span><b>You pay</b><span>The operator's price plus a flat ${R(FEE)} per hiker. Nothing hidden.</span></div>
      <div><span class="k">STEP 4</span><b>Confirmed</b><span>We pay the operator straight away and send your confirmation.</span></div>
    </div>
    <div class="stats">
      <div class="stat"><b class="num">${PLACES.length}</b><span>stays and trails mapped (sample)</span></div>
      <div class="stat"><b class="num">4</b><span>operator types covered</span></div>
      <div class="stat"><b class="num">48 h</b><span>target confirmation for email-only stays</span></div>
      <div class="stat"><b class="num">${R(FEE)}</b><span>flat fee per hiker</span></div>
    </div>
  </div></section>

  <section class="band alt"><div class="wrap split">
    <div><h2 class="h2">Planning next season?</h2><p class="lead">CapeNature opens bookings 12 months ahead. Leave your email and we'll remind you before your trail opens.</p></div>
    <form class="signup" id="remind"><input id="remind-email" type="email" placeholder="you@example.com" aria-label="Email" required><button class="btn primary" type="submit">Remind me</button></form>
  </div></section>`;
  const regEl = $("#regions");
  regEl.innerHTML = Object.keys(REGION_PHOTO).map(k => [k, REGIONS[k]]).map(([k, n], i) => {
    const c = PLACES.filter(p => p.region === k).length;
    return `<a class="tile" href="#stays-${k}">${media(REGION_PHOTO[k], i % 3, i + 11, n)}<div class="body"><h3>${n}</h3><div class="meta"><span>${c} ${c === 1 ? "place" : "places"}</span></div><span class="go">Explore →</span></div></a>`;
  }).join("");
  // Carousel: arrows scroll one tile at a time; swipe and trackpad scrolling work too.
  const step = () => { const t = regEl.querySelector(".tile"); return t ? t.getBoundingClientRect().width + 18 : regEl.clientWidth; };
  const arrows = () => { $("#rprev").disabled = regEl.scrollLeft < 4; $("#rnext").disabled = regEl.scrollLeft + regEl.clientWidth > regEl.scrollWidth - 4; };
  $("#rprev").onclick = () => regEl.scrollBy({ left: -step(), behavior: "smooth" });
  $("#rnext").onclick = () => regEl.scrollBy({ left: step(), behavior: "smooth" });
  regEl.addEventListener("scroll", arrows, { passive: true }); arrows();
  const paint = () => {
    drawRidges($("#heroc"), 7);
    const fc = $("#featc"); if (fc) drawRidges(fc, 21, TILE_PAL[1]);
    document.querySelectorAll(".tile canvas").forEach(c => drawRidges(c, +c.dataset.seed, TILE_PAL[+c.dataset.pal]));
  };
  requestAnimationFrame(paint);
  startHeroVideo();
  $("#remind").onsubmit = e => { e.preventDefault(); toast("Saved. In the live version you'd get an email when bookings open."); e.target.reset(); };
}

function mapPage() {
  const f = { ops: new Set(Object.keys(OPS)), q: "", sel: null };
  view.innerHTML = `
  <div class="planner">
    <aside class="rail">
      <div class="card routecard">
        <h1 style="font-size:1.5rem">Stays on the map</h1>
        <input id="mq" class="field" type="search" placeholder="Search stays, trails, regions" aria-label="Search stays" style="padding:9px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)">
        <div class="filters" id="mops" style="margin-top:0"></div>
      </div>
      <div class="mcount"><span id="mcnt"></span><span>Move the map to filter</span></div>
      <div class="mlist" id="mlist"></div>
    </aside>
    <div class="mapwrap"><div id="pmap" role="region" aria-label="Map of overnight stays"></div></div>
  </div>`;
  const filtered = () => PLACES.filter(p => f.ops.has(p.op) && (!f.q || (p.name + " " + p.huts.join(" ") + " " + REGIONS[p.region] + " " + p.kind).toLowerCase().includes(f.q)));
  const m = baseMap("pmap", { bounds: [[17.7, -35.0], [24.2, -31.6]], fitBoundsOptions: { padding: 30 } }, mm => addHuts(mm, filtered(), pick));
  function pick(id) { f.sel = id; const p = place(id); m.flyTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 10.5), duration: 900 }); list(); }
  function list() {
    const b = m.getBounds();
    const all = filtered();
    const inView = all.filter(p => b.contains([p.lng, p.lat]));
    if (f.sel && !inView.find(p => p.id === f.sel)) inView.unshift(place(f.sel));
    if (f.sel) { const i = inView.findIndex(p => p.id === f.sel); inView.unshift(inView.splice(i, 1)[0]); }
    $("#mcnt").textContent = `${inView.length} of ${all.length} in view`;
    $("#mlist").innerHTML = inView.length ? inView.map(p => `
      <div class="card mitem ${p.id === f.sel ? "on" : ""}" data-id="${p.id}" role="button" tabindex="0">
        <h3>${esc(p.name)}</h3><span class="pr"><b>${R(p.price)}</b> pp/night</span>
        <div class="meta">${opTag(p)}<span>${p.kind}</span><span>${p.beds} beds</span><span>${REGIONS[p.region]}</span></div>
        ${p.id === f.sel ? `<p style="grid-column:1/-1;margin:6px 0 0;font-size:.9rem">${esc(p.blurb)}</p><div class="acts"><a class="btn primary sm" href="#stay-${p.id}">View & book</a></div>` : ""}
      </div>`).join("") : `<p class="muted">No stays here. Zoom out or clear a filter.</p>`;
    $("#mlist").querySelectorAll(".mitem").forEach(el => {
      const go = e => { if (e.target.closest("a")) return; pick(el.dataset.id); };
      el.onclick = go; el.onkeydown = e => { if (e.key === "Enter") go(e); };
    });
  }
  const refresh = () => { const src = m.getSource("huts"); if (src) src.setData(hutsFC(filtered())); list(); };
  const fo = $("#mops");
  fo.innerHTML = Object.entries(OPS).map(([k, o]) => `<button class="chip mchip" aria-pressed="true" data-op="${k}" style="--c:${o.c}"><i></i>${o.label}</button>`).join("");
  fo.querySelectorAll(".chip").forEach(btn => btn.onclick = () => { const k = btn.dataset.op; f.ops.has(k) ? f.ops.delete(k) : f.ops.add(k); btn.setAttribute("aria-pressed", f.ops.has(k)); refresh(); });
  $("#mq").oninput = e => { f.q = e.target.value.toLowerCase(); refresh(); };
  m.on("moveend", list);
  m.once("load", list);
}

function opTagText(p) { return OPS[p.op].label; }
function nextDate(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function fmtDate(s) { const d = new Date(s + "T12:00:00"); return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }

function trails() {
  const list = PLACES.filter(p => p.nights > 1 || p.km > 20);
  view.innerHTML = `
  <div class="wrap phead"><div class="eyebrow">Trails</div><h1>Multi-day trails</h1><p class="lead">Multi-day routes with overnight stays across the Western Cape.</p></div>
  <div class="wrap"><div class="grid3" style="margin-top:28px">${list.map((p, i) => `
    <a class="tile" href="#stay-${p.id}">${media(PLACE_PHOTO[p.id], i % 3, i + 30, p.name)}
    <div class="body"><span style="font-size:.85rem">${opTag(p)}</span><h3>${esc(p.name)}</h3>
    <div class="meta"><span>${p.km ? p.km + " km" : "Distance varies"}</span><span>${p.nights} nights</span><span>${p.grade}</span></div>
    <span class="go">View trail →</span></div></a>`).join("")}</div></div><div style="height:72px"></div>`;
  requestAnimationFrame(() => document.querySelectorAll(".tile canvas").forEach(c => drawRidges(c, +c.dataset.seed, TILE_PAL[+c.dataset.pal])));
}

function huts(regionArg) {
  const f = { op: null, region: REGIONS[regionArg] ? regionArg : null, q: "" };
  view.innerHTML = `
  <div class="wrap phead"><div class="eyebrow">Stays & cabins</div><h1>Every overnight stay, one list.</h1>
    <p class="lead">CapeNature, SANParks, community and private stays. We book all of them, online or by email.</p>
    <div class="filters" id="f-ops"></div>
    <div class="filters"><select id="f-region" class="chip" aria-label="Region"><option value="">All regions</option>${Object.entries(REGIONS).map(([k, n]) => `<option value="${k}" ${k === f.region ? "selected" : ""}>${n}</option>`).join("")}</select>
    <input id="f-q" class="chip" type="search" placeholder="Search stays" aria-label="Search stays" style="min-width:0;flex:1 1 180px"></div>
  </div>
  <div class="wrap"><div class="list" id="hl"></div></div>`;
  const fo = $("#f-ops");
  fo.innerHTML = `<button class="chip" aria-pressed="true" data-op="">All</button>` + Object.entries(OPS).map(([k, o]) => `<button class="chip" aria-pressed="false" data-op="${k}" style="--c:${o.c}"><i></i>${o.label}</button>`).join("");
  fo.querySelectorAll(".chip").forEach(b => b.onclick = () => { f.op = b.dataset.op || null; fo.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
  $("#f-region").onchange = e => { f.region = e.target.value || null; draw(); };
  $("#f-q").oninput = e => { f.q = e.target.value.toLowerCase(); draw(); };
  function draw() {
    const l = PLACES.filter(p => (!f.op || p.op === f.op) && (!f.region || p.region === f.region) && (!f.q || (p.name + p.huts.join(" ") + REGIONS[p.region]).toLowerCase().includes(f.q)));
    $("#hl").innerHTML = l.length ? l.map(p => `
      <a class="row" href="#stay-${p.id}"><div><h3>${esc(p.name)}</h3><div class="meta">${opTag(p)}<span>${p.kind}</span><span>${REGIONS[p.region]}</span><span>${p.beds} beds</span></div></div>
      <div class="right"><b>from ${R(p.price)}</b><span class="muted">pp per night</span><br><span class="tag ${OPS[p.op].channel === "portal" ? "ok" : "info"}">${OPS[p.op].channel === "portal" ? "Instant check" : "Confirmed by email"}</span></div></a>`).join("")
      : `<p class="muted" style="padding:24px 0">No stays match. Clear the search or pick another region.</p>`;
  }
  draw();
}

function hut(id) {
  const p = place(id) || PLACES[0];
  const alerts = store.get("alerts", {});
  const portal = OPS[p.op].channel === "portal";
  view.innerHTML = `
  <div class="wrap detail">
    <div>
      <div class="crumbs"><a href="#stays">Stays</a> / <a href="#stays-${p.region}">${REGIONS[p.region]}</a></div>
      ${PLACE_PHOTO[p.id] ? `<div class="stayphoto">${media(PLACE_PHOTO[p.id], 0, 1, p.name)}</div>` : ""}
      <span style="font-size:.9rem">${opTag(p)}</span>
      <h1 style="font-size:clamp(2rem,4.5vw,3rem);line-height:1.08;margin-top:6px">${esc(p.name)}</h1>
      <p class="muted" style="margin:6px 0 0">${p.kind} · ${REGIONS[p.region]}</p>
      <div class="factrow">
        <div><small>Nights</small><b>${p.nights}</b></div><div><small>Distance</small><b>${p.km ? p.km + " km" : "—"}</b></div>
        <div><small>Grade</small><b>${p.grade}</b></div><div><small>Beds</small><b>${p.beds}</b></div>
      </div>
      <div class="prose">
        <p>${esc(p.blurb)}</p>
        <h2>Overnight stops</h2><div class="hutchips">${p.huts.map(h => `<span>${esc(h)}</span>`).join("")}</div>
        <h2>What to know</h2>
        <p>Bring your own sleeping bag, food and stove unless the listing says otherwise. Most stays have bunks, mattresses and water but no electricity. Trails can close at short notice for fire or extreme weather; we'll tell you straight away if your dates are affected.</p>
      </div>
      <div class="minimap"><div id="hmap" role="region" aria-label="Location map"></div></div>
    </div>
    <aside class="card bookbox">
      <div class="price">from ${R(p.price)} <small>pp per night</small></div>
      <div class="controls2">
        <label class="field">Start date<input id="h-date" type="date" value="${nextDate(60)}"></label>
        <label class="field">Hikers<input id="h-n" type="number" min="1" max="${p.beds}" value="4"></label>
      </div>
      <button class="btn primary block" id="h-book">Check availability</button>
      <label class="field" style="flex-direction:row;align-items:center;gap:10px;color:var(--fg);font-size:.92rem"><input type="checkbox" id="h-alert" ${alerts[p.id] ? "checked" : ""} style="width:auto;accent-color:var(--green)"> Alert me about cancellations</label>
      <div class="how">
        <span><b>How we book this:</b> ${portal ? "we check the CapeNature portal for live availability and book instantly once you've paid." : "we email the operator for you and confirm within about 48 hours."}</span>
        <span>Price shown is the operator's rate. Trailscape adds a flat ${R(FEE)} per hiker.</span>
      </div>
    </aside>
  </div>`;
  const m = baseMap("hmap", { center: [p.lng, p.lat], zoom: 10, styleCtl: false, cooperativeGestures: true });
  htmlMarker(m, p.lng, p.lat, "", "", p.name).getElement().style.setProperty("--c", OPS[p.op].c);
  $("#h-book").onclick = () => { draft = { place: p.id, date: $("#h-date").value, n: Math.max(1, +$("#h-n").value || 1) }; location.hash = "book-" + p.id; };
  $("#h-alert").onchange = e => { const a = store.get("alerts", {}); if (e.target.checked) a[p.id] = true; else delete a[p.id]; store.set("alerts", a); toast(e.target.checked ? "Alert on. We'll tell you when beds open up." : "Alert off."); };
}

function book(id) {
  const p = place(id) || PLACES[0];
  if (!draft || draft.place !== p.id) draft = { place: p.id, date: nextDate(60), n: 4 };
  const portal = OPS[p.op].channel === "portal";
  let stage = 1;
  const steps = ["Your trip", "Quote", "Details & payment", "Booking status"];
  function shell(inner) {
    view.innerHTML = `<div class="wrap flow">
      <div class="crumbs"><a href="#stay-${p.id}">${esc(p.name)}</a> / Book</div>
      <h1 style="font-size:clamp(1.8rem,4vw,2.5rem)">Book ${esc(p.name)}</h1>
      <div class="stepper">${steps.map((s, i) => `<div class="${i + 1 < stage ? "done" : i + 1 === stage ? "on" : ""}">${i + 1}. ${s}</div>`).join("")}</div>
      ${inner}</div>`;
  }
  function s1() {
    stage = 1;
    shell(`<div class="card panel">
      <div class="controls2"><label class="field">Start date<input id="b-date" type="date" value="${draft.date}"></label>
      <label class="field">Hikers<input id="b-n" type="number" min="1" max="${p.beds}" value="${draft.n}"></label></div>
      <label class="field">Notes for the operator (optional)<textarea id="b-notes" rows="2" placeholder="e.g. one vegetarian, arriving late on day one"></textarea></label>
      <div class="note">${portal ? "This stay takes online bookings. We'll check live availability in a few seconds." : `${OPS[p.op].label} confirms by email. We'll contact them for you and usually hear back within 48 hours.`}</div>
      <button class="btn primary" id="b-next">Get my quote →</button></div>`);
    $("#b-next").onclick = () => { draft.date = $("#b-date").value; draft.n = Math.max(1, Math.min(p.beds, +$("#b-n").value || 1)); s2(); };
  }
  function s2() {
    stage = 2; const q = quote(p, draft.n);
    shell(`<div class="card panel">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>${esc(p.name)}</b><div class="muted" style="font-size:.9rem">${fmtDate(draft.date)} · ${q.nights} ${q.nights === 1 ? "night" : "nights"} · ${draft.n} hikers</div></div>
      <span class="tag ${portal ? "ok" : "info"}">${portal ? "Available (simulated check)" : "To be confirmed by operator"}</span></div>
      <table class="quote">
        <tr><td>Stay fees<div class="sub">${R(p.price)} × ${draft.n} hikers × ${q.nights} ${q.nights === 1 ? "night" : "nights"}, paid to ${OPS[p.op].label}</div></td><td>${R(q.provider)}</td></tr>
        <tr><td>Trailscape service fee<div class="sub">${R(FEE)} × ${draft.n} hikers</div></td><td>${R(q.fee)}</td></tr>
        <tr class="total"><td>Total</td><td>${R(q.total)}</td></tr>
      </table>
      <div class="note">${OPS[p.op].label}'s own cancellation rules apply to the stay fees. For example, CapeNature refunds 50% when you cancel 15–30 days before arrival. Our service fee isn't refundable once your booking is confirmed.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn line" id="b-back">← Change trip</button><button class="btn primary" id="b-next">Continue →</button></div></div>`);
    $("#b-back").onclick = s1; $("#b-next").onclick = s3;
  }
  function s3() {
    stage = 3; const q = quote(p, draft.n);
    shell(`<form class="card panel" id="payf">
      <div class="paybox">
        <label class="field">Full name<input id="c-name" required placeholder="Lead hiker"></label>
        <label class="field">Mobile<input id="c-phone" type="tel" required placeholder="082 000 0000"></label>
        <label class="field full">Email<input id="c-email" type="email" required placeholder="you@example.com"></label>
      </div>
      <div><div class="field" style="margin-bottom:6px">Pay with</div>
        <div class="gw"><label><input type="radio" name="gw" checked> Card</label><label><input type="radio" name="gw"> Instant EFT</label></div></div>
      <label class="field" style="flex-direction:row;gap:10px;align-items:flex-start;color:var(--fg);font-size:.9rem"><input type="checkbox" required style="width:auto;margin-top:4px;accent-color:var(--green)"> I agree that Trailscape books on my behalf and may share my name and contact details with ${OPS[p.op].label} for this booking.</label>
      <div class="note">${portal ? `We'll hold ${R(q.total)} on your card and only charge it once the booking is made.` : `We'll hold ${R(q.total)} on your card. It's only charged once ${OPS[p.op].label} confirms; if they can't take you, the hold is released.`}</div>
      <button class="btn primary" type="submit">Hold ${R(q.total)} and request booking</button>
      <span class="muted" style="font-size:.8rem">Prototype: no payment is taken and nothing is sent.</span></form>`);
    $("#payf").onsubmit = e => {
      e.preventDefault();
      const ref = "LT-" + (1043 + myTrips.length);
      myTrips.unshift({ ref, place: p.id, date: draft.date, n: draft.n, total: q.total, made: Date.now() });
      store.set("trips", myTrips);
      s4(ref);
    };
  }
  function s4(ref) {
    stage = 4;
    const evs = portal
      ? [["Request received", "Card hold placed"], ["Checking the CapeNature portal", "Our booking agent searches your dates"], ["Beds secured", "Booked on the portal and paid by Trailscape"], ["Card charged", "Your hold becomes a payment"], ["Confirmed", "Confirmation and permits sent to your email"]]
      : [["Request received", "Card hold placed"], ["Email sent to " + OPS[p.op].label, "We ask about availability, price and deposit"], ["Operator replied", "Usually within 48 hours"], ["Card charged and operator paid", "We pay the operator straight away"], ["Confirmed", "Your booking details are sent to your email"]];
    shell(`<div class="card panel">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline"><div><span class="muted" style="font-size:.85rem">Booking reference</span><div class="mono" style="font-size:1.2rem">${ref}</div></div><span class="tag info" id="stat-tag">In progress</span></div>
      <div class="track" id="trk">${evs.map((e, i) => `<div class="trk" data-i="${i}"><span class="dot"></span><div><b>${esc(e[0])}</b><span>${esc(e[1])}</span></div><time></time></div>`).join("")}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn line" href="#trips">View my trips</a></div></div>`);
    const limit = portal ? evs.length : 2; let i = 0;
    const tick = () => {
      document.querySelectorAll(".trk").forEach(r => { const k = +r.dataset.i; r.classList.toggle("done", k < i); r.classList.toggle("now", k === i && i < limit); if (k < i && !r.querySelector("time").textContent) r.querySelector("time").textContent = new Date().toTimeString().slice(0, 5); });
      if (i >= limit) { $("#stat-tag").textContent = portal ? "Confirmed" : "Waiting for operator"; $("#stat-tag").className = "tag " + (portal ? "ok" : "warn"); return; }
      i++; setTimeout(tick, 900);
    };
    setTimeout(tick, 400);
  }
  s1();
}

// My trips and the back office are drawn by booking.js and account.js (and the real back office is admin.html).
// These placeholders only show for the moment before those scripts load.
function trips() { view.innerHTML = `<div class="wrap phead"><div class="eyebrow">Account</div><h1>My trips</h1><p class="muted">One moment…</p></div>`; }
function ops() { view.innerHTML = `<div class="wrap phead"><p class="muted">One moment…</p></div>`; }

$("#menu").onclick = () => { const o = $("#links").classList.toggle("open"); $("#menu").setAttribute("aria-expanded", o); };
window.addEventListener("hashchange", nav);
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if ((location.hash.slice(1) || "home").split("-")[0] === "home" || location.hash.startsWith("#trails")) { const h = $("#heroc"); if (h) drawRidges(h, 7); document.querySelectorAll(".tile canvas").forEach(c => drawRidges(c, +c.dataset.seed, TILE_PAL[+c.dataset.pal])); const fc = $("#featc"); if (fc) drawRidges(fc, 21, TILE_PAL[1]); } }, 150); });
nav();
