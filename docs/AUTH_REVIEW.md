# Sign-in, company creation, invitations and riders: review and plan

Written after reading the code (front end, SQL, `invite-member` function, `supabase/config.toml`, browser tests). Findings marked
**verify** depend on how the production (self-hosted) Supabase stack is configured and could not be checked from the repository.

## 1. How it works today

| Path | Steps |
|---|---|
| **Admin: self-registration** | `/register` → `auth.signUp` with `company_name` in the user metadata → confirmation e-mail → link signs the user in → the app calls `bootstrap_profile()` → **the company is created at that moment**, with the name from the metadata, and the user becomes its admin. |
| **Rider or admin: invitation** | Admin → Team page → `invite-member` function (checks the caller is an admin) → row in `invitations` (7 days) + `auth.admin.inviteUserByEmail` → e-mail link → `/join` signs the invitee in → `bootstrap_profile()` matches the invitation **by e-mail** and creates the profile with the invited roles → the invitee then sets name, phone, password. |
| **Google (optional, env flag)** | OAuth → no profile → `/onboarding` asks for a company name → `bootstrap_profile()`. |
| **Sign-in** | `signInWithPassword` → `loadCurrentUser` → ready / needs a company / blocked (disabled or error). |

One user belongs to exactly one company (`profiles.id` is the auth user id, with one `tenant_id`). Roles are `admin` and `rider`.

## 2. Logic flaws

### High

| # | Flaw | Evidence |
|---|---|---|
| F1 | **Company creation is a hidden side effect of the first login and can dead-end.** The name travels in the sign-up metadata; the company is created only after the e-mail is confirmed. If the name is taken the person has finished sign-up and confirmation, lands on the login page with "Esiste già un'azienda…", and is stuck: the metadata cannot be changed, the e-mail cannot register again, and there is no screen to pick another name. Tested as intended behaviour in `e2e/register.spec.ts`, which ends on that error. | `RegisterPage`, `auth-provider.register`, `bootstrap_profile` (`company_exists`), `session.fetchCurrentUser` |
| F2 | **Open sign-up with no check on who signs up.** Anyone can create a company and become its admin: company names can be squatted (a real customer finds "their" name taken), tenants can be created in bulk, and the terms checkbox is UI-only (consent is not stored, and a direct API sign-up skips it). No captcha, approval or trial limits. | `config.toml` `enable_signup = true`; `RegisterPage` drops `accept` before calling `register` |
| F3 | **The invite function is an unlimited e-mail relay and a cross-company probe.** Any admin of any self-created company can send invitations to arbitrary addresses from your sender; Supabase's e-mail rate limit is per project, so abuse blocks confirmation and reset e-mails for everyone. The `already_registered` answer (409) also tells any admin whether an arbitrary address has an account in *any* company. | `invite-member/index.ts`: no quota; `inviteError` → `already_registered` |
| F4 | **An invitee becomes an active member before choosing a password.** `bootstrap_profile()` runs as soon as `/join` has a session, marks the invitation accepted and creates the profile with the invited roles (admin too). If the person closes the page, the account is active with no password they know, and nothing forces them through the join form (they can open `/` directly). **verify:** if the invitee had previously started a sign-up with the same address (unconfirmed), whether the invite keeps that earlier password. | `JoinPage.verify` → `loadCurrentUser(true)` → `bootstrap_profile` |

### Medium

| # | Flaw | Evidence |
|---|---|---|
| F5 | **Invite link lifetime differs from the invitation, and recovery depends on an admin.** The e-mail link lives as long as Supabase's OTP expiry (3600 s in `config.toml`; **verify** on the production stack, `GOTRUE_MAILER_OTP_EXP`) while the invitation row lasts 7 days. A stale link shows "Invito non valido o scaduto" and only an admin can send a new one. The function also deletes the invitation when the address already exists, even when that person has an account but no company (for example the F1 leftover), a case `bootstrap_profile()` would have resolved at their next sign-in. | `config.toml` `otp_expiry`; `invitations.expires_at`; `invite-member` error branch |
| F6 | **One person, one company.** A second invitation to the same person (freelance rider, consultant, accountant) is refused as "already registered" or silently ignored. Someone who signs in with a different address than the invited one lands on "register your company" and can create an empty company as its admin by mistake. | `profiles` schema; `OnboardingPage` |
| F7 | **A person who is admin and rider cannot work as a rider.** Navigation and home screen are `isAdmin ? office : rider`, so the rider screen is unreachable for dual roles, even though the database lets them be assigned jobs. | `AppLayout` (`isAdmin ? ADMIN_NAV : RIDER_NAV`), `App.tsx` `Home` |
| F8 | **No owner, no operator.** Any admin can demote, disable or invite admins (including the founder); the only guard is "at least one active admin". Nobody can suspend a company: `tenants.is_active` is checked only by the public booking functions, so a deactivated company still signs in and works. There is no operator role or screen to create, approve or suspend companies, or to erase a user. | `update_member`; `is_active` used only in `get_public_tenant` / `create_public_order` |
| F9 | **Disabling a person does not end their session.** Row-level security stops data access at once (the helpers ignore disabled profiles), but the Auth account, refresh token and JWT (1 h) stay valid; they can still sign in and reach the "disabled" screen. | `update_member` only sets `profiles.disabled` |
| F10 | **Account security basics.** Changing the password needs no current password (`secure_password_change = false`); no MFA for admins; `signOut()` uses the default scope (**verify:** global, i.e. every device); the password policy and "confirm e-mail" live in the Supabase dashboard (`config.toml` is local only), so production can drift from the form rules. | `config.toml`; `session.signOut`; `ProfilePage` |

### Low

- `profiles.email` is a copy made at first login and there is no e-mail-change flow, so it can drift from the Auth e-mail.
- Two admins inviting the same address at once can hit a 500 (delete-then-insert race in the function).
- Riders need an e-mail address and a strong password, which is heavy for drivers who only have a phone.
- Google sign-in funnels into the same company-creation path (F1, F2), and is controlled by a front-end env flag.

## 3. Decisions needed

> Answers received on 2026-11-20 and the resulting backlog are in [TODO.md](TODO.md): an operator panel is needed, riders can belong to several companies, roles for now are owner, admin and rider with a supervisor role later. The questions are kept below for reference.

1. **How are companies created?** (a) By you: a demo leads to you creating the company and inviting its first admin (safest; closes F1–F3). (b) Self-service, with a captcha, approval or trial limits and invite quotas.
2. **How do riders sign in?** E-mail and password as now, or a link or QR code from the admin plus passwordless sign-in (magic link or one-time code)?
3. **Can one person belong to several companies?** (Decides whether F6 needs a schema change.)
4. **Roles:** is "owner + admin + rider" enough, or is a limited office role needed?
5. **Who operates the platform?** A small operator screen, or SQL and a runbook for now.

## 4. Recommended target

- **Companies are created by an operator.** `create_company(name, first_admin_email)` creates the company and invites its first admin as owner; sign-up is turned off (invitations still work). The landing page's call to action stays "Book a demo". Self-service can come back later behind a flag with a captcha and a pending state.
- **Everyone joins by invitation**, by e-mail or by a copyable link or QR code. The join page sets name, phone and password, then calls an explicit `accept_invitation()`; nobody is active before that.
- **Roles:** `owner` (cannot be demoted or disabled except by transfer), `admin`, `rider`. A person with both admin and rider roles gets a switch between the office and the rider screen.
- **Lifecycle:** disabling a person also bans them in Auth; re-enabling lifts the ban; a company can be suspended and the suspension is enforced in `private.current_tenant_id()`.
- **Security:** MFA option for admins, current password required to change it, local-only sign-out, consent stored with a version and timestamp, an audit log of member changes.

## 5. Plan

| Phase | Content | Fixes | Size |
|---|---|---|---|
| **1. Remove the dead ends** | Account first, company second: `/register` creates only the account; after confirmation a "create your company" step shows name conflicts inline and offers "I was invited". `accept_invitation()` after the password is set. Keep the invitation when the person exists without a company. Admin and rider switch. Local-only sign-out. Browser tests for each path. | F1, F4, F5 (partly), F7 | M |
| **2. Close abuse and add ownership** | Sign-up off or gated; `create_company` RPC and an operator table; per-company invite quota and generic error for other companies' accounts; `owner` flag and transfer; `is_active` enforced; ban on disable; consent stored. | F2, F3, F8, F9 | M |
| **3. Rider experience** | Invite by link or QR (`generateLink`), self-service "send me a new link" on the join page, optional passwordless sign-in, long sessions, installable app. | F5, rider friction | M |
| **4. Hardening** | MFA for admins, current password to change it, audit log (`member_events`), a checklist of the production Auth settings (OTP expiry, password policy, confirmations, captcha, SMTP) kept in `docs/DEPLOYMENT.md`. | F10 | S–M |
| **5. Only if needed** | Memberships (a person in several companies) with a company switcher. | F6 | L |

Phases 1 and 2 change the database (new RPCs, a column, a table), the `invite-member` function and the Team and join screens. Every phase comes with pgTAP and browser tests; the existing sign-up and invitation specs (`e2e/register.spec.ts`, `e2e/team.spec.ts`) change with it.

## 6. To verify on the production (self-hosted) Supabase stack

- The e-mail OTP expiry that applies to invitation links.
- What `inviteUserByEmail` does for an address that has an unconfirmed account (does the earlier password survive?).
- The default scope of `signOut()` in the installed `supabase-js`.
- That "confirm e-mail", the password policy and the e-mail rate limits on the production stack (GoTrue environment variables) match `config.toml`.
- Which captcha providers the project plan supports.

## 7. Related: the two domains

The landing page now has no login and no environment variables. With the app on its own domain, Supabase's Auth's **Site URL** and
**Redirect URLs** should list only the app domain. `ALLOWED_ORIGINS` must list the app domain and the landing domain (the contact form).
