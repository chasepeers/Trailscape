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
- `admin.html`: back office for enquiries, bookings, blocked nights and stay prices

## Back end (bookings API)

Cloudflare Pages Functions in `functions/api/`, with shared code in `lib/api.js` and a D1 database (`trailscape`,
bound as `DB` in `wrangler.toml`). The site calls it through `window.HS_CONFIG = { apiBase: "/api" }` in `index.html`.

| Endpoint | Used by |
| --- | --- |
| `GET /api/availability?stay=&from=&to=` | calendar for instant-booking stays |
| `GET /api/booked?stay=&from=&to=` | calendar for enquiry stays (nights already taken) |
| `POST /api/enquiries` | enquiry form |
| `POST /api/bookings` | instant booking (payment is a stub until a gateway is chosen) |
| `GET /api/health` | quick check that the database is connected |
| `/api/admin/*` | back office at `/admin.html` (password = `ADMIN_TOKEN` secret) |

Prices are recalculated on the server; the browser's quote is only kept for comparison.

**Secrets** (Cloudflare → Workers & Pages → trailscape → Settings → Variables and Secrets, for Production and Preview):
`ADMIN_TOKEN` (required for the back office) and `RESEND_API_KEY` (optional; turns on emails to you and to guests).

**Database changes:** add a numbered file to `migrations/` and apply it with
`npx wrangler d1 migrations apply trailscape --remote`. `node scripts/make-seed.mjs` rebuilds `seed/stays.sql` from the
site's stay data; running it again refreshes names and estimates but keeps real rates entered in the back office.

**Local testing:** `node build-trails.mjs`, then `npx wrangler d1 migrations apply trailscape --local`,
`npx wrangler d1 execute trailscape --local --file seed/stays.sql`, put `ADMIN_TOKEN=...` in `.dev.vars`, and run
`npx wrangler pages dev public`.

## Map tiles

The map uses MapTiler. Its API key only works on allowed origins, so add every new domain
(including the `*.pages.dev` address) to the key in the MapTiler dashboard.
