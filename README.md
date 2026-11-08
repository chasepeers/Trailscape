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
- `app-core.js`: main app (pages, front page, map)
- `account.js`: sign in / sign up on My trips, admin-only Back office link
- `stays.js`, `stays-data.js`: accommodation layer and listings
- `hiking-areas.js`: shaded hiking-area outlines
- `map-layers.js`: map layer panel, trails, side-panel sections
- `booking.js`: on-site booking with availability calendar
- `home.css`: front page hero styles
- `admin.html`: back office for enquiries, bookings, blocked nights and stay prices

## Booking types

Every stay is one of two types, set by `bookMode()` in `app-core.js` (and mirrored in the database `stays.mode` column):

- **Instant booking** (`instant`): CapeNature, SANParks and NightsBridge stays (`NIGHTSBRIDGE` in `app-core.js`), where we
  book straight into the provider's own calendar. The guest pays when booking: in full, or a deposit where the stay takes one.
- **Easy enquire** (`enquiry`): every other stay. We email the stay on the guest's behalf; the guest pays once availability
  is confirmed.

The map and stays-list filters, the dot colours and the booking flow all follow these two types. After changing the rule,
run `node scripts/make-seed.mjs` and apply `seed/stays.sql` so the database agrees.

## Back end (bookings API)

Cloudflare Pages Functions in `functions/api/`, with shared code in `lib/api.js` and a D1 database (`trailscape`,
bound as `DB` in `wrangler.toml`). The site calls it through `window.HS_CONFIG = { apiBase: "/api" }` in `index.html`.

| Endpoint | Used by |
| --- | --- |
| `GET /api/availability?stay=&from=&to=` | calendar for Instant booking stays |
| `GET /api/booked?stay=&from=&to=` | calendar for Easy enquire stays (nights already taken) |
| `POST /api/enquiries` | Easy enquire form |
| `POST /api/bookings` | instant booking (payment is a stub until a gateway is chosen) |
| `GET /api/health` | quick check that the database is connected |
| `/api/auth/*`, `/api/me/trips` | sign in / sign up and My trips |
| `/api/admin/*` | back office at `/admin.html` (admin account, or the `ADMIN_TOKEN` secret for scripts) |

Prices are recalculated on the server; the browser's quote is only kept for comparison.

**Accounts** (`functions/api/auth/`, `lib/auth.js`, `account.js`): sign-in and sign-up live on the My trips page only.
Hikers get a 6-digit code by email (Resend, `RESEND_API_KEY`); codes last 10 minutes, 5 tries, 5 codes an hour.
The admin account (hello@trailscape.co.za) signs in with a password instead and is the only one that sees the
Back office link. To set or reset its password: `ADMIN_PASSWORD='…' node scripts/make-admin.mjs` and run the output in
the D1 console. My trips lists every enquiry and booking made with the signed-in email address (`/api/me/trips`).
For local testing, `DEV_EMAIL_LOG=1` in `.dev.vars` prints codes in the server log instead of emailing them.

**Secrets** (Cloudflare → Workers & Pages → trailscape → Settings → Variables and Secrets, for Production and Preview):
`RESEND_API_KEY` (required for sign-in codes and booking emails) and `ADMIN_TOKEN` (optional, for scripts).

**Database changes:** add a numbered file to `migrations/` and apply it with
`npx wrangler d1 migrations apply trailscape --remote`. `node scripts/make-seed.mjs` rebuilds `seed/stays.sql` from the
site's stay data; running it again refreshes names and estimates but keeps real rates entered in the back office.

**Local testing:** `node build-trails.mjs`, then `npx wrangler d1 migrations apply trailscape --local`,
`npx wrangler d1 execute trailscape --local --file seed/stays.sql`, put `ADMIN_TOKEN=...` in `.dev.vars`, and run
`npx wrangler pages dev public`.

## Map tiles

The map uses MapTiler. Its API key only works on allowed origins, so add every new domain
(including the `*.pages.dev` address) to the key in the MapTiler dashboard.
