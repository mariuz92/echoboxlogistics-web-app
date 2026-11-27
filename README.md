# EchoBox Logistics web app

Web app for companies that rent **radio guides** (audio-guide receivers) to tour
guides: take orders, assign riders to deliveries and pickups, keep track of radio
channels and see how the business is doing.

- **Admins** manage orders, riders, guides, radio channels, the calendar and the dashboard.
- **Riders** see their own deliveries and pickups and move them forward from their phone.
- **Guides** (customers) request a service through a public booking form, no account needed.

Everything is multi-tenant: each company only ever sees its own data, enforced by the database.

| | |
|---|---|
| Front end | React 19, TypeScript, Vite 8, Ant Design 6, Refine (headless), TanStack Query, Recharts 3 |
| Back end | [Supabase](https://supabase.com): Postgres 17 + Row Level Security, Auth, Realtime, Edge Functions |
| Delivery | Docker image (nginx, non-root) or any static host |
| Language | UI in Italian (default) and English |

## Quick start (local)

Prerequisites: Node.js 22+ (24 recommended), Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install

# 1. Start the local Supabase stack (Postgres, Auth, Realtime, Edge Functions, mail catcher).
#    Applies supabase/migrations and supabase/seed.sql automatically.
npm run db:start

# 2. Point the app at it
cp .env.example .env.local
npx supabase status -o env        # copy ANON_KEY into VITE_SUPABASE_ANON_KEY

# 3. Run the app
npm run dev                       # http://localhost:5173
```

> This repo uses its own port block (API **55321**, DB **55322**, Studio **55323**, mail **55324**)
> so it can run next to other local Supabase projects that use the default 543xx ports.

Local demo logins (created by `supabase/seed.sql`, **local only**):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@echobox.test` | `Password123!` |
| Rider | `rider1@echobox.test`, `rider2@echobox.test` | `Password123!` |

Public booking form for the demo company: <http://localhost:5173/book/echobox-demo>.
Emails sent by Supabase Auth (invitations, password reset) appear in the local mail
catcher at <http://127.0.0.1:55324>.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc`) and production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript for the app **and** the browser tests |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) against the local stack; see [Development](docs/DEVELOPMENT.md#browser-tests-playwright) |
| `npm run docker:build` / `docker:smoke` | Build the image / check it the way CI does |
| `npm run db:start` / `db:stop` | Start / stop the local Supabase stack |
| `npm run db:reset` | Recreate the local database from migrations + seed |
| `npm run db:types` | Regenerate `src/types/database.types.ts` from the local schema |
| `supabase test db` | Database tests (pgTAP): RLS, order state machine, onboarding |

## Configuration

Copy `.env.example`. In Docker the same variables are read **at container start**, so one image
works for every environment.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase anon / publishable key (safe to expose; RLS protects data) |
| `VITE_GOOGLE_MAPS_API_KEY` | no | Address autocomplete; without it the address fields are plain text |
| `VITE_PUBLIC_BOOKING_SLUG` | no | Company served by the legacy `/OrdineGuida` URL |
| `VITE_ENABLE_GOOGLE_AUTH` | no | Show "Continua con Google" (provider must be enabled in Supabase) |
| `VITE_MARKETING_URL` | no | Target of the "back to the site" link on the public booking page (hidden when empty) |

## Docker

```bash
docker build -t echoboxlogistics-web-app .
docker run --rm -p 8080:8080 \
  -e VITE_SUPABASE_URL=https://<your-api-url> \
  -e VITE_SUPABASE_ANON_KEY=<anon key> \
  echoboxlogistics-web-app
```

or `docker compose up --build` (reads `.env`). Details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project layout

```
src/
  features/        orders, dashboard, calendar, members (team), guides, settings, booking, auth, landing
  providers/       Refine auth + access control, current-user context, theme, notifications
  layout/          app shell (sidebar, header)
  lib/             supabase client, error mapping, date/timezone helpers
  types/           generated database types + domain rules (statuses, assignment, channels)
supabase/
  migrations/      schema, triggers, RLS, RPCs (the source of truth for the back end)
  functions/       Edge Functions (invite-member)
  tests/           pgTAP database tests
  seed.sql         local demo data
docker/            nginx config + runtime-config entrypoint
docs/              architecture, database, API, deployment, migration notes
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

| Job | Checks |
|---|---|
| **web** | type-check (app + tests), unit tests, production build, `npm audit` of runtime dependencies |
| **database** | starts local Supabase, runs the pgTAP tests, verifies `src/types/database.types.ts` matches the migrations |
| **e2e** | starts local Supabase and runs the 44 Playwright browser tests (admin, rider, public booking, invitations, registration) |
| **docker** | builds the image and smoke-tests it (health, runtime config, caching and security headers, non-root, read-only) |

Dependabot (`.github/dependabot.yml`) proposes weekly updates for npm, GitHub Actions and the Docker base images.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the pieces fit, order lifecycle, security model
- [Database](docs/DATABASE.md): schema, ER diagram, RLS, RPC reference
- [API](docs/API.md): RPCs and the Edge Function, with examples (useful for other clients such as a mobile app)
- [Deployment](docs/DEPLOYMENT.md): Supabase project, Docker, hosting
- [Subscriptions and billing](docs/BILLING.md): plans, limits, invoices, reminders, how the console and apps use them
- [Development](docs/DEVELOPMENT.md): day-to-day workflow, testing, conventions
- [Migration from Firebase](docs/MIGRATION_FROM_FIREBASE.md): what changed, field mapping, bugs fixed
- [Moving the Flutter app](docs/MOBILE_MIGRATION.md): guide for porting the mobile app from Firebase to Supabase
- [Sign-in review](docs/AUTH_REVIEW.md): flaws in the current sign-in, invitation and company flow, with a plan
- [TODO](docs/TODO.md): agreed backlog (superadmin panel, rider sign-in, several companies per rider, supervisor role)

## Renaming the repository

The project is now called **echoboxlogistics-web-app** (`package.json`, Docker image, docs). The
GitHub repository and the local folder are still named `paperDashboard` until renamed:

1. GitHub: *Settings → General → Repository name* → `echoboxlogistics-web-app`
   (GitHub redirects the old URL, so existing clones keep working).
2. Update the remote: `git remote set-url origin https://github.com/<owner>/echoboxlogistics-web-app.git`
3. Optionally rename the local folder.
