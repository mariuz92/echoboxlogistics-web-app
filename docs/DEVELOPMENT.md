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
| Type-check | `npm run typecheck` |
| Production build | `npm run build` |
| Dependency audit (shipped code) | `npm run audit:prod` |

Before opening a PR: `npm run typecheck && npm test && npm run build && supabase test db`.

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

- **Unit tests** (`*.test.ts` next to the code): pure rules such as assignment legs, selectable channels,
  status actions, period boundaries around daylight-saving changes, percentage changes, error mapping.
- **Database tests** (`supabase/tests/*.test.sql`, pgTAP): tenant isolation, column privileges, the order
  state machine, channel uniqueness, onboarding (`bootstrap_profile`), member rules, public booking and throttling.
  Each file runs in a transaction that is rolled back.
- Edge Function: exercised with `curl` against the local stack (see [API.md](API.md#edge-function-invite-member)).

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
