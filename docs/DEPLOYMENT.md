# Deployment

Two things are deployed: the **Supabase project** (database, auth, functions) and the **web app**
(static files, usually in the Docker image).

## 1. Supabase project

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

### Marketing site + app on two hostnames

The landing page and legal pages are served by the same bundle. Run two containers from the same image:

| Host | `VITE_APP_MODE` |
|---|---|
| `www.example.com` | `landing` |
| `platform.example.com` | `app` |

(or a single container with `VITE_APP_MODE=auto`, which serves the app only on hosts starting with `platform.`).

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
