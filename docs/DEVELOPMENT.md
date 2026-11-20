# Development

## Setup

```bash
npm install
npm run db:start                    # local Supabase (needs Docker); applies migrations + seed
cp .env.example .env.local          # fill VITE_SUPABASE_ANON_KEY from `npx supabase status -o env`
npm run dev                         # http://localhost:5173
```

Demo accounts and the public booking URL are listed in the [README](../README.md#quick-start-local).
Local emails (invitations, password reset, signup confirmation) land in the mail catcher at
<http://127.0.0.1:55324>. Supabase Studio is at <http://127.0.0.1:55323>.

## Everyday commands

| Task | Command |
|---|---|
| Start / stop the back end | `npm run db:start` / `npm run db:stop` |
| Reset DB to migrations + seed | `npm run db:reset` |
| New migration | `npx supabase migration new <name>` |
| Regenerate DB types | `npm run db:types` |
| Unit tests | `npm test` (or `npm run test:watch`) |
| Database tests | `supabase test db` |
| Browser tests | `npm run e2e` (`npm run e2e:ui` to watch / debug) |
| Docker image check | `npm run docker:build && npm run docker:smoke` |
| Type-check | `npm run typecheck` |
| Production build | `npm run build` |
| Dependency audit (shipped code) | `npm run audit:prod` |

Before opening a PR: `npm run typecheck && npm test && npm run build && supabase test db && npm run e2e`.
The same checks run in CI (`.github/workflows/ci.yml`).

## Where things live

| I want to … | Look at |
|---|---|
| change what a user may see or do | `supabase/migrations/*_rls.sql` (+ a pgTAP test) |
| change an order rule (statuses, assignment, channels) | `supabase/migrations/*_rpcs.sql`, mirror it in `src/types/domain.ts` / `orderActions.ts` |
| add a column | new migration → `npm run db:types` → update the feature's `api.ts` and form |
| change colours / typography | `src/config/theme.ts` |
| add a screen | `src/features/<name>/`, register the route in `src/App.tsx` (and the nav in `layout/AppLayout.tsx`) |
| add an Italian error message | `src/lib/errors.ts` |

## Conventions

- **Business rules go in the database**, and the UI mirrors them for good UX (hiding impossible actions).
  The UI is never the only line of defence.
- Server state with TanStack Query; per-feature `api.ts` (typed supabase-js calls) + `hooks.ts`.
  Components do not call `supabase.from(...)` directly.
- Use `App.useApp()` for `message` / `modal` / `notification` (not the static antd functions).
- Dates: store `timestamptz`; display with `fmtDateTime(value, tenant.timezone)`; convert picker values with
  `wallClockToIso` / `isoToWallClock`.
- Language: UI text in Italian; code, comments and docs in English.
- Don't use `localStorage` for application data. The only things stored there are the Supabase session
  (by supabase-js) and the theme preference.

## Testing

- **Unit tests** (`*.test.ts` next to the code): pure rules such as assignment legs, channel windows and conflicts,
  status actions, period boundaries around daylight-saving changes, percentage changes, error mapping.
- **Database tests** (`supabase/tests/*.test.sql`, pgTAP): tenant isolation, column privileges, the order
  state machine, channel conflicts on time windows, onboarding (`bootstrap_profile`), member rules, public booking and throttling.
  Each file runs in a transaction that is rolled back.
- Edge Function: exercised end to end by the browser tests (invitation emails) and with `curl` (see [API.md](API.md#edge-function-invite-member)).
- **Browser tests** (`e2e/*.spec.ts`, Playwright): see below.

### Browser tests (Playwright)

They drive a real browser against the real stack (Vite dev server + local Supabase), so they cover the parts unit
tests cannot: Auth, RLS in practice, Realtime, the Edge Function and the emails.

```bash
npm run db:start          # once; applies migrations + seed
npm run e2e               # runs everything (about 3 minutes); starts the dev server itself
npx playwright test e2e/orders.spec.ts            # one file
npm run e2e:ui            # step through tests, time-travel debugging
npm run e2e:report        # open the last HTML report
```

| Spec | Covers |
|---|---|
| `auth` | login errors, redirects, rider vs admin access, legacy URLs, 404 |
| `orders` | create / validate / edit / assign / cancel / delete, radio-channel conflicts (free / occupied), filters, periods, PDF, channel settings |
| `rider` | one order from creation to pickup across **two browsers** (admin + rider on a phone-sized screen), live updates, isolation between riders |
| `booking` | the anonymous form: validation, success, time zone, honeypot, switching bookings off |
| `team` | invitation by email → join → password change → deactivation; revoke; duplicate email; last-admin protection |
| `register` | signup, email confirmation, isolated empty workspace, duplicate company name |
| `pages` | guides CRUD, address-book prefill, calendar + CSV, dashboard, settings, profile, dark mode, phone navigation |

Conventions:

- Import `test` and `expect` from `./helpers`, **not** from `@playwright/test`. Our `test` adds a gate: any
  browser console error or uncaught exception fails the test (this has already caught deprecated antd props, a duplicate
  DOM id, a render loop and a race in first-login). `newUserContext()` gives a second browser covered by the same gate.
- Test data is always named `E2E …` / `e2e-…@example.test`; `cleanupE2eData` (in `afterAll`) removes the orders and
  contacts, and — using the local service-role key from `supabase status` — the users and companies they created.
  A long-lived local database therefore stays clean; `npm run db:reset` always gives a pristine one.
- Tests are independent and run serially (one worker): they share a database and the demo logins from the seed.
- Emails are read from the local mail catcher (`waitForMail` / `authLink` in `helpers.ts`).
- Prefer roles, labels and the stable form-field ids (`#guide_name`, `#delivery_at`, …) over CSS classes.
- On failure Playwright keeps a screenshot and a trace in `test-results/`.

`e2e/` has its own `tsconfig.json`; `npm run typecheck` checks it too.

## Landing page

The marketing site (`src/features/landing/`, entry in `landing/`) is a separate static build: `npm run dev:landing`
(port 5174) and `npm run build:landing` (output `dist-landing/`). It has no login and reads no environment variables, so
it builds and runs with nothing configured. Its texts live in `src/features/landing/i18n.ts` in Italian, English, German and French; Italian is the
reference and TypeScript makes the other languages keep the same shape. The language comes from `?lang=`, then the
visitor's last choice, then the browser.

The contact form posts to the `contact` Edge Function, which stores messages in `public.contact_messages` and e-mails
them (see [DEPLOYMENT.md](DEPLOYMENT.md)).

### Product screenshots

`public/images/screens/` holds screenshots of the real app with invented demo data (a Rome tour company, its riders,
guides and ~3 months of orders). To regenerate them after a UI change:

```bash
node scripts/screenshots/capture.mjs            # all of them
node scripts/screenshots/capture.mjs dashboard  # only names containing "dashboard"
```

The script starts Vite and answers the app's Supabase calls from `scripts/screenshots/demo-data.mjs` inside the
browser, so no database is needed and no real data can end up in a picture. The clock is frozen at 10:25 Rome time
of the current day (`DEMO_NOW=2026-05-14T08:25:00Z` to pick another moment). WebP copies need ImageMagick (`convert`).

## Dependency audit

`npm run audit:prod` (runtime dependencies) reports **0 vulnerabilities**. A plain `npm audit` currently also
reports a ReDoS advisory in `picomatch` (a glob library used by Vite and Vitest during development and builds).
It affects every published version (`<=4.0.7`, the latest), so there is nothing to upgrade to yet, and it is not part
of the shipped bundle. `npm audit fix --force` would *downgrade* Vite and should not be used; re-check when a
patched `picomatch` is released.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `port is already allocated` on `db:start` | Another Supabase project uses the same ports. This repo uses 553xx (see `supabase/config.toml`); change them if those are taken too |
| "Configurazione mancante" screen | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` not set (restart `npm run dev` after editing `.env.local`) |
| Logged out after `npm run db:reset` | Expected: the reset wipes auth sessions |
| Login works but the app says the account is not linked to a company | The user signed up without `company_name` and has no invitation: register a company or invite them |
| `curl http://localhost:8080` hangs on Windows | curl resolves `localhost` to IPv6 first; use `127.0.0.1` |
| Invitation link opens `/login` instead of `/join` | The redirect URL is not in Supabase *Auth → URL Configuration* |
