// ---------- Map layers: stays, hikes and hiking areas ----------
// Loaded after app-core.js, stays.js and trails-data.js. On the Map page it adds:
//  - a collapsible "Layers" panel of tick boxes (Stays, Hikes, Hiking areas, all on by default),
//  - the hiking trail lines from trails-data.js and the shaded hiking areas,
//  - a collapsible side panel (shut by default) with collapsible "Stays" and "Hikes" sections listing what's in view.
//    On phones the side panel becomes a bottom sheet opened from a "Show list" button.
// "Stays" drives the accommodation toggle that stays.js puts in the side panel (so the two stay in step),
// and also shows or hides the bookable-stay pins from app-core.js.
// Like stays.js it wraps mapPage() rather than editing it, using app-core.js globals: maps, esc, store, nav, FONT.
(() => {
  const AREAS = [
    { id: "peninsula", name: "Cape Peninsula", c: "#7fb3d5", hikes: ["Platteklip Gorge", "Skeleton Gorge", "India Venster", "Lion's Head", "Silvermine", "Cape of Good Hope Trail"],
      ring: [[18.36, -33.89], [18.45, -33.92], [18.48, -34.05], [18.47, -34.20], [18.51, -34.36], [18.46, -34.37], [18.37, -34.22], [18.30, -34.10], [18.33, -33.98]] },
    { id: "boland", name: "Boland & Winelands", c: "#c9a0dc", hikes: ["Jonkershoek Panorama", "Krom River", "Bain's Kloof pools", "Mont Rochelle", "Paarl Rock", "Limietberg Trail"],
      ring: [[18.88, -33.55], [19.08, -33.48], [19.25, -33.62], [19.24, -33.85], [19.12, -33.98], [18.93, -34.00], [18.84, -33.84]] },
    { id: "hh", name: "Hottentots-Holland & Kogelberg", c: "#8fd1b5", hikes: ["Boland Hiking Trail", "Sneeukop", "Kogelberg Trail", "Palmiet River", "Leopard's Kloof"],
      ring: [[18.84, -34.02], [19.12, -34.00], [19.22, -34.12], [19.12, -34.30], [18.96, -34.38], [18.80, -34.30], [18.82, -34.12]] },
    { id: "walker", name: "Hermanus & Walker Bay", c: "#f2b8a2", hikes: ["Fernkloof", "Hermanus Cliff Path", "Grootbos trails", "Platbos forest"],
      ring: [[19.16, -34.33], [19.36, -34.30], [19.56, -34.44], [19.47, -34.62], [19.27, -34.50]] },
    { id: "rse", name: "Greyton & Riviersonderend", c: "#e7c873", hikes: ["Boesmanskloof (Greyton–McGregor)", "Genadendal Trail"],
      ring: [[19.44, -33.92], [19.85, -33.88], [19.96, -33.98], [19.72, -34.08], [19.45, -34.06]] },
    { id: "langeberg", name: "Langeberg & Breede Valley", c: "#a8c98a", hikes: ["Swellendam Trail", "Tienuurkop", "Boosmansbos", "Arangieskop", "Bloupunt (Montagu)", "Cogmanskloof"],
      ring: [[19.80, -33.70], [20.30, -33.70], [20.95, -33.84], [21.12, -33.95], [20.80, -34.04], [20.30, -34.05], [19.92, -33.86]] },
    { id: "dehoop", name: "De Hoop & Agulhas", c: "#9ec5e8", hikes: ["Whale Trail", "Potberg", "De Hoop Vlei", "Agulhas coastal walks"],
      ring: [[19.88, -34.58], [20.38, -34.34], [20.82, -34.40], [20.72, -34.56], [20.12, -34.86], [19.90, -34.76]] },
    { id: "cederberg", name: "Cederberg", c: "#f0a979", hikes: ["Wolfberg Cracks & Arch", "Maltese Cross", "Sneeuberg", "Stadsaal Caves", "Heritage Route", "Lot's Wife"],
      ring: [[18.90, -32.04], [19.16, -32.04], [19.42, -32.30], [19.46, -32.60], [19.26, -32.70], [19.00, -32.56], [18.88, -32.30]] },
    { id: "winterhoek", name: "Groot Winterhoek", c: "#d4a6a6", hikes: ["Die Hel pools", "Groot Winterhoek Peak", "Beaverlac"],
      ring: [[18.94, -32.86], [19.24, -32.90], [19.30, -33.14], [19.06, -33.20], [18.90, -33.06]] },
    { id: "westcoast", name: "West Coast", c: "#b9d98f", hikes: ["Postberg Trail", "Strandveld Trail", "Cape Columbine"],
      ring: [[17.84, -32.74], [18.06, -32.70], [18.30, -33.04], [18.24, -33.26], [17.98, -33.26], [17.84, -33.00]] },
    { id: "ceres", name: "Ceres, Witzenberg & Hex River", c: "#a9b8e3", hikes: ["Matroosberg", "Milner Peak", "Witzenberg"],
      ring: [[19.15, -33.10], [19.55, -33.04], [19.86, -33.34], [19.76, -33.56], [19.40, -33.56], [19.20, -33.36]] },
    { id: "karoo", name: "Klein Karoo & Swartberg", c: "#e3b98f", hikes: ["Swartberg Trail", "Gamkaskloof (Die Hel)", "Seweweekspoort Peak", "Towerkop", "Tierkloof (Gamkaberg)", "Meiringspoort"],
      ring: [[20.48, -33.30], [21.60, -33.20], [22.60, -33.24], [22.70, -33.50], [22.00, -33.72], [21.30, -33.76], [20.50, -33.56]] },
    { id: "garden", name: "Garden Route & Tsitsikamma", c: "#8cc7a6", hikes: ["Otter Trail", "Outeniqua Trail", "Tsitsikamma Trail", "Robberg", "Kingfisher trails", "St Blaize Trail"],
      ring: [[22.00, -34.00], [22.40, -33.84], [23.00, -33.80], [23.66, -33.88], [23.70, -34.04], [23.36, -34.13], [22.80, -34.08], [22.10, -34.22]] },
    { id: "greatkaroo", name: "Great Karoo", c: "#d9c7a0", hikes: ["Karoo National Park: Fossil Trail"],
      ring: [[22.25, -32.14], [22.76, -32.14], [22.76, -32.46], [22.25, -32.46]] },
  ];
  const byId = Object.fromEntries(AREAS.map(a => [a.id, a]));

  const closed = r => [...r, r[0]];
  const centroid = r => { const n = r.length; return [r.reduce((a, p) => a + p[0], 0) / n, r.reduce((a, p) => a + p[1], 0) / n]; };
  // Natural outlines traced from terrain data live in hiking-areas.js; the rough rings above are only a fallback.
  const SHAPES = typeof HIKING_AREAS === "object" ? HIKING_AREAS : {};
  const outline = a => (SHAPES[a.id] ? SHAPES[a.id].rings : [a.ring]).map(r => [closed(r)]);
  const labelAt = a => (SHAPES[a.id] ? SHAPES[a.id].label : centroid(a.ring));
  const polyFC = { type: "FeatureCollection", features: AREAS.map(a => ({ type: "Feature", properties: { id: a.id, name: a.name, color: a.c }, geometry: { type: "MultiPolygon", coordinates: outline(a) } })) };
  const labelFC = { type: "FeatureCollection", features: AREAS.map(a => ({ type: "Feature", properties: { id: a.id, name: a.name }, geometry: { type: "Point", coordinates: labelAt(a) } })) };


  // ---- trails: decode trails-data.js (one trail per line: name;area;type;km;match;osm;note;polylines) ----
  function decodePoly(str) {
    const pts = []; let i = 0, la = 0, lo = 0;
    const next = () => { let r = 0, s = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
    while (i < str.length) { la += next(); lo += next(); pts.push([lo / 1e5, la / 1e5]); }
    return pts;
  }
  const TRAILS = (typeof TRAILS_TXT === "string" ? TRAILS_TXT.trim().split("\n") : []).map((line, id) => {
    const [n, a, t, km, m, osm, note, segs] = line.split(";");
    const lines = (segs || "").split(" ").filter(Boolean).map(s => decodePoly(s.replace(/#/g, "\\").replace(/!/g, "`")));
    // bounding box [west, south, east, north] for the "hikes in view" list
    const bb = [180, 90, -180, -90];
    lines.forEach(l => l.forEach(([x, y]) => { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }));
    return { id, n, a, t, km: +km, m, osm, note, lines, bb };
  });
  const trailFC = { type: "FeatureCollection", features: TRAILS.map(tr => ({ type: "Feature", id: tr.id,
    properties: { id: tr.id, name: tr.n, kind: tr.t, partial: tr.m === "Partial" }, geometry: { type: "MultiLineString", coordinates: tr.lines } })) };
  const COL = { Day: "#1d6fb8", Overnight: "#c2412d" };

  const LAYER_KEYS = { hikes: "layer-hikes", areas: "layer-areas" };
  const show = { hikes: store.get(LAYER_KEYS.hikes, true), areas: store.get(LAYER_KEYS.areas, true) };
  const LAYERS = { areas: ["ha-fill", "ha-line", "ha-label"], hikes: ["tr-case", "tr-line", "tr-part", "tr-hl", "tr-hit", "tr-label"] };

  const phone = matchMedia("(max-width: 960px)");
  // Open/shut state of the panels. Everything starts shut (the layer key starts open on wide screens);
  // a choice is kept while moving around the site, and resets on reload.
  const ui = { rail: false, stays: false, hikes: false, layers: !phone.matches };

  const CHEV = `<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;
  const LAYERS_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 2l6 3.2L8 8.4 2 5.2z"/><path d="M2 8l6 3.2L14 8"/><path d="M2 10.8L8 14l6-3.2"/></svg>`;
  const LIST_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.6" cy="4" r=".9" fill="currentColor"/><circle cx="2.6" cy="8" r=".9" fill="currentColor"/><circle cx="2.6" cy="12" r=".9" fill="currentColor"/></svg>`;

  const css = document.createElement("style");
  css.textContent = `
  /* ---- layer key (top left of the map), collapsible ---- */
  .lyrctl { background: var(--card); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); margin: 8px 0 0 10px; min-width: 168px; overflow: hidden; }
  .lyrctl.shut { min-width: 0; }
  .lyrctl .lyrhead { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 7px 12px; font: inherit; font-size: .84rem; font-weight: 600; color: var(--fg); cursor: pointer; text-align: left; }
  .lyrctl .lyrhead svg { width: 16px; height: 16px; flex: none; }
  .lyrctl .lyrhead .chev { width: 14px; height: 14px; margin-left: auto; color: var(--muted); transition: transform .2s; }
  .lyrctl:not(.shut) .lyrhead .chev { transform: rotate(180deg); }
  .lyrctl:not(.shut) .lyrhead { border-bottom: 1px solid var(--line); }
  .lyrctl .lyrbody { padding: 4px 0; }
  .lyrctl.shut .lyrbody { display: none; }
  .lyrctl label { display: flex; align-items: center; gap: 8px; padding: 6px 12px; font-size: .84rem; font-weight: 600; cursor: pointer; color: var(--fg); user-select: none; }
  .lyrctl input { width: 16px; height: 16px; margin: 0; accent-color: var(--green); cursor: pointer; flex: none; }
  .lyrctl small { margin-left: auto; color: var(--muted); font-weight: 500; }
  .lyrctl .sw { width: 16px; height: 10px; flex: none; border-radius: 2px; }
  .lyrctl .sw.stays { width: 10px; height: 10px; margin: 0 3px; border-radius: 50%; background: #fff; border: 2.5px solid #3d7a4f; box-sizing: border-box; }
  .lyrctl .sw.hikes { height: 0; border-top: 3px solid ${COL.Overnight}; border-radius: 0; }
  .lyrctl .sw.areas { background: linear-gradient(90deg, #8fd1b5 0 33%, #f0a979 33% 66%, #9ec5e8 66%); }
  .lyrctl .key { display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 2px 12px 6px 36px; font-size: .74rem; color: var(--muted); }
  .lyrctl .key[hidden] { display: none; }
  .lyrctl .key i { display: inline-block; width: 14px; margin-right: 4px; vertical-align: middle; border-top: 3px solid; }
  .lyrctl .key i.part { border-top-style: dashed; color: var(--muted); }

  .mappop h4 { margin: 0 0 4px; font-family: var(--serif); font-size: .98rem; font-weight: 600; line-height: 1.25; padding-right: 14px; }
  .mappop .sub { font-weight: 400; font-size: .8rem; color: var(--muted); }
  .mappop ul { margin: 4px 0 0; padding-left: 16px; font-weight: 400; font-size: .8rem; color: var(--muted); }
  .mappop p { margin: 6px 0 0; font-weight: 400; font-size: .8rem; }
  .mappop small { display: block; margin-top: 6px; font-weight: 400; font-size: .72rem; color: var(--muted); }
  .mappop a { color: var(--green); font-weight: 600; }
  .mappop .acts { display: flex; gap: 12px; margin-top: 8px; font-size: .8rem; }
  .mappop .acts button { border: 0; background: none; padding: 0; color: var(--green); font: inherit; font-weight: 600; cursor: pointer; }

  /* ---- side panel: collapsible, shut by default ---- */
  .planner.rail-shut { grid-template-columns: 1fr; }
  .planner.rail-shut .rail { display: none; }
  .rail .railgrab { display: none; }
  .railhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .railhead h1 { font-size: 1.5rem; }
  .railx { flex: none; display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 8px; background: var(--band); color: var(--fg); padding: 0 12px; height: 36px; font: inherit; font-size: .875rem; cursor: pointer; }
  .railx:hover { background: #ebebeb; }
  .railx svg { width: 14px; height: 14px; }
  .railbtn { position: absolute; z-index: 520; left: 50%; bottom: calc(36px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 8px; max-width: calc(100% - 32px); min-height: 44px; padding: 10px 18px; border: 0; border-radius: 999px;
    background: var(--fg); color: #fff; font: inherit; font-size: .95rem; white-space: nowrap; cursor: pointer; box-shadow: 0 6px 20px rgba(13,19,33,.25); }
  .railbtn svg { width: 16px; height: 16px; flex: none; }
  .railbtn span { overflow: hidden; text-overflow: ellipsis; }
  .railbtn em { font-style: normal; opacity: .7; }
  .planner:not(.rail-shut) .railbtn { display: none; }

  /* collapsible sections inside the panel */
  .msec { background: var(--card); border-radius: var(--radius); flex: none; }
  .msec > summary { list-style: none; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 12px 16px; cursor: pointer; font-size: 1.125rem; font-weight: 500; letter-spacing: -0.03em; user-select: none; border-radius: var(--radius); }
  .msec > summary::-webkit-details-marker { display: none; }
  .msec > summary:hover { background: var(--soft); }
  .msec > summary .ic { width: 12px; height: 12px; flex: none; }
  .msec > summary .ic.stays { border-radius: 50%; border: 2.5px solid #3d7a4f; background: #fff; }
  .msec > summary .ic.hikes { height: 0; border-top: 3px solid ${COL.Day}; }
  .msec > summary .cnt { margin-left: auto; font-size: .85rem; font-weight: 400; color: var(--muted); letter-spacing: -0.02em; }
  .msec > summary .chev { width: 16px; height: 16px; flex: none; color: var(--muted); transition: transform .2s; }
  .msec[open] > summary .chev { transform: rotate(180deg); }
  .msec .secbody { display: flex; flex-direction: column; gap: 10px; padding: 2px 12px 14px; }
  .msec .card { background: var(--band); }
  .msec .stayhead { margin-top: 8px; }
  .msec .stayhead h2, .msec .subhead { font-size: .95rem; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
  .hitem { display: flex; gap: 10px; align-items: flex-start; width: 100%; padding: 10px 14px; border: 1px solid transparent; text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .hitem:hover, .hitem.on { border-color: var(--clay); }
  .hitem .ln { width: 16px; height: 0; margin-top: 10px; flex: none; border-top: 3px solid var(--c); }
  .hitem .ln.part { border-top-style: dashed; }
  .hitem b { display: block; font-weight: 600; }
  .hitem .m { font-size: .8rem; color: var(--muted); }
  .hnote { margin: 0; font-size: .875rem; color: var(--muted); }

  /* ---- phones and small tablets: full-height map, list in a bottom sheet ---- */
  @media (max-width: 960px) {
    .planner, .planner.rail-shut { grid-template-columns: 1fr; grid-template-rows: 1fr; }
    .planner .mapwrap { grid-row: 1; }
    .rail { position: fixed; z-index: 940; left: 0; right: 0; bottom: 0; top: auto; max-height: min(78dvh, 720px); border-top: 0; border-radius: 18px 18px 0 0;
      box-shadow: 0 -8px 30px rgba(20,25,20,.22); overscroll-behavior: contain; gap: 12px;
      padding: 0 max(12px, env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
      animation: railUp .22s ease-out; }
    .rail .railgrab { display: block; position: sticky; top: 0; z-index: 2; flex: none; width: calc(100% + 24px); margin: 0 -12px -6px; height: 22px; border: 0; background: #fafafa; cursor: grab; }
    .rail .railgrab::before { content: ""; position: absolute; left: 50%; top: 8px; width: 40px; height: 5px; margin-left: -20px; border-radius: 3px; background: #d6d6d6; }
    .railhead h1 { font-size: 1.25rem; }
    .railx { height: 40px; }
    .routecard { padding: 12px; gap: 10px; }
    .routecard .filters { flex-wrap: nowrap; overflow-x: auto; margin-inline: -12px; padding: 0 12px 2px; scrollbar-width: none; }
    .routecard .filters::-webkit-scrollbar { display: none; }
    .routecard .filters .chip { flex: none; }
    #mq { font-size: 16px; min-height: 44px; } /* 16px stops iOS zooming into the field */
    .mcount { flex-wrap: wrap; gap: 2px 10px; }
    .hitem { min-height: 52px; }
    .mstyle { margin: 8px 0 0 8px; }
    .mstyle button { padding: 8px 9px; font-size: .78rem; }
    .lyrctl { margin: 6px 0 0 8px; min-width: 0; }
    .lyrctl:not(.shut) { min-width: 176px; }
    .lyrctl .lyrhead { min-height: 40px; }
    .lyrctl label { min-height: 40px; }
    .maplibregl-ctrl-scale { display: none; }
    body.mapview .sample-flag { display: none; }
    .railbtn { bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
  }
  @keyframes railUp { from { transform: translateY(30%); opacity: .5; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .rail { animation: none; }  }
  `;
  document.head.appendChild(css);

  function beforeId(m) { return ["st-sel", "st", "st-hit", "cl", "pt"].find(l => m.getLayer(l)); }
  function addLayers(m) {
    if (m.getSource("hike-areas")) return;
    const b = beforeId(m), vis = k => (show[k] ? "visible" : "none");
    m.addSource("hike-areas", { type: "geojson", data: polyFC });
    m.addSource("hike-area-labels", { type: "geojson", data: labelFC });
    m.addLayer({ id: "ha-fill", type: "fill", source: "hike-areas", layout: { visibility: vis("areas") },
      paint: { "fill-color": ["get", "color"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.34, 11, 0.16] } }, b);
    m.addLayer({ id: "ha-line", type: "line", source: "hike-areas", layout: { visibility: vis("areas"), "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-opacity": 0.9 } }, b);
    // trails sit above the area shading and below the hut and accommodation dots
    m.addSource("trails", { type: "geojson", data: trailFC });
    const lineCol = ["match", ["get", "kind"], "Overnight", COL.Overnight, COL.Day];
    const width = ["interpolate", ["linear"], ["zoom"], 6, 1.6, 10, 2.6, 14, 4];
    m.addLayer({ id: "tr-case", type: "line", source: "trails", layout: { visibility: vis("hikes"), "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3.2, 10, 5, 14, 7] } }, b);
    m.addLayer({ id: "tr-line", type: "line", source: "trails", filter: ["!", ["get", "partial"]], layout: { visibility: vis("hikes"), "line-join": "round", "line-cap": "round" },
      paint: { "line-color": lineCol, "line-width": width } }, b);
    m.addLayer({ id: "tr-part", type: "line", source: "trails", filter: ["get", "partial"], layout: { visibility: vis("hikes"), "line-join": "round" },
      paint: { "line-color": lineCol, "line-width": width, "line-dasharray": [2, 1.5] } }, b);
    m.addLayer({ id: "tr-hl", type: "line", source: "trails", filter: ["==", ["get", "id"], selTrail == null ? -1 : selTrail], layout: { visibility: vis("hikes"), "line-join": "round", "line-cap": "round" },
      paint: { "line-color": lineCol, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 10, 6, 14, 8], "line-opacity": 0.55 } }, b);
    m.addLayer({ id: "tr-hit", type: "line", source: "trails", layout: { visibility: vis("hikes") },
      paint: { "line-color": "#000000", "line-opacity": 0.001, "line-width": matchMedia("(pointer: coarse)").matches ? 22 : 12 } }, b);
    try {
      m.addLayer({ id: "ha-label", type: "symbol", source: "hike-area-labels", maxzoom: 10.5, layout: { visibility: vis("areas"),
        "text-field": ["get", "name"], "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 6, 11, 9, 13], "text-max-width": 9, "text-optional": true },
        paint: { "text-color": "#3a3f37", "text-halo-color": "#ffffff", "text-halo-width": 1.6 } }, b);
      m.addLayer({ id: "tr-label", type: "symbol", source: "trails", minzoom: 11, layout: { visibility: vis("hikes"),
        "symbol-placement": "line", "text-field": ["get", "name"], "text-font": FONT, "text-size": 12, "text-optional": true },
        paint: { "text-color": lineCol, "text-halo-color": "#ffffff", "text-halo-width": 1.8 } }, b);
    } catch (e) { console.warn("map labels unavailable", e); }
  }
  function setVis(m, k) { LAYERS[k].forEach(l => { if (m.getLayer(l)) m.setLayoutProperty(l, "visibility", show[k] ? "visible" : "none"); }); }

  // "Stays" mirrors the side panel's Accommodation button from stays.js.
  const staysBtn = () => document.getElementById("stoggle");
  const staysOn = () => { const b = staysBtn(); return b ? b.getAttribute("aria-pressed") === "true" : store.get("stays-on", true); };
  // The bookable-stay pins (and their clusters) from app-core.js follow the Stays box too.
  const HUT_LAYERS = ["cl", "cl-n", "pt", "pt-l"];
  function setHuts(m) { const v = staysOn() ? "visible" : "none"; HUT_LAYERS.forEach(l => { if (m.getLayer(l) && m.getLayoutProperty(l, "visibility") !== v) m.setLayoutProperty(l, "visibility", v); }); }

  class LayerCtl {
    constructor(m) { this.m = m; }
    onAdd() {
      const d = document.createElement("div"); d.className = "maplibregl-ctrl lyrctl" + (ui.layers ? "" : " shut");
      d.setAttribute("role", "group"); d.setAttribute("aria-label", "Map layers");
      d.innerHTML = `
        <button type="button" class="lyrhead" aria-expanded="${ui.layers}" aria-controls="lyrbody">${LAYERS_ICON}Layers${CHEV}</button>
        <div class="lyrbody" id="lyrbody">
          <label><input type="checkbox" data-k="stays" ${staysOn() ? "checked" : ""}><span class="sw stays" aria-hidden="true"></span>Stays</label>
          <label><input type="checkbox" data-k="hikes" ${show.hikes ? "checked" : ""}><span class="sw hikes" aria-hidden="true"></span>Hikes<small>${TRAILS.length}</small></label>
          <div class="key" ${show.hikes ? "" : "hidden"}><span><i style="color:${COL.Day}"></i>Day</span><span><i style="color:${COL.Overnight}"></i>Overnight</span><span><i class="part"></i>Part of route</span></div>
          <label><input type="checkbox" data-k="areas" ${show.areas ? "checked" : ""}><span class="sw areas" aria-hidden="true"></span>Hiking areas</label>
        </div>`;
      const head = d.querySelector(".lyrhead");
      head.onclick = () => { ui.layers = !ui.layers; d.classList.toggle("shut", !ui.layers); head.setAttribute("aria-expanded", ui.layers); };
      d.querySelectorAll("input").forEach(inp => inp.onchange = () => {
        const k = inp.dataset.k, on = inp.checked;
        if (k === "stays") { const b = staysBtn(); if (b) { if (staysOn() !== on) b.click(); } else store.set("stays-on", on); setHuts(this.m); return; }
        show[k] = on; store.set(LAYER_KEYS[k], on); setVis(this.m, k);
        if (k === "hikes") { d.querySelector(".key").hidden = !on; if (rail) rail.hikes(); }
        if (!on) pop.remove();
      });
      // keep the Stays box in step when the side panel button is used (or appears after the data loads)
      this.obs = new MutationObserver(() => { const box = d.querySelector('[data-k="stays"]'); if (box.checked !== staysOn()) box.checked = staysOn(); setHuts(this.m); });
      this.obs.observe(document.getElementById("view") || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed"] });
      this.d = d; return d;
    }
    onRemove() { this.obs.disconnect(); this.d.remove(); }
  }

  let pop = null, selTrail = null, rail = null, openPop = null;
  function trailPopup(tr) {
    const kind = tr.t === "Overnight" ? "Overnight hike" : "Day hike";
    return `<div class="mappop"><h4>${esc(tr.n)}</h4><div class="sub">${esc(kind)} · ${esc(tr.a)}</div>
      <p>${tr.km ? `${tr.km.toFixed(1)} km on the map` : ""}${tr.m === "Partial" ? " · part of the route only" : ""}</p>
      ${tr.note ? `<p>${esc(tr.note)}</p>` : ""}
      <div class="acts"><button type="button" data-fit="${tr.id}">Zoom to trail</button>${tr.osm ? `<a href="${esc(tr.osm)}" target="_blank" rel="noopener">Map source ↗</a>` : ""}</div>
      <small>Track from OpenStreetMap; check official trail maps before you go.</small></div>`;
  }
  function fitTrail(m, id) {
    const tr = TRAILS[id]; if (!tr) return; const b = new maplibregl.LngLatBounds();
    tr.lines.forEach(l => l.forEach(p => b.extend(p)));
    const pad = phone.matches ? { top: 70, bottom: 150, left: 30, right: 30 } : 60;
    m.fitBounds(b, { padding: pad, maxZoom: 14, duration: 900 });
  }
  function highlight(m, id) {
    selTrail = id;
    if (m.getLayer("tr-hl")) m.setFilter("tr-hl", ["==", ["get", "id"], id == null ? -1 : id]);
    if (rail) rail.hikes();
  }
  // The point roughly halfway along a trail's longest line, for its popup.
  function midPoint(tr) {
    const l = tr.lines.reduce((a, b) => (b.length > a.length ? b : a), []);
    return l.length ? l[Math.floor(l.length / 2)] : [(tr.bb[0] + tr.bb[2]) / 2, (tr.bb[1] + tr.bb[3]) / 2];
  }
  function showTrail(m, id) {
    const tr = TRAILS[id]; if (!tr) return;
    if (!show.hikes) { show.hikes = true; store.set(LAYER_KEYS.hikes, true); setVis(m, "hikes");
      const box = document.querySelector('.lyrctl [data-k="hikes"]'); if (box) { box.checked = true; box.closest(".lyrctl").querySelector(".key").hidden = false; } }
    let done = false;
    const after = () => { if (done) return; done = true; openPop(midPoint(tr), trailPopup(tr)); highlight(m, id); };
    m.once("moveend", after);
    setTimeout(after, 1300); // in case the map was already there and didn't move
    fitTrail(m, id);
  }

  // ---- the side panel: collapse it, and fold its contents into Stays and Hikes sections ----
  function buildRail(m) {
    const planner = document.querySelector(".planner"), r = planner && planner.querySelector(".rail"), wrap = planner && planner.querySelector(".mapwrap");
    if (!r || !wrap || r.dataset.built || maps[maps.length - 1] !== m) return; // skip a map that has already been replaced
    r.dataset.built = "1";
    document.body.classList.add("mapview");

    // header: title plus a button to hide the panel
    const card = r.querySelector(".routecard"), h1 = card && card.querySelector("h1");
    if (h1) {
      h1.textContent = "Stays and hikes";
      const head = document.createElement("div"); head.className = "railhead";
      h1.replaceWith(head); head.appendChild(h1);
      head.insertAdjacentHTML("beforeend", `<button type="button" class="railx" aria-label="Hide list">${phone.matches ? "Close" : `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>Hide`}</button>`);
    }
    const q = r.querySelector("#mq");
    if (q) q.placeholder = "Search stays and hikes";
    r.insertAdjacentHTML("afterbegin", `<button type="button" class="railgrab" aria-label="Close list"></button>`);

    // Stays section: the bookable stays list from app-core.js and the accommodation list from stays.js
    const stays = document.createElement("details"); stays.className = "msec"; stays.id = "sec-stays"; stays.open = ui.stays;
    stays.innerHTML = `<summary><span class="ic stays" aria-hidden="true"></span>Stays<span class="cnt" id="stays-cnt"></span>${CHEV}</summary><div class="secbody"></div>`;
    const sbody = stays.querySelector(".secbody");
    const mcount = r.querySelector(".mcount"), mlist = r.querySelector("#mlist"), shead = r.querySelector(".stayhead"), slist = r.querySelector("#slist");
    if (mcount || mlist) sbody.insertAdjacentHTML("beforeend", `<h2 class="subhead">Bookable stays</h2>`);
    [mcount, mlist, shead, slist].forEach(el => el && sbody.appendChild(el));

    // Hikes section: trails whose line falls inside the map view
    const hikes = document.createElement("details"); hikes.className = "msec"; hikes.id = "sec-hikes"; hikes.open = ui.hikes;
    hikes.innerHTML = `<summary><span class="ic hikes" aria-hidden="true"></span>Hikes<span class="cnt" id="hikes-cnt"></span>${CHEV}</summary><div class="secbody"><div class="mcount"><span id="hcnt"></span><span>Move the map to filter</span></div><div class="mlist" id="hlist"></div></div>`;
    r.appendChild(stays); r.appendChild(hikes);
    stays.addEventListener("toggle", () => { ui.stays = stays.open; });
    hikes.addEventListener("toggle", () => { ui.hikes = hikes.open; if (hikes.open) renderHikes(); });

    // button on the map that opens the panel
    wrap.insertAdjacentHTML("beforeend", `<button type="button" class="railbtn" aria-controls="rail" aria-expanded="false">${LIST_ICON}<span>Show list <em id="railbtn-n"></em></span></button>`);
    r.id = "rail";
    const btn = wrap.querySelector(".railbtn");

    const setOpen = (open, focus) => {
      ui.rail = open;
      planner.classList.toggle("rail-shut", !open);
      btn.setAttribute("aria-expanded", open);
      if (open) { renderHikes(); if (focus) (r.querySelector(".railx") || r).focus({ preventScroll: true }); r.scrollTop = 0; }
      else if (focus) btn.focus({ preventScroll: true });
      // the map changes width on wide screens
      if (!phone.matches) requestAnimationFrame(() => { m.resize(); });
    };
    btn.onclick = () => setOpen(true, true);
    const x = r.querySelector(".railx"); if (x) x.onclick = () => setOpen(false, true);
    r.querySelector(".railgrab").onclick = () => setOpen(false, true);
    setOpen(ui.rail, false);
    if (!phone.matches) requestAnimationFrame(() => m.resize());

    // On phones the panel covers the map, so picking a stay or hike closes it to show the map.
    // (Bookable stays expand in place with their "View & book" button, so those keep the panel open.)
    r.addEventListener("click", e => {
      if (!phone.matches) return;
      if (e.target.closest("#slist .sitem")) setOpen(false, false);
    });
    // swipe the sheet down from its handle (or from the top of the list) to close it
    let y0 = null;
    r.addEventListener("touchstart", e => { y0 = r.scrollTop <= 0 ? e.touches[0].clientY : null; r.style.transition = ""; }, { passive: true });
    r.addEventListener("touchmove", e => { if (y0 === null || !phone.matches) return; const dy = e.touches[0].clientY - y0; if (dy > 0) r.style.transform = `translateY(${dy}px)`; }, { passive: true });
    r.addEventListener("touchend", e => {
      if (y0 === null || !phone.matches) return;
      const dy = e.changedTouches[0].clientY - y0; y0 = null;
      r.style.transition = "transform .18s ease-out"; r.style.transform = "";
      if (dy > 90) setOpen(false, false);
    });

    function hikesMatching() {
      const t = (q ? q.value : "").trim().toLowerCase();
      return TRAILS.filter(tr => tr.lines.length && (!t || `${tr.n} ${tr.a} ${tr.t}`.toLowerCase().includes(t)));
    }
    function hikesInView(all) {
      const b = m.getBounds(), W = b.getWest(), S = b.getSouth(), E = b.getEast(), N = b.getNorth();
      return all.filter(tr => tr.bb[0] <= E && tr.bb[2] >= W && tr.bb[1] <= N && tr.bb[3] >= S).sort((a, c) => a.n.localeCompare(c.n));
    }
    function renderHikes() {
      const all = hikesMatching(), inView = show.hikes ? hikesInView(all) : [];
      const cnt = document.getElementById("hikes-cnt"); if (cnt) cnt.textContent = show.hikes ? `${inView.length} in view` : "Hidden";
      updateCounts();
      if (!hikes.open && !ui.rail) return;
      const el = document.getElementById("hlist"); if (!el) return;
      document.getElementById("hcnt").textContent = show.hikes ? `${inView.length} of ${all.length} in view` : "";
      const MAX = 40;
      el.innerHTML = !show.hikes ? `<p class="hnote">Hikes are hidden. Tick Hikes under Layers on the map to show them.</p>`
        : inView.length ? inView.slice(0, MAX).map(tr => `<button type="button" class="card hitem ${tr.id === selTrail ? "on" : ""}" data-id="${tr.id}">
            <span class="ln ${tr.m === "Partial" ? "part" : ""}" style="--c:${COL[tr.t] || COL.Day}" aria-hidden="true"></span>
            <span><b>${esc(tr.n)}</b><span class="m">${tr.t === "Overnight" ? "Overnight" : "Day hike"}${tr.km ? ` · ${tr.km.toFixed(1)} km` : ""} · ${esc(tr.a)}</span></span></button>`).join("")
          + (inView.length > MAX ? `<p class="hnote">${inView.length - MAX} more in view. Zoom in to narrow the list.</p>` : "")
        : `<p class="hnote">No hikes here. Zoom out or clear the search.</p>`;
      el.querySelectorAll(".hitem").forEach(b => b.onclick = () => {
        if (phone.matches) setOpen(false, false);
        showTrail(m, +b.dataset.id);
      });
    }

    // Counts on the Stays heading and the "Show list" button, read from the two stays lists.
    function updateCounts() {
      const n = id => { const el = document.getElementById(id); const v = el && parseInt(el.textContent, 10); return isNaN(v) ? 0 : v; };
      const staysN = n("mcnt") + n("scnt");
      const sc = document.getElementById("stays-cnt"); if (sc) sc.textContent = `${staysN} in view`;
      const hikesN = show.hikes ? hikesInView(hikesMatching()).length : 0;
      const bn = document.getElementById("railbtn-n");
      if (bn) bn.textContent = `· ${staysN} ${staysN === 1 ? "stay" : "stays"}${show.hikes ? `, ${hikesN} ${hikesN === 1 ? "hike" : "hikes"}` : ""}`;
    }
    const cntObs = new MutationObserver(updateCounts);
    ["mcnt", "scnt"].forEach(id => { const el = document.getElementById(id); if (el) cntObs.observe(el, { childList: true, characterData: true, subtree: true }); });

    if (q) q.addEventListener("input", renderHikes);
    m.on("moveend", renderHikes);
    m.once("load", renderHikes);
    m.on("remove", () => cntObs.disconnect());
    renderHikes();
    rail = { hikes: renderHikes, setOpen };
  }

  function enhance(m) {
    m.addControl(new LayerCtl(m), "top-left");
    pop = new maplibregl.Popup({ closeButton: true, maxWidth: "270px", offset: 6 });
    openPop = (lngLat, html) => {
      pop.setLngLat(lngLat).setHTML(html).addTo(m);
      const btn = pop.getElement() && pop.getElement().querySelector("[data-fit]");
      if (btn) btn.onclick = () => { fitTrail(m, +btn.dataset.fit); pop.remove(); };
    };
    pop.on("close", () => highlight(m, null));
    m.on("style.load", () => { addLayers(m); setHuts(m); });
    if (m.isStyleLoaded()) { addLayers(m); setHuts(m); }
    m.on("click", e => {
      // hut and accommodation dots sit on top and keep their own taps
      const dots = ["pt", "cl", "st-hit"].filter(l => m.getLayer(l) && m.getLayoutProperty(l, "visibility") !== "none");
      if (dots.length && m.queryRenderedFeatures(e.point, { layers: dots }).length) return;
      if (show.hikes && m.getLayer("tr-hit")) {
        const f = m.queryRenderedFeatures(e.point, { layers: ["tr-hit"] })[0];
        if (f) { const tr = TRAILS[f.properties.id]; openPop(e.lngLat, trailPopup(tr)); highlight(m, tr.id); return; }
      }
      if (show.areas && m.getLayer("ha-fill")) {
        const f = m.queryRenderedFeatures(e.point, { layers: ["ha-fill"] })[0];
        const a = f && byId[f.properties.id];
        if (a) openPop(e.lngLat, `<div class="mappop"><h4>${esc(a.name)}</h4><ul>${a.hikes.map(h => `<li>${esc(h)}</li>`).join("")}</ul><small>Shaded area is approximate.</small></div>`);
      }
    });
    if (matchMedia("(hover: hover)").matches) {
      const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      m.on("mousemove", "tr-hit", e => { m.getCanvas().style.cursor = "pointer"; tip.setLngLat(e.lngLat).setText(TRAILS[e.features[0].properties.id].n).addTo(m); });
      m.on("mouseleave", "tr-hit", () => { m.getCanvas().style.cursor = ""; tip.remove(); });
    }
    // stays.js may wrap mapPage() outside this wrapper, so restructure the panel once every wrapper has run
    setTimeout(() => buildRail(m), 0);
  }

  addEventListener("hashchange", () => document.body.classList.toggle("mapview", (location.hash.slice(1) || "home").split("-")[0] === "map"));

  const baseMapPage = mapPage;
  mapPage = function (...args) {
    rail = null; selTrail = null;
    baseMapPage.apply(this, args);
    const m = maps[maps.length - 1];
    if (m) enhance(m);
  };
  // The first view may already be drawn; redraw it if it was the map.
  if ((location.hash.slice(1) || "home").split("-")[0] === "map") nav();
})();
