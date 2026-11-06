# Trailscape

Map-first planning and booking for hikes and overnight stays in South Africa (Western Cape first).
Plain HTML, CSS and JavaScript with no framework and no dependencies.

## Deploying on Cloudflare Pages

Connect this repo in the Cloudflare dashboard (Workers & Pages → Create → Pages → Connect to Git) with:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `node build-trails.mjs` |
| Build output directory | `public` |

Every push to `main` deploys to production; other branches get preview links.

## How the build works

`build-trails.mjs` reads `trail-ids.json` (OpenStreetMap route and path IDs plus the details shown for each hike),
downloads the trail lines from the OpenStreetMap API, writes `trails-data.js`, then copies the site into `public/`.
If OpenStreetMap can't be reached the build still succeeds, just without trails on the map.

`_headers` sets the security headers on Cloudflare Pages. `vercel.json` does the same on Vercel, which hosted the
site until November 2026.

## Files

- `index.html`: page shell, styles and navigation
- `app.js`: loader (loads `home.css`, then the scripts below in order)
- `app-core.js`: main app (pages, booking flow, back office)
- `stays.js`, `stays-data.js`: accommodation layer and listings
- `hiking-areas.js`: shaded hiking-area outlines
- `map-layers.js`: map layer panel, trails, side-panel sections
- `booking.js`: on-site booking with availability calendar
- `home.css`: front page hero styles

## Map tiles

The map uses MapTiler. Its API key only works on allowed origins, so add every new domain
(including the `*.pages.dev` address) to the key in the MapTiler dashboard.
