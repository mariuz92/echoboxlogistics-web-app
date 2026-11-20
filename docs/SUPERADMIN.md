# EchoBox Superadmin requirements

The EchoBox owner needs a private console to onboard companies, manage access and subscriptions, change platform settings, and resolve problems across web and mobile. The home screen should answer three questions. Which customers need attention, which workflows are failing, and what can the operator do about them?

Target a separate web build at `admin.<your-domain>`. Reuse the web app's components and production Supabase instance. Everyday dispatch stays with company admins and riders. The operator gets searchable history, health summaries, and specific recovery actions for the cases where support needs to intervene.

## Current app and gaps

| Area | What exists | What the operator needs |
|---|---|---|
| Companies and people | Web registration creates a company on verified sign-in. Company admins invite admins and riders. Each profile belongs to one company. `is_active` controls public booking. | Operator-created companies, protected company owners, invitations and recovery, multiple company memberships, and access controls that apply throughout the app. |
| Web operations | Tenant admins manage orders, calendars, assignments, guides, radio channels, booking links and settings. Order changes have a timeline. | Cross-company health summaries and scoped support views for missing assignments, overdue pickups, channel conflicts, and booking or data problems. |
| Mobile operations | Flutter uses Firebase Auth, Firestore order and rider data, FCM and Cloud Tasks for reminders. It ships an inbox and device-specific push registration. | A clear view of what backend each supported build uses, release and crash reports, notification diagnostics, and one shared company and order model after migration. |
| Billing | Orders have a rental `balance` and an `invoice_required` flag. Neither app has a company subscription model. | Company plans, renewals, trials, payment status, and server-enforced access for both apps. |
| Problems and support | Web render errors go to the browser console. `contact_messages` stores landing enquiries and optional mail failures. The Flutter and notification code log errors locally or to Firebase. | A central issue inbox, customer reports, alerts, a notification timeline, and an audit trail for operator actions. |

[Web routes](../src/App.tsx) · [Auth review](AUTH_REVIEW.md) · [Database model](DATABASE.md) · [Web error boundary](../src/shared/components/ErrorBoundary.tsx) · [Flutter source reviewed](https://github.com/mariuz92/echoboxlogistics_mobile/tree/9415959812ff6c46164b1fe5c91409a9beb87cfa)

## Console sections and actions

| Section | Required operator actions |
|---|---|
| Overview | See companies awaiting first sign-in, trials ending, overdue accounts, failed invites, delivery and pickup exceptions, major incidents, and last successful backup. Open each count as a filtered queue. Filter by environment, date, company and source. |
| Companies | Search by company name, slug or billing contact. Create a company, assign a plan, invite the first owner, check onboarding, rename with existing booking links in mind, suspend, reactivate, archive, and review export or deletion requests. See recent activity, active jobs, usage, effective settings and access history together. |
| People and access | Create or invite company admins, transfer company ownership, grant or revoke company memberships, inspect sign-in and invite status, and resend or revoke an invite. Recover accounts without a company and companies without an active owner. Show both memberships for a rider who works across two companies. |
| Subscriptions | Assign or change a plan, start or extend a trial, grant a time-limited exception, record an offline payment, schedule cancellation or reactivation, and inspect payment and access history. Show which features and limits the company has right now and when they change. |
| Operations | Inspect order history, open and overdue pickups, lost devices, missing or disabled riders, channel conflicts, booking status and repeated booking failures. Filter detail by company. Expose specific recovery actions through the same order and scheduling rules used by the customer apps. |
| Issues and support | Triage crashes, failing workflows and customer reports. Assign responsibility, record severity and notes, link the relevant company, release or order, and mark resolution. Include landing enquiries from `contact_messages` with mail status. Show a short support reference in web and mobile error states. |
| Notifications | Look up an assignment, reminder, invitation, reset or contact email by company, event and time. Show scheduling, provider acceptance, known delivery or device acknowledgement, retries, permanent failures and the next action. Retry eligible failures, with stale jobs and duplicate sends blocked. |
| Configuration and releases | Set validated platform defaults, feature switches, quotas, maintenance messages, staged rollouts and minimum supported mobile versions. Inspect effective settings per company. See web and mobile build versions and whether a company has moved to Supabase. |
| Platform access and audit | Invite or remove console operators, grant narrow roles, recover access, and review changes across companies. Search by operator, company, target, action, result, date or support reference. Protect the last platform owner. |

### Company onboarding and recovery

1. Create the company, choose its time zone and initial plan, then invite its first company owner. Show separate states for company creation, invite delivery and join completion. Retrying a failed send should reuse the same company and avoid duplicate invitations.
2. Give existing companies a reviewed owner and plan before enabling enforcement. Replace self-service company creation in both the UI and the database. Existing people can receive a pending membership and accept it under the same verified email. Keep the invitation available when account creation or email delivery fails.
3. Let an authorized operator suspend one company's access and restore it with a reason. Check the effective state in data reads and writes, RPCs, public booking, Realtime subscriptions and notification workers. Membership removal affects that company. A platform-wide account block is a separate action for security or abuse and should revoke renewal of the user's sessions as well as deny access at the backend.
4. Route stuck orders and rider removals through audited recovery actions. Show open assigned work before disabling a rider. For support inspection, use time-limited read-only access with a case reference. Keep original assignments and the existing audit history when correcting a record.

[Existing account and rider decisions](TODO.md#decisions-taken) · [Booking and order API](API.md)

## Subscription and access policy

Attach a subscription to a company. Calculate access on the server using the selected company's access state, the member's role, the effective plan and any approved exceptions. The console should show the plan version, billing period, renewal or end date, billing contact, payment source, trial and grace deadlines, and scheduled changes. Show usage and any enforced limits, such as admin or rider seats, monthly orders, and paid features you choose to offer. Set the counting rules before enabling a limit, including how pending invitations and public bookings count. Give company owners a view of their own plan, limits, renewal and any action due.

| State | Proposed behaviour |
|---|---|
| Trial or active | Apply the plan and limits. Show the owner upcoming trial and renewal dates. |
| Past due with grace | Show a warning and payment instructions. Keep operations running until the grace deadline. |
| Expired or cancelled | Disable new bookings and new work. Keep authorized history and export access. Allow a defined closeout window for deliveries and pickups already underway so radios can still be returned. |
| Suspended for security or abuse | Block access and outbound jobs at once. Show the operator which active jobs need manual follow-up. |
| Archived | Close day-to-day access and preserve records for an authorized export or scheduled deletion according to the configured retention policy. |

Start with manual subscription control for the first customers. Record who set the state, the effective date and the reason. Choose pricing, payment provider, grace periods and the closeout duration before automating collection. When a provider is added, record external customer, subscription and invoice references. Verify incoming events, apply each provider event once, reconcile out-of-order events against the provider, and surface mismatches for review. Record any manual overrides separately so a webhook cannot silently erase an operator's decision. Keep SaaS invoices and payment state separate from the rental balances already recorded on orders.

## Error reports and operational monitoring

The issue inbox should group repeats by error fingerprint and show first and last occurrence, affected companies or builds, frequency, owner and resolution. Use or propagate a request or event identifier so a support report can be traced from the client to the API, database action or worker. Capture expected validation outcomes such as `channel_busy` as counts for operations and trend detection. Page an operator for incidents such as failed sign-ins across companies, missed pickup reminders, or an unavailable API.

| Signal | What to collect and check |
|---|---|
| Web and Flutter | Unhandled exceptions, failed API requests, login or join failures, and Realtime disconnects. Include platform, build, environment, route or operation, sanitized error code and optional company context. Upload release symbols or source maps where needed to make stack traces readable. |
| Orders and booking | Failures creating and updating orders, failed rider transitions, overdue or unassigned work, repeated channel conflicts, disabled booking links, and rejection rates. Link into the existing order timeline after access checks. |
| Email, push and jobs | Track scheduled, queued, attempted, accepted, skipped, failed and acknowledged states where available. Track queue age, retry count, next attempt, invalid devices and canceled or rescheduled reminders. FCM acceptance and device delivery are different events. [FCM delivery reporting](https://firebase.google.com/docs/cloud-messaging/understand-delivery) |
| Infrastructure | Check public web and API uptime from outside Docker, Auth, REST and Realtime health, essential Edge Functions, database connectivity, disk space, backup age and tested restore status. Send critical alerts outside the EchoBox stack so an outage cannot silence its own alert. |
| Customer reports | Add a report option for web and mobile with a short description and optional diagnostics. Let users review any diagnostics they include, remove sensitive data, and let staff link the report to a grouped issue. |

Keep the operator audit trail separate from error reports and order events. An audit entry records who did what, to which record, at what time, why, and with what result. Record limited before and after values when needed and protect entries from edits through the console. Remove credentials, sessions, invite codes, FCM tokens, request bodies and unnecessary personal data from diagnostics. Limit access to raw logs and set retention and deletion policies for reports and attachments.

Supabase's standard self-hosted stack leaves Logs and Analytics optional. Choose a collector for this Docker project if you need raw log aggregation, and limit collection to EchoBox because other stacks run on the same server. Keep ticket history and operator actions queryable in the console even when raw logs expire. [Self-hosted Supabase logging](https://supabase.com/docs/reference/self-hosting-analytics/introduction)

## Configuration and permissions

- **Company settings.** Keep local controls for name, time zone, public booking and radio-channel settings. Let the operator inspect and correct them through validated actions. Preview affected bookings or channel assignments before a change that affects open work. A company switch can turn off its own booking page, while a platform safety switch can pause it across companies.
- **Platform settings.** Use typed settings for access policy, invite and booking limits, supported releases, notifications, and feature rollouts. Show the default, any company override, the effective value, and when it last changed. Validate changes, keep version history and support reverting a release or rollout. Expose only client-safe fields to web and mobile. Store infrastructure URLs and SMTP, FCM, database and payment credentials in deployment configuration or a server-side secrets store. The console can show health and configuration status without exposing values.
- **Operator permissions.** Start with a single platform owner role and a recovery procedure. Add support, billing and operations roles when others need access. Support can inspect scoped errors and help with account recovery. Billing sees company subscription and invoice data. Operations can manage approved flags and the incident queue. Ordinary company admins and riders have no console access.
- **Enforcement.** A console request must pass server-side permission checks, active operator status and verified MFA. Supabase exposes second-factor assurance as `aal2`. Keep privileged credentials on the server and expose narrowly scoped commands with validated company and resource IDs. Require a reason and a review of affected records before access blocks, exports, owner transfers and destructive actions. Record an audit event with each successful privileged change. [Supabase Auth MFA](https://supabase.com/docs/guides/auth/auth-mfa)

### Data model

Build on the existing tenants, orders, order events and inbox. Add records for platform operators, company memberships and owner transfers, plan versions, company subscriptions and access overrides, configuration history, grouped issues and support cases, and the platform audit trail. Store usage counters only where required for limits or reporting. For push, add device registrations, an outbox and a delivery-attempt history with a unique event key so retries can be reconciled. If payments are automated, store a durable record of processed provider events and reconciliation failures. Keep environment and source identifiers on operational records so Firebase incidents during migration remain distinguishable from Supabase incidents.

## Moving Flutter to shared control

The console can show Firebase health and migration progress while older mobile builds remain in use. Label which system each result came from. Supabase subscriptions and suspensions cover Flutter once mobile uses the same backend and the legacy write path has been retired or restricted. For a company pilot, migrate tenant, member, rider and order IDs together, verify order ownership, and move writes to Supabase for that company before enabling enforcement. Keep FCM for push. Register devices under the new identities and have workers check the current company membership, order schedule and access state before sending. [Flutter migration guide](MOBILE_MIGRATION.md) · [Data import and reconciliation](MIGRATION_FROM_FIREBASE.md)

Verify notifications on a deployed build before relying on them during the migration. The inbox reads the default Firestore database, while the order-triggered reminder functions use the named `echobox` database. The functions also send to the single primary `fcmToken`, although Flutter maintains a map of device tokens, and the assignment trigger only sends when a rider field first becomes set. Test initial assignment, reassignment, rescheduling and push to a rider with two devices. Check the inbox entry, provider result, device receipt and whether tapping opens the correct job. [Flutter inbox](https://github.com/mariuz92/echoboxlogistics_mobile/blob/9415959812ff6c46164b1fe5c91409a9beb87cfa/lib/layers/presentation/pages/notification_page/notification_hub.dart#L65) · [Device registration](https://github.com/mariuz92/echoboxlogistics_mobile/blob/9415959812ff6c46164b1fe5c91409a9beb87cfa/lib/layers/data/firebase_messaging_provider.dart#L76) · [Reminder functions](https://github.com/mariuz92/echoboxlogistics_mobile/blob/9415959812ff6c46164b1fe5c91409a9beb87cfa/notifications/src/index.ts#L12)

## Build order and acceptance checks

| Delivery stage | Completion check |
|---|---|
| 1. Operator access and first customers | Provision the first platform owner through the deployment process and test their recovery. You can sign in with MFA, create a company, invite its owner, recover a failed invite and find the audit record. A company admin and a platform owner with only a first-factor session both get denied at the operator API. Test with two companies in staging. |
| 2. Company access and manual subscriptions | You can give an existing or new company a plan, schedule a trial end, suspend or reactivate access, and see the effective result. Test existing sessions, direct API calls, Realtime, public booking, notification workers and a rider with one active and one restricted company. Verify the expiry closeout flow with open pickups. |
| 3. Issues, alerts and support | A failed join, a web error and a notification failure arrive with useful context. Repeats group into one issue, support can recover the workflow, and another operator can see the audit trail. Verify the external alert while the app API is down. |
| 4. Shared mobile operations | One pilot company creates and assigns an order on the web, receives it on Flutter, completes delivery and pickup, and sees both actions reflected on the web. Push reminders work on iOS and Android and do not expose work from another company. Test that the previous mobile backend cannot keep writing the pilot's orders after cutover. |
| 5. Automated billing and broader controls | Add the chosen payment integration, usage reporting, stronger delegation and planned rollouts. Confirm duplicate and out-of-order payment events, failed payment recovery, plan changes and cancellation, with the expected access state visible to the operator and company owner. |
