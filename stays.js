// ---------- Accommodation layer for the Map page ----------
// Loaded after app.js. Loads stays-data.js (the spreadsheet rows), then adds every listing to the Map page
// as a ring-shaped dot; tapping a dot opens a card (a bottom sheet on phones) with details, contacts and website.
// It extends mapPage() rather than editing it, using app.js globals: maps, OPS, esc, $, store, nav, FONT.
(() => {
  const s = document.createElement("script");
  s.src = "stays-data.js";
  s.onload = init;
  s.onerror = () => console.warn("Accommodation data could not be loaded");
  document.head.appendChild(s);

  function init() {
  const STAY_OPS = { ...OPS, mu: { label: "Municipal", c: "#6b7f7a" } };
  const STATUS_TAG = {
    "Confirmed in research": ["ok", "Contact checked"],
    "Central reservations (confirmed)": ["ok", "Central reservations"],
    "Prior knowledge – verify": ["warn", "Not yet verified"],
  };
  const byId = Object.fromEntries(STAYS.map(s => [s.id, s]));
  const domain = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
  const phone = matchMedia("(max-width: 960px)");
  const coarse = matchMedia("(pointer: coarse)");
  const canHover = matchMedia("(hover: hover)");
  let showStays = store.get("stays-on", true);

  const css = document.createElement("style");
  css.textContent = `
  .staycard { position: absolute; z-index: 600; left: 12px; top: 56px; width: min(340px, calc(100% - 24px)); max-height: calc(100% - 110px); overflow-y: auto; overscroll-behavior: contain;
    background: var(--card); color: var(--fg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 6px 24px rgba(20,25,20,.18); padding: 16px 16px 14px; display: flex; flex-direction: column; gap: 10px; }
  .staycard[hidden] { display: none; }
  .staycard .grab { display: none; }
  .staycard .x { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: var(--band); cursor: pointer; font-size: 1.15rem; line-height: 1; color: var(--muted); }
  .staycard .x:hover { color: var(--fg); }
  .staycard h3 { font-size: 1.2rem; line-height: 1.2; padding-right: 34px; }
  .staycard .sub { font-size: .88rem; color: var(--muted); margin-top: -4px; }
  .staycard dl { display: grid; grid-template-columns: 92px 1fr; gap: 6px 10px; margin: 0; font-size: .88rem; }
  .staycard dt { color: var(--muted); }
  .staycard dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .staycard .contact { display: grid; gap: 6px; border-top: 1px solid var(--line); padding-top: 10px; }
  .staycard .contact a { display: flex; gap: 8px; align-items: center; font-size: .92rem; text-decoration: none; color: var(--fg); overflow-wrap: anywhere; min-width: 0; }
  .staycard .contact a span { min-width: 0; }
  .staycard .contact a:hover span { text-decoration: underline; }
  .staycard .contact svg { width: 16px; height: 16px; flex: none; color: var(--green); }
  .staycard .contact small { color: var(--muted); margin-left: auto; padding-left: 6px; white-space: nowrap; }
  .staycard .none { font-size: .88rem; color: var(--muted); }
  .staycard .fine { font-size: .78rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .staycard .fine a { color: var(--muted); }
  .staycard .also { font-size: .85rem; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .staycard .also button { border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 5px 12px; cursor: pointer; font-size: .85rem; }
  .stayring { width: 11px; height: 11px; border-radius: 50%; background: var(--card); border: 2.5px solid var(--c); display: inline-block; flex: none; }
  .stayhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 6px; }
  .stayhead h2 { font-size: 1.1rem; font-weight: 600; }
  .sitem { padding: 10px 14px; cursor: pointer; text-align: left; width: 100%; font: inherit; color: inherit; display: flex; gap: 10px; align-items: flex-start; }
  .sitem:hover, .sitem.on { border-color: var(--clay); }
  .sitem b { display: block; font-weight: 600; }
  .sitem span.m { font-size: .8rem; color: var(--muted); }
  .sitem .stayring { margin-top: 5px; }
  .smore { font-size: .85rem; }

  /* Phones and small tablets: the card becomes a bottom sheet over the page. */
  @media (max-width: 960px) {
    .staycard { position: fixed; z-index: 950; left: 0; right: 0; bottom: 0; top: auto; width: auto; max-height: min(60dvh, 560px);
      border-radius: 18px 18px 0 0; border-bottom: 0; box-shadow: 0 -8px 30px rgba(20,25,20,.22);
      padding: 6px max(16px, env(safe-area-inset-left, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-right, 0px));
      animation: sheetUp .22s ease-out; touch-action: pan-y; }
    .staycard .grab { display: block; align-self: center; width: 100%; height: 22px; border: 0; background: none; cursor: grab; position: relative; flex: none; }
    .staycard .grab::before { content: ""; position: absolute; left: 50%; top: 8px; width: 40px; height: 5px; margin-left: -20px; border-radius: 3px; background: var(--line); }
    .staycard .x { top: 20px; right: 12px; width: 36px; height: 36px; }
    .staycard h3 { font-size: 1.3rem; }
    .staycard dl { grid-template-columns: 1fr; gap: 2px; }
    .staycard dd { margin-bottom: 6px; }
    .staycard .contact { gap: 8px; }
    .staycard .contact a { min-height: 48px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; font-size: 1rem; }
    .staycard .contact a:active { background: var(--band); }
    .staycard .contact a:hover span { text-decoration: none; }
    .staycard .contact svg { width: 18px; height: 18px; }
    .staycard .also button { padding: 8px 14px; }
    .staycard .fine { font-size: .82rem; }
    .staycard .fine a { padding: 4px 0; }
    #stoggle { min-height: 40px; }
    .sitem { min-height: 52px; }
  }
  @keyframes sheetUp { from { transform: translateY(40%); opacity: .4; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .staycard { animation: none; } }
  `;
  document.head.appendChild(css);

  const ICON = {
    tel: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 1.8h2.6l1.2 3.1-1.6 1a8 8 0 0 0 4.9 4.9l1-1.6 3.1 1.2v2.6c0 .7-.6 1.2-1.2 1.2A12.4 12.4 0 0 1 1.8 3c0-.6.5-1.2 1.2-1.2z"/></svg>`,
    mail: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M2 4l6 5 6-5"/></svg>`,
    web: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2 2 2.6 4.2 2.6 6.5S10 12.5 8 14.5C6 12.5 5.4 10.3 5.4 8S6 3.5 8 1.5z"/></svg>`,
    dir: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5l6.5 6.5L8 14.5 1.5 8z"/><path d="M6 9.5V7.5h4M8.5 6l1.5 1.5L8.5 9"/></svg>`,
  };

  function staysFC(list) {
    return { type: "FeatureCollection", features: list.map(s => ({ type: "Feature", properties: { id: s.id, name: s.name, color: STAY_OPS[s.k].c }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } })) };
  }

  function cardHTML(s, others) {
    const op = STAY_OPS[s.k];
    const tag = STATUS_TAG[s.status] || ["mute", s.status || "Unverified"];
    const dir = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
    const contact = [
      ...(s.phones || []).map(([label, num, tel]) => `<a href="tel:${esc(tel)}">${ICON.tel}<span>${esc(num)}</span>${label ? `<small>${esc(label)}</small>` : ""}</a>`),
      s.email ? `<a href="mailto:${esc(s.email)}">${ICON.mail}<span>${esc(s.email)}</span></a>` : "",
      s.web ? `<a href="${esc(s.web)}" target="_blank" rel="noopener">${ICON.web}<span>${esc(domain(s.web))}</span><small>Website ↗</small></a>` : "",
    ].join("");
    return `
      <button class="grab" type="button" aria-label="Close details"></button>
      <button class="x" type="button" aria-label="Close">×</button>
      <span style="font-size:.85rem" class="op"><i style="--c:${op.c};background:${op.c}"></i>${esc(s.operator)}</span>
      <h3>${esc(s.name)}</h3>
      <div class="sub">${esc(s.type)} · ${esc(s.region)}</div>
      <span><span class="tag ${tag[0]}">${esc(tag[1])}</span></span>
      <dl>
        <dt>Where</dt><dd>${esc(s.loc)}</dd>
        ${s.hike ? `<dt>Nearby hiking</dt><dd>${esc(s.hike)}</dd>` : ""}
        ${s.book ? `<dt>Book by</dt><dd>${esc(s.book)}</dd>` : ""}
        ${s.notes ? `<dt>Notes</dt><dd>${esc(s.notes)}</dd>` : ""}
      </dl>
      <div class="contact">${contact || `<span class="none">No contact details on file yet.</span>`}
        <a href="${dir}" target="_blank" rel="noopener">${ICON.dir}<span>Directions</span><small>${s.gps ? "GPS position ↗" : "Approx. area ↗"}</small></a></div>
      ${others.length ? `<div class="also"><span class="muted">Also here:</span>${others.map(o => `<button type="button" data-id="${o.id}">${esc(o.name)}</button>`).join("")}</div>` : ""}
      <div class="fine"><span>${s.gps ? "Position from published GPS" : "Approximate position"}</span>${s.src ? `<a href="${esc(s.src)}" target="_blank" rel="noopener">Listing: ${esc(domain(s.src))}</a>` : ""}<span>${esc(s.id)}</span></div>`;
  }

  function enhance(m) {
    const wrap = document.querySelector(".mapwrap"), rail = document.querySelector(".rail"), ops = $("#mops"), q = $("#mq");
    if (!wrap || !rail || !ops) return;
    let sel = null;

    // Municipal chip (only accommodation has municipal operators) and the accommodation toggle
    ops.insertAdjacentHTML("beforeend", `<button class="chip mchip" aria-pressed="true" data-op="mu" style="--c:${STAY_OPS.mu.c}"><i></i>Municipal</button>`);
    const muChip = ops.querySelector('[data-op="mu"]');
    muChip.onclick = () => { muChip.setAttribute("aria-pressed", muChip.getAttribute("aria-pressed") !== "true"); refresh(); };
    ops.insertAdjacentHTML("afterend", `<button class="chip" id="stoggle" aria-pressed="${showStays}" style="align-self:flex-start"><span class="stayring" style="--c:var(--green)"></span>Accommodation (${STAYS.length})</button>`);
    const tog = $("#stoggle");
    tog.onclick = () => { showStays = !showStays; store.set("stays-on", showStays); tog.setAttribute("aria-pressed", showStays); if (!showStays) close(); refresh(); };

    rail.insertAdjacentHTML("beforeend", `<div class="stayhead"><h2>Accommodation in view</h2><span class="muted" id="scnt" style="font-size:.85rem"></span></div><div class="mlist" id="slist"></div>`);
    wrap.insertAdjacentHTML("beforeend", `<div class="staycard" id="scard" hidden role="dialog" aria-label="Accommodation details"></div>`);
    const card = $("#scard");

    const activeOps = () => new Set([...ops.querySelectorAll(".chip[data-op]")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.dataset.op));
    const filtered = () => {
      if (!showStays) return [];
      const a = activeOps(), t = (q ? q.value : "").trim().toLowerCase();
      return STAYS.filter(s => a.has(s.k) && (!t || [s.name, s.type, s.loc, s.hike, s.region, s.operator].join(" ").toLowerCase().includes(t)));
    };

    function addLayers(mm) {
      if (mm.getSource("stays")) return;
      const before = mm.getLayer("cl") ? "cl" : undefined;
      mm.addSource("stays", { type: "geojson", data: staysFC(filtered()) });
      mm.addLayer({ id: "st-sel", type: "circle", source: "stays", filter: ["==", ["get", "id"], sel || ""],
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 10, 12, 14], "circle-color": "#b5623a", "circle-opacity": 0.25, "circle-stroke-width": 2, "circle-stroke-color": "#b5623a" } }, before);
      mm.addLayer({ id: "st", type: "circle", source: "stays",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, coarse.matches ? 4.5 : 3.5, 9, coarse.matches ? 6.5 : 5.5, 13, coarse.matches ? 9 : 8], "circle-color": "#ffffff",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 2, 12, 3], "circle-stroke-color": ["get", "color"] } }, before);
      // Invisible, wider target so a fingertip doesn't have to land exactly on the dot.
      mm.addLayer({ id: "st-hit", type: "circle", source: "stays",
        paint: { "circle-radius": coarse.matches ? 18 : 9, "circle-color": "#000000", "circle-opacity": 0.001 } }, before);
      try {
        mm.addLayer({ id: "st-l", type: "symbol", source: "stays", minzoom: 11,
          layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1], "text-anchor": "top", "text-optional": true },
          paint: { "text-color": "#34432f", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } }, before);
      } catch (e) { console.warn("stay labels unavailable", e); }
    }

    function refresh() {
      const src = m.getSource("stays"); if (src) src.setData(staysFC(filtered()));
      if (sel && !filtered().find(s => s.id === sel)) close();
      list();
    }

    // How much of the map the bottom sheet covers, so the selected dot can be kept above it.
    function sheetPad() {
      if (!phone.matches || card.hidden) return { top: 0, bottom: 0, left: 0, right: 0 };
      // Use the sheet's resting height, not its position mid-animation.
      const mr = m.getContainer().getBoundingClientRect(), sheetTop = window.innerHeight - card.offsetHeight;
      return { top: 0, left: 0, right: 0, bottom: Math.max(0, Math.min(mr.height * 0.7, mr.bottom - sheetTop)) };
    }

    function open(id, fly) {
      const s = byId[id]; if (!s) return;
      sel = id;
      if (m.getLayer("st-sel")) m.setFilter("st-sel", ["==", ["get", "id"], id]);
      const others = STAYS.filter(o => o.id !== id && Math.abs(o.lat - s.lat) < 0.0006 && Math.abs(o.lng - s.lng) < 0.0006);
      card.innerHTML = cardHTML(s, others);
      card.hidden = false; card.scrollTop = 0;
      card.querySelector(".x").onclick = close;
      card.querySelector(".grab").onclick = close;
      card.querySelectorAll(".also button").forEach(b => b.onclick = () => open(b.dataset.id, false));
      if (fly) m.flyTo({ center: [s.lng, s.lat], zoom: Math.max(m.getZoom(), 11), duration: 900, padding: sheetPad() });
      else if (phone.matches) m.easeTo({ center: [s.lng, s.lat], duration: 450, padding: sheetPad() });
      list();
      const item = document.querySelector(`#slist .sitem[data-id="${id}"]`);
      if (item && !phone.matches) item.scrollIntoView({ block: "nearest" });
    }
    function close() {
      if (card.hidden) return;
      sel = null; card.hidden = true;
      if (m.getLayer("st-sel")) m.setFilter("st-sel", ["==", ["get", "id"], ""]);
      list();
    }

    // Swipe the sheet down to close it (only when it's scrolled to the top).
    let y0 = null;
    card.addEventListener("touchstart", e => { y0 = card.scrollTop <= 0 ? e.touches[0].clientY : null; card.style.transition = ""; }, { passive: true });
    card.addEventListener("touchmove", e => { if (y0 === null || !phone.matches) return; const dy = e.touches[0].clientY - y0; if (dy > 0) card.style.transform = `translateY(${dy}px)`; }, { passive: true });
    card.addEventListener("touchend", e => {
      if (y0 === null || !phone.matches) return;
      const dy = e.changedTouches[0].clientY - y0; y0 = null;
      card.style.transition = "transform .18s ease-out"; card.style.transform = "";
      if (dy > 90) close();
    });

    function list() {
      const el = $("#slist"); if (!el) return;
      const all = filtered(), b = m.getBounds();
      const inView = all.filter(s => b.contains([s.lng, s.lat]));
      const MAX = 40;
      $("#scnt").textContent = showStays ? `${inView.length} of ${all.length}` : "Hidden";
      el.innerHTML = !showStays ? `<p class="muted" style="margin:0">Turn on Accommodation above to see places to stay.</p>`
        : inView.length ? inView.slice(0, MAX).map(s => `<button type="button" class="card sitem ${s.id === sel ? "on" : ""}" data-id="${s.id}"><span class="stayring" style="--c:${STAY_OPS[s.k].c}"></span><span><b>${esc(s.name)}</b><span class="m">${esc(s.type)} · ${esc(s.loc)}</span></span></button>`).join("")
          + (inView.length > MAX ? `<p class="muted smore" style="margin:0">${inView.length - MAX} more in view. Zoom in to narrow the list.</p>` : "")
        : `<p class="muted" style="margin:0">No accommodation here. Zoom out or clear a filter.</p>`;
      el.querySelectorAll(".sitem").forEach(x => x.onclick = () => open(x.dataset.id, true));
    }

    m.on("style.load", () => addLayers(m));
    if (m.isStyleLoaded() && m.getSource("huts")) addLayers(m);

    const hutHit = e => { const l = ["pt", "cl"].filter(x => m.getLayer(x)); return l.length && m.queryRenderedFeatures(e.point, { layers: l }).length; };
    m.on("click", e => {
      if (!m.getLayer("st-hit") || hutHit(e)) return; // a hut pin drawn on top wins the tap
      const f = m.queryRenderedFeatures(e.point, { layers: ["st-hit"] });
      if (!f.length) { if (phone.matches) close(); return; } // tapping empty map dismisses the sheet
      // Several dots under a fingertip: take the one nearest the tap.
      const best = f.map(x => { const p = m.project(x.geometry.coordinates); return [x, (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2]; }).sort((a, b) => a[1] - b[1])[0][0];
      open(best.properties.id, false);
    });
    if (canHover.matches) {
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      m.on("mouseenter", "st-hit", e => { m.getCanvas().style.cursor = "pointer"; pop.setLngLat(e.features[0].geometry.coordinates).setText(e.features[0].properties.name).addTo(m); });
      m.on("mouseleave", "st-hit", () => { m.getCanvas().style.cursor = ""; pop.remove(); });
    }

    ops.addEventListener("click", e => { if (e.target.closest(".chip") && e.target.closest(".chip") !== muChip) setTimeout(refresh, 0); });
    if (q) q.addEventListener("input", refresh);
    m.on("moveend", list);
    m.once("load", list);
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    m.on("remove", () => document.removeEventListener("keydown", onKey));
    list();
  }

  const baseMapPage = mapPage;
  mapPage = function (...args) {
    baseMapPage.apply(this, args);
    const m = maps[maps.length - 1];
    if (m) enhance(m);
  };
  // app.js has already drawn the first view; redraw it if that view was the map.
  if ((location.hash.slice(1) || "home").split("-")[0] === "map") nav();
  }
})();
