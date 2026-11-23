# Deployment

Two things are deployed: the **Supabase stack** (database, auth, functions), which is **self-hosted** on your own
server, and the **web app** (static files, in the Docker image). The marketing site is a third, separate static
deployment (see "Marketing site and app are two separate deployments" below).

## 1. Supabase (self-hosted)

Follow the official [self-hosting with Docker guide](https://supabase.com/docs/guides/self-hosting/docker) for the
version you run; names of settings below are the ones used by its `docker/.env` and `docker-compose.yml` at the time
of writing, so check them against your copy. Put the stack behind a TLS reverse proxy on its own hostname
(for example `api.example.com`); everything below uses that as the **API URL**.

1. **Secrets first.** Replace every default in `docker/.env`: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`,
   `SERVICE_ROLE_KEY` (generate the two keys from the new `JWT_SECRET`), the dashboard login, and the other
   secrets the guide lists. Never use the service-role key in the web app. Do not expose the Postgres port or the
   Studio dashboard to the internet (put Studio behind a VPN or an authenticated proxy).
2. **Apply the schema** from a machine that can reach the database:

   ```bash
   supabase db push --db-url "postgresql://postgres:<password>@<db-host>:5432/postgres"   # applies supabase/migrations/*
   ```

   **Do not** run `supabase/seed.sql` against a real database: it creates demo users with a known password.
3. **Edge Functions.** On self-hosted they are plain folders served by the `functions` (Edge Runtime) container:
   copy `supabase/functions/invite-member`, `supabase/functions/contact` and `supabase/functions/_shared` into
   the stack's `volumes/functions/` directory and restart the container. Two things differ from the hosted product:

   - The stock `volumes/functions/main/index.ts` router checks a JWT on **every** function. `contact` is public by
     design (visitors of the marketing site are not signed in), so make the router skip that check for `contact` only
     (the hosted equivalent is `--no-verify-jwt`). `invite-member` keeps the check.
   - Secrets are environment variables of the `functions` service in `docker-compose.yml` (add them under
     `environment:`, they are not read from `supabase secrets set`).

   | Variable | Value |
   |---|---|
   | `SITE_URL` | `https://platform.example.com` (where invitation links point, `/join`) |
   | `ALLOWED_ORIGINS` | `https://platform.example.com,https://example.com,https://www.example.com` (CORS allow-list: the app and the marketing site that hosts the contact form) |
   | `CONTACT_TO_EMAIL`, `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` | optional, see below |

   The `contact` function is then public at `https://api.example.com/functions/v1/contact`: that is the value of
   `contactEndpoint` in `src/features/landing/config.ts`.

   **Contact form e-mails.** Every message sent from the landing page is saved in `public.contact_messages`
   (Studio → *Table editor*; tick `handled` once answered). To also receive it by e-mail, create a
   [Resend](https://resend.com) account and set `CONTACT_TO_EMAIL=you@your-domain`, `RESEND_API_KEY=re_xxx` and
   `CONTACT_FROM_EMAIL="EchoBox Logistics <hello@your-domain>"` on the `functions` service.
   Until your sending domain is verified in Resend, leave `CONTACT_FROM_EMAIL` unset: the default test sender
   (`onboarding@resend.dev`) can only deliver to the e-mail address of the Resend account itself, which is fine
   when that is the address in `CONTACT_TO_EMAIL`. Replies go straight to the visitor (`Reply-To`). If the e-mail
   fails, the message is still saved and the reason is stored in `email_error`.

4. **Authentication.** `supabase/config.toml` only configures the local development stack. On self-hosted, Auth
   (GoTrue) is configured by environment variables of the `auth` service in `docker/.env` and `docker-compose.yml`:

   | Setting | Self-hosted variable | Value |
   |---|---|---|
   | Site URL | `SITE_URL` (`.env`) | `https://platform.example.com` |
   | Redirect URLs | `ADDITIONAL_REDIRECT_URLS` | `https://platform.example.com/**` |
   | Public API URL | `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` | `https://api.example.com` |
   | Confirm e-mail | `ENABLE_EMAIL_AUTOCONFIRM` | **`false`** (onboarding relies on verified e-mails) |
   | Sign-up | `DISABLE_SIGNUP` | `false` for now; `true` once companies are created only by the operator (invitations keep working), see [TODO.md](TODO.md) |
   | Password policy | `GOTRUE_PASSWORD_MIN_LENGTH`, `GOTRUE_PASSWORD_REQUIRED_CHARACTERS` | min 8; lower + upper + digits (matches the web form). Add them to the `auth` service if the compose file does not pass them |
   | E-mail link lifetime | `GOTRUE_MAILER_OTP_EXP` | seconds; `config.toml` uses 3600 |
   | Access token lifetime | `JWT_EXPIRY` | 3600 |
   | SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` | **required**: self-hosted has no built-in mail sender, so no confirmation, invitation or reset e-mail leaves without it. Use a provider with SPF, DKIM and DMARC set on your domain |
   | E-mail templates | `GOTRUE_MAILER_TEMPLATES_*` or the templates mounted in the `auth` service | translate *Confirm signup*, *Invite user*, *Reset password* to Italian if desired; the template must carry the link (and the 6-digit code once the rider sign-in in TODO.md exists) |
   | Google provider | `GOTRUE_EXTERNAL_GOOGLE_*` | optional; also set `VITE_ENABLE_GOOGLE_AUTH=true` |

5. **Keys for the web app:** the **API URL** and the **anon key** from your `docker/.env`.

### Backups and operations

A self-hosted stack has **no managed backups**: nobody keeps your data unless you set this up. This also decides what
the public `/delete-account` page may promise (deleted data leaves the backups within 30 days).

- **Database:** a scheduled dump, copied **off the server**, **encrypted**, and pruned after **30 days**. Example (adapt
  names, run daily from cron or a systemd timer, and keep the key to decrypt somewhere other than the server):

  ```bash
  docker exec supabase-db pg_dump -U postgres -Fc postgres \
    | age -r <public-key> > /backups/echobox-$(date +%F).dump.age
  rclone copy /backups remote:echobox-backups          # any off-site storage
  find /backups -name '*.dump.age' -mtime +30 -delete   # also prune the remote copy to the same age
  ```

  For a smaller data-loss window add WAL archiving (for example pgBackRest or WAL-G), also kept at most 30 days.
- **Test a restore** into an empty database at least once and before every major upgrade.
- **After any restore, re-apply account deletions** made since that backup (the log of requests handled).
- **Uploaded files** (Storage volume) are not in the dump; back up the volume if you ever use Storage.
- **Updates:** you own Postgres and Supabase image updates and security patches. Pin image versions in compose, read the
  release notes before upgrading, and take a backup first.
- **Monitoring:** disk space, the e-mail provider's bounces, container health, and certificate expiry.
- Schema changes are always new migration files, reviewed and applied with `supabase db push --db-url …`.

If you ever move to the managed product at supabase.com, the same settings live in its dashboard (Authentication,
Edge Function secrets, Backups) and `supabase functions deploy` / `supabase secrets set` replace the manual steps.

## 2. Web app with Docker

```bash
docker build -t echoboxlogistics-web-app .

docker run -d --name echobox -p 8080:8080 \
  -e VITE_SUPABASE_URL=https://api.example.com \
  -e VITE_SUPABASE_ANON_KEY=<anon key> \
  -e VITE_GOOGLE_MAPS_API_KEY=<optional> \
  echoboxlogistics-web-app
```

Or with compose (`.env` next to `docker-compose.yml`):

```bash
cp .env.example .env      # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
docker compose up -d --build
```

About the image:

- Multi-stage: `node` builds (type-check + Vite), `nginx-unprivileged` serves. ~90 MB.
- Runs as a **non-root** user on port **8080**; compose also sets a read-only root filesystem,
  `cap_drop: ALL` and `no-new-privileges`.
- **No configuration is baked in.** On start, `docker/40-env-config.sh` writes the whitelisted
  `VITE_*` variables to `/env-config.js`, so one image serves staging and production.
- `/healthz` returns `200 ok` (used by the built-in `HEALTHCHECK`).
- `index.html` is never cached; `/assets/*` is cached for a year (file names are content-hashed).
- Unknown paths fall back to `index.html` (client-side routing).

Put a TLS-terminating reverse proxy / load balancer (Caddy, Traefik, nginx, a cloud LB) in front; the
container speaks plain HTTP.

### Marketing site and app are two separate deployments

The landing page (and its legal pages) is a static site with **no login and no environment variables**; the app,
with its login, lives on another domain. They are built separately from the same repository:

| Site | Build command | Output | Needs env vars |
|---|---|---|---|
| App (e.g. `platform.example.com`) | `npm run build` | `dist/` | yes (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) |
| Landing (e.g. `www.example.com`) | `npm run build:landing` | `dist-landing/` | **no** |

**Landing:** keep the existing Cloudflare Pages project (`echobox-logistics`) and set its build command to
`npm run build:landing` and its output directory to `dist-landing`. Unknown paths must fall back to `index.html` (the
default on Cloudflare Pages) so `/privacy`, `/terms` and `/cookies` work.

**App:** it is not deployed on Cloudflare. It will run on your own server from the Docker image (see above) behind a
TLS reverse proxy, and the app's hostname is pointed at that server with a DNS record. When it moves, also update the
Auth `SITE_URL` and `ADDITIONAL_REDIRECT_URLS` to the app domain and add the app and landing domains to `ALLOWED_ORIGINS`
(checklist in [TODO.md](TODO.md), section 7).

The only optional link between the two is the contact form: set `contactEndpoint` in
`src/features/landing/config.ts` (or `window.__ECHOBOX_LANDING__` in `landing/index.html`) to the public URL of the
`contact` function (`https://api.example.com/functions/v1/contact`), and add the landing domain to `ALLOWED_ORIGINS`. Without it the contact section shows
the support e-mail address instead of the form.

### Public booking link

Share `https://platform.example.com/book/<company-slug>` with guides (shown in *Impostazioni*). To keep an
old `/OrdineGuida` link alive, set `VITE_PUBLIC_BOOKING_SLUG=<company-slug>`.

## 3. Static hosting without Docker (Netlify, etc.)

`netlify.toml` already contains the SPA rewrite. Build with `npm run build` and publish `dist/`.
Because there is no container start step, provide the `VITE_*` variables **at build time** (they are
inlined by Vite), or edit `dist/env-config.js` as part of your pipeline.

## 4. Go-live checklist

- [ ] Every default secret in `docker/.env` replaced; Postgres and Studio not reachable from the internet
- [ ] `supabase db push --db-url …` ran; `supabase test db` passes locally against the same migrations
- [ ] Edge Functions copied to `volumes/functions` (`invite-member`, `contact`, `_shared`); `contact` skips the JWT check, `invite-member` does not; `SITE_URL` and `ALLOWED_ORIGINS` set on the `functions` service
- [ ] Contact form: `contactEndpoint` set, `CONTACT_TO_EMAIL` + `RESEND_API_KEY` set, test message received
- [ ] Auth: `SITE_URL`, redirect URLs, **e-mail confirmation ON**, working SMTP (SPF, DKIM, DMARC), password policy
- [ ] Web app reachable over HTTPS; `VITE_SUPABASE_*` point at your API URL and anon key
- [ ] First admin registered through `/register` (company is created on first confirmed sign-in)
- [ ] Public booking link opened once while signed out; a test order shows up in *Ordini*
- [ ] Invitation e-mail received and the invite link lands on `/join`
- [ ] **Backups running, copied off the server, encrypted, pruned at 30 days, and a restore tested**
- [ ] Someone owns updates and monitoring of the server
- [ ] Privacy / cookie pages reviewed for the new processors (see [migration notes](MIGRATION_FROM_FIREBASE.md#things-to-review-outside-the-code))
- [ ] Play Console: the delete-account page URL is live and the support address on it works
