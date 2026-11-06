// Loads the front page hero styles (home.css), then the main app (app-core.js), the accommodation layer (stays.js),
// the hiking trail data (trails-data.js), the hiking-area outlines (hiking-areas.js), the map layers panel with trails and hiking areas (map-layers.js)
// and on-site booking with the availability calendar (booking.js), in that order.
(() => {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "home.css";
  document.head.appendChild(css);
})();
["app-core.js", "stays.js", "trails-data.js", "hiking-areas.js", "map-layers.js", "booking.js"].forEach(src => {
  const s = document.createElement("script");
  s.src = src;
  s.async = false;
  document.body.appendChild(s);
});
