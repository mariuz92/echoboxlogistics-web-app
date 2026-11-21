# Deployment

Two things are deployed: the **Supabase project** (database, auth, functions) and the **web app**
(static files, usually in the Docker image).

## 1. Supabase project

For a dedicated Supabase Docker stack on your server, follow the [self-hosting plan](#5-self-hosted-supabase-on-a-shared-docker-server). The steps below are for a managed Supabase project.

1. Create a project at <https://supabase.com> (choose an EU region if your data must stay in the EU).
2. Link and push the schema:

   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push                      # applies supabase/migrations/*
   ```

   **Do not** run `supabase/seed.sql` against a real project: it creates demo users with a known password.

3. Deploy the Edge Functions and set their secrets:

   ```bash
   supabase functions deploy invite-member
   supabase functions deploy contact --no-verify-jwt
   supabase secrets set SITE_URL=https://platform.example.com \
                        ALLOWED_ORIGINS=https://platform.example.com,https://example.com,https://www.example.com
   ```

   `SITE_URL` is where invitation links point (`/join`); `ALLOWED_ORIGINS` is a comma separated CORS allow-list
   (include the marketing site's domain, which hosts the contact form).

   **Contact form e-mails.** Every message sent from the landing page is saved in `public.contact_messages`
   (dashboard → *Table editor*; tick `handled` once answered). To also receive it by e-mail, create a
   [Resend](https://resend.com) account and set:

   ```bash
   supabase secrets set CONTACT_TO_EMAIL=you@your-domain \
                        RESEND_API_KEY=re_xxx \
                        CONTACT_FROM_EMAIL="EchoBox Logistics <hello@your-domain>"
   ```

   Until your sending domain is verified in Resend, leave `CONTACT_FROM_EMAIL` unset: the default test sender
   (`onboarding@resend.dev`) can only deliver to the e-mail address of the Resend account itself, which is fine
   when that is the address in `CONTACT_TO_EMAIL`. Replies go straight to the visitor (`Reply-To`). If the e-mail
   fails, the message is still saved and the reason is stored in `email_error`.

4. Configure **Authentication** (dashboard → *Authentication*). `supabase/config.toml` only configures the
   local stack; mirror these on the hosted project:

   | Setting | Value |
   |---|---|
   | Site URL | `https://platform.example.com` |
   | Redirect URLs | `https://platform.example.com/**` |
   | Email → *Confirm email* | **ON** (required: onboarding relies on verified emails) |
   | Password policy | min length 8, lower + upper + digits (matches the web form) |
   | SMTP | **Configure your own SMTP provider.** The built-in sender is heavily rate-limited and meant for testing |
   | Email templates | Translate *Confirm signup*, *Invite user*, *Reset password* to Italian if desired |
   | Google provider | optional; also set `VITE_ENABLE_GOOGLE_AUTH=true` |

5. Copy the **Project URL** and the **anon / publishable key** (Settings → API) for the web app.
   Never use the service-role key in the web app.

### Backups and operations

Enable point-in-time recovery / daily backups on the project (Settings → Database → Backups). Schema
changes are always new migration files, reviewed and pushed with `supabase db push`.

## 2. Web app with Docker

```bash
docker build -t echoboxlogistics-web-app .

docker run -d --name echobox -p 8080:8080 \
  -e VITE_SUPABASE_URL=https://<project-ref>.supabase.co \
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
Supabase **Site URL** and **Redirect URLs** to the app domain and add the app and landing domains to `ALLOWED_ORIGINS`
(checklist in [TODO.md](TODO.md), section 8).

The only optional link between the two is the contact form: set `contactEndpoint` in
`src/features/landing/config.ts` (or `window.__ECHOBOX_LANDING__` in `landing/index.html`) to the public URL of the
`contact` function, and add the landing domain to the `ALLOWED_ORIGINS` secret. Without it the contact section shows
the support e-mail address instead of the form.

### Public booking link

Share `https://platform.example.com/book/<company-slug>` with guides (shown in *Impostazioni*). To keep an
old `/OrdineGuida` link alive, set `VITE_PUBLIC_BOOKING_SLUG=<company-slug>`.

## 3. Static hosting without Docker (Netlify, etc.)

`netlify.toml` already contains the SPA rewrite. Build with `npm run build` and publish `dist/`.
Because there is no container start step, provide the `VITE_*` variables **at build time** (they are
inlined by Vite), or edit `dist/env-config.js` as part of your pipeline.

## 4. Go-live checklist

- [ ] `supabase db push` ran; `supabase test db` passes locally against the same migrations
- [ ] Edge Functions deployed (`invite-member`, `contact`); `SITE_URL` and `ALLOWED_ORIGINS` secrets set
- [ ] Contact form: `CONTACT_TO_EMAIL` + `RESEND_API_KEY` set, test message received
- [ ] Auth: site URL, redirect URLs, **email confirmation ON**, custom SMTP, password policy
- [ ] Web app reachable over HTTPS; `VITE_SUPABASE_*` point at the production project
- [ ] First admin registered through `/register` (company is created on first confirmed sign-in)
- [ ] Public booking link opened once while signed out; a test order shows up in *Ordini*
- [ ] Invitation email received and the invite link lands on `/join`
- [ ] Backups enabled; someone owns the Supabase organisation
- [ ] Privacy / cookie pages reviewed for the new processors (see [migration notes](MIGRATION_FROM_FIREBASE.md#things-to-review-outside-the-code))

## 5. Self-hosted Supabase on a shared Docker server

Run a dedicated Supabase stack for EchoBox and deploy the web app with the Compose file in this repo. The landing site uses the existing Cloudflare Pages deployment with `npm run build:landing` and output `dist-landing`.

| Component | Proposed deployment |
|---|---|
| Supabase | Compose project `echobox-supabase` in `/opt/echobox/supabase`, with its own network, database, storage directory and credentials |
| Supabase API | `https://api.example.com` → `127.0.0.1:18000` → gateway port `8000` |
| Web app | Compose project `echobox-web` → `https://platform.example.com` via `127.0.0.1:18080` |
| Superadmin | Compose project `echobox-console` → `https://admin.example.com` via `127.0.0.1:18090` |
| Studio | Private access to the EchoBox gateway through an SSH tunnel or VPN |
| Postgres and Supavisor | Internal Docker ports only during normal operation |

The hostnames and loopback ports are examples. This layout assumes the TLS proxy runs on the host. For a proxy in Docker, attach the proxy and each EchoBox HTTP upstream to an appropriate shared network, use unique upstream aliases, and remove their host port mappings. EchoBox's database and other internal services stay on its project network. [Supabase proxy and HTTPS guide](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https)

### 1. Check the server and prepare the stack

```bash
docker compose version
docker compose ls
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
ss -ltn '( sport = :18000 or sport = :18080 or sport = :18090 )'
df -h
free -h
```

Record the current stack's project name, bindings, data locations and health. An `ss` header with no rows means it found no TCP listeners on the proposed ports. Check the Docker bindings too and confirm the host has room for a second stack. Use the official `self-hosted/v0.8.4` snapshot with Postgres 17 and Envoy. The commands below assume a Linux server, a user who can run Docker and write under `/opt/echobox`, and an EchoBox checkout that includes this repo's `deploy/` directory. Run the one-time setup from the EchoBox checkout. [Supabase Docker setup](https://supabase.com/docs/guides/self-hosting/docker)

```bash
export ECHOBOX_APP_DIR="$PWD"
export ECHOBOX_SUPABASE_DIR=/opt/echobox/supabase

(
  set -e
  mkdir -p /opt/echobox
  mkdir "$ECHOBOX_SUPABASE_DIR"
  git clone --depth 1 --filter=blob:none --sparse --branch self-hosted/v0.8.4 \
    https://github.com/supabase/supabase.git /opt/echobox/supabase-source
  git -C /opt/echobox/supabase-source sparse-checkout set docker
  cp -a /opt/echobox/supabase-source/docker/. "$ECHOBOX_SUPABASE_DIR/"

  umask 077
  cd "$ECHOBOX_SUPABASE_DIR"
  cp .env.example .env
  cp "$ECHOBOX_APP_DIR/deploy/supabase/.env.functions.example" .env.functions
  sh utils/generate-keys.sh --update-env
  sh utils/add-new-auth-keys.sh --update-env
)
```

Use a private terminal for the key scripts because they display credentials. Keep the generated `.env`, its backup copies, `volumes/db/data`, `volumes/storage` and named volumes with this installation. Set the following entries in the new stack's `.env` and replace the example domains. Set `ECHOBOX_API_PORT` only if you need a different free host port.

```dotenv
SUPABASE_PUBLIC_URL=https://api.example.com
API_EXTERNAL_URL=https://api.example.com/auth/v1
SITE_URL=https://platform.example.com
ADDITIONAL_REDIRECT_URLS=https://platform.example.com,https://platform.example.com/join,https://platform.example.com/update-password
STUDIO_DEFAULT_PROJECT=EchoBox
POOLER_TENANT_ID=echobox
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
DISABLE_SIGNUP=false
```

The pinned Supabase release uses the `/auth/v1` suffix in `API_EXTERNAL_URL`. `SUPABASE_PUBLIC_URL` and the clients' Supabase URL use the API origin. [Supabase Auth URL change](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1)

Replace the `SMTP_*` settings with your mail provider's settings before testing signup, invitations and resets. The current `/register` flow uses signup to create the first company after email confirmation. [Supabase Auth configuration](https://github.com/supabase/auth#configuration)

### 2. Start the separate Compose project

The [EchoBox Supabase Compose override](../deploy/supabase/compose.echobox.yml) removes the upstream global container names and pooler bindings and publishes the gateway on loopback. Realtime retains Envoy's expected hostname as an alias on the private network. Use Docker Compose 2.24.4 or later and recheck the merged config with each upstream upgrade. [Upstream Compose file](https://github.com/supabase/supabase/blob/self-hosted/v0.8.4/docker/docker-compose.yml), [Compose merge rules](https://docs.docker.com/reference/compose-file/merge/)

Configure `ALLOWED_ORIGINS` in `.env.functions` with the actual app, landing and operator console origins. If you enable the landing form, set a fresh `CONTACT_IP_SALT` and optionally add `CONTACT_TO_EMAIL`, `RESEND_API_KEY` and `CONTACT_FROM_EMAIL` for notifications.

```bash
cp -R "$ECHOBOX_APP_DIR/supabase/functions/"{invite-member,contact,platform-invite,_shared} \
  "$ECHOBOX_SUPABASE_DIR/volumes/functions/"

echobox_supabase() {
  docker compose --project-directory "$ECHOBOX_SUPABASE_DIR" \
    --env-file "$ECHOBOX_SUPABASE_DIR/.env" -p echobox-supabase \
    -f "$ECHOBOX_SUPABASE_DIR/docker-compose.yml" \
    -f "$ECHOBOX_APP_DIR/deploy/supabase/compose.echobox.yml" "$@"
}

echobox_supabase config --quiet
echobox_supabase up -d --wait
echobox_supabase ps
```

To reuse a locally cached `kong/kong:3.9.3` image, add `-f "$ECHOBOX_SUPABASE_DIR/docker-compose.kong.yml"` immediately after the base Compose file in `echobox_supabase()`. Use the Kong file from the same pinned Supabase download. The final EchoBox override gives the gateway a project-scoped container name and keeps its only published port on `127.0.0.1:18000` by default. [Pinned Kong override](https://github.com/supabase/supabase/blob/self-hosted/v0.8.4/docker/docker-compose.kong.yml)

Keep the upstream `main` dispatcher. The override lets `contact` receive signed-out requests. `invite-member` verifies the caller's user token with Auth and checks for an active admin in its own handler. [Pinned Edge Runtime dispatcher](https://github.com/supabase/supabase/blob/self-hosted/v0.8.4/docker/volumes/functions/main/index.ts)

### 3. Load and audit the EchoBox database

For a fresh database, apply the application migrations from the app checkout with Supabase CLI `2.117.0` (the version in CI). Use the explicit EchoBox database URL. A runner on `echobox-supabase_default` can reach `db:5432`. On a standard Linux Docker host, the command below finds the container's private bridge IP for a CLI running on the host. This example uses the generated alphanumeric Postgres password and the upstream internal port `5432`. Percent-encode a custom password if it contains URI delimiters. Compare the dry run with `supabase/migrations/` and leave `supabase/seed.sql` out of production.

```bash
cd "$ECHOBOX_APP_DIR"
ECHOBOX_DB_IP=$(docker inspect \
  --format '{{(index .NetworkSettings.Networks "echobox-supabase_default").IPAddress}}' \
  "$(echobox_supabase ps -q db)")
read -r -s -p 'EchoBox Postgres password: ' ECHOBOX_DB_PASSWORD
printf '\n'
ECHOBOX_DB_URL="postgresql://postgres:${ECHOBOX_DB_PASSWORD}@${ECHOBOX_DB_IP}:5432/postgres"
supabase db push --db-url "$ECHOBOX_DB_URL" --dry-run
supabase db push --db-url "$ECHOBOX_DB_URL"
unset ECHOBOX_DB_PASSWORD ECHOBOX_DB_URL
```

Run the read-only audit after the migrations or restore. Review the output against the [production record inventory](DATABASE.md#production-records-and-cutover-audit). The fresh database has zero app rows until you register and confirm the first admin through the web app.

```bash
echobox_supabase exec -T db psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  < "$ECHOBOX_APP_DIR/deploy/supabase/check-data.sql"
```

If EchoBox already has live data in managed Supabase, rehearse a restore to the new stack before applying pending migrations. Reconcile the restored migration history, verify Auth users and app data, and schedule a write freeze for the final transfer. Users sign in again because the new stack issues its own tokens. For Firestore, follow the [legacy field mapping and migration notes](MIGRATION_FROM_FIREBASE.md). [Restore a managed Supabase project](https://supabase.com/docs/guides/self-hosting/restore-from-platform)

### 4. Verify, cut over and back up

From the EchoBox checkout, set `VITE_SUPABASE_URL` in the app's `.env` to the public EchoBox API origin and `VITE_SUPABASE_ANON_KEY` to the generated `ANON_KEY` from the Supabase stack. The [web Compose override](../deploy/compose.web-server.yml) listens on `127.0.0.1:18080` by default. Set `WEB_PORT` in the app's `.env` if you want a different free port.

```bash
cd "$ECHOBOX_APP_DIR"
docker compose -p echobox-web -f docker-compose.yml -f deploy/compose.web-server.yml up -d --build --wait
```

- Configure TLS and WebSocket forwarding. Route `/auth/v1/`, `/rest/v1/`, `/realtime/v1/`, and the EchoBox function paths on the public API host. Keep Studio and management routes private. Configure the proxy to replace client-supplied `X-Forwarded-For` at the trusted edge so contact rate limits can use the real client IP.
- Check sign-up and email confirmation, sign-in, password reset, and an admin invitation to `/join`. Verify that a signed-out request to `invite-member` gets `401` and a signed-in non-admin gets `403`. Confirm bookings for two different company links stay in their respective companies and order changes arrive over Realtime. If using `contact`, set the landing's `contactEndpoint` to `https://api.example.com/functions/v1/contact`, then test submission, the saved message and optional email delivery from the landing origin.
- Recheck the existing instance against its baseline. Schedule off-host backups of EchoBox Postgres and any Storage files, keep a protected copy of the deployment configuration and secrets, and test a restore. Keep the previous app/backend routing available during cutover. If EchoBox has already accepted new writes, reconcile or export them before switching traffic back. Use the EchoBox project name for any stop or restart so commands target the new stack.

### 5. Deploy the Superadmin console

Apply the database migrations before publishing the console. The support queue and order journal require [`20261120010200_platform_support.sql`](../supabase/migrations/20261120010200_platform_support.sql). Deploy `platform-invite` alongside the other Edge Functions and route `/functions/v1/platform-invite` through the API proxy. Add the console origin to `ALLOWED_ORIGINS`. `SITE_URL` remains the customer web app origin for invitation links. The Supabase Compose override enables TOTP enrollment and verification.

Create a dedicated, email-confirmed Supabase Auth account for the first operator with a password. Copy its user UUID from Auth. On the EchoBox database, provision it from a privileged SQL session. This operation grants platform-wide access.

```sql
insert into private.platform_admins(user_id)
select id from auth.users
where id = '00000000-0000-0000-0000-000000000000'::uuid
  and email_confirmed_at is not null;
```

Replace the placeholder with the actual Auth UUID and verify the insert produced one row. Sign in to the console and enroll an authenticator before using operator controls. Use a second verified account for recovery and enroll its authenticator before relying on that account.

Reuse the customer app's Supabase URL and public key in the checkout's `.env`. The console has a separate browser session and image. Build it as follows.

```bash
docker compose --env-file .env -f deploy/compose.console-server.yml up -d --build --wait
```

Route `https://admin.example.com` to `127.0.0.1:18090` in the TLS reverse proxy. The console requires a platform operator and MFA at the database API. Keep developer accounts and production credentials separate.

In the console, verify first-owner onboarding and access on two test companies. Then turn on **Creazione aziende solo dalla console** to stop self-service company creation. Existing companies keep full access until you assign a subscription or suspend them. Test mail delivery and the invitation link before changing public signup settings. The [Flutter Supabase branch](https://github.com/mariuz92/echoboxlogistics_mobile/tree/03e673e790fbe385aaa1082b3e7ab02dadf5c19a) uses Firebase for push. Point the deployed Flutter build at the same EchoBox Supabase project and complete the [mobile compatibility checks](SUPERADMIN.md#flutter-and-the-shared-supabase-backend) before the shared rollout.
