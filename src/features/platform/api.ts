import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env";
import type { Database, Json } from "../../types/database.types";
import type { OrderStatus } from "../../types/domain";

export const platformClient = createClient<Database>(
  env.supabaseUrl ?? "http://localhost:54321",
  env.supabaseAnonKey ?? "missing-anon-key",
  { auth: { storageKey: "echobox-platform-session", detectSessionInUrl: false } },
);

export type AccessMode = "full" | "closeout" | "read_only" | "suspended";
export type SubscriptionState = "trial" | "active" | "past_due" | "expired" | "cancelled";
export type IssueState = "open" | "investigating" | "resolved";
export type IssueSeverity = "info" | "warning" | "critical";
type Role = Database["public"]["Enums"]["app_role"];

export interface Company {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  is_active: boolean;
  public_booking_enabled: boolean;
  access_mode: AccessMode;
  owner_id: string | null;
  plan_code: string | null;
  subscription_state: SubscriptionState | null;
}

export interface Plan { code: string; name: string; available: boolean }
export interface Subscription {
  plan_code: string;
  state: SubscriptionState;
  ends_at: string | null;
  grace_until: string | null;
  closeout_until: string | null;
  billing_email: string | null;
}
export interface Member {
  id: string;
  email: string;
  full_name: string;
  roles: Role[];
  disabled: boolean;
  last_login_at: string | null;
}
export interface Invitation {
  id: string;
  email: string;
  roles: Role[];
  accepted_at: string | null;
  expires_at: string;
  for_owner: boolean | null;
  delivery_state: string | null;
}
export interface Payment { id: string; amount: number; currency: string; reference: string; paid_at: string }
export interface Settings { operator_only_companies: boolean; booking_paused: boolean; notice: string }
export interface Issue {
  id: string;
  source: "web" | "flutter" | "backend";
  company_name: string | null;
  area: string;
  code: string;
  build: string | null;
  state: IssueState;
  severity: IssueSeverity;
  occurrences: number;
  last_seen_at: string;
}
export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string;
  handled: boolean;
  created_at: string;
  emailed_at: string | null;
  mail_failed: boolean;
}
export interface AuditEntry {
  id: number;
  actor_email: string | null;
  actor_id: string;
  action: string;
  reason: string;
  created_at: string;
  tenant_id: string | null;
  before_state: Json;
  after_state: Json;
}
export interface OperationalOrder {
  id: string;
  delivery_at: string;
  pickup_at: string | null;
  status: OrderStatus;
  radio_channel: number | null;
  lost_radios: number;
  delivery_rider_id: string | null;
  pickup_rider_id: string | null;
}

export interface Snapshot {
  companies: Company[];
  summary: { companies: number; pending_invites: number; overdue_pickups: number; issues: number };
  plans: Plan[];
  settings: Settings;
  operators: { user_id: string; email: string; enabled: boolean; created_at: string }[];
  members: Member[];
  invitations: Invitation[];
  subscription: Subscription | null;
  payments: Payment[];
  orders: OperationalOrder[];
  issues: Issue[];
  contacts: Contact[];
  audit: AuditEntry[];
}

export async function getSnapshot(tenantId?: string, search?: string) {
  const { data, error } = await platformClient.rpc("platform_console_snapshot", {
    p_tenant_id: tenantId,
    p_search: search,
  });
  if (error) throw error;
  return data as unknown as Snapshot;
}

export type Action =
  | "create_company" | "invite_member" | "revoke_invitation" | "renew_invitation" | "set_company_active"
  | "set_member_enabled" | "transfer_owner" | "save_plan" | "save_subscription"
  | "record_payment" | "save_settings" | "set_operator" | "update_issue" | "handle_contact";

export async function submitAction(action: Action, values: Record<string, Json | undefined>) {
  const { data, error } = await platformClient.rpc("platform_console_action", {
    p_action: action,
    p_values: values,
  });
  if (error) throw error;
  return data as { tenant_id?: string; invitation_id?: string };
}

export async function sendInvite(id: string) {
  const { data, error } = await platformClient.functions.invoke<{ state: string }>("platform-invite", {
    body: { invitation_id: id },
  });
  if (error) {
    const response = error.context;
    const details = response instanceof Response ? await response.json().catch(() => null) : null;
    throw new Error(typeof details?.error === "string" ? details.error : "invitation_result_unavailable");
  }
  return data?.state ?? "failed";
}

const MESSAGES: Record<string, string> = {
  operator_access_denied: "Accesso riservato agli operatori con verifica in due passaggi.",
  company_access_restricted: "L’azienda non può ricevere nuovi inviti con lo stato attuale.",
  account_has_company: "Questo account è già associato a un’azienda.",
  invite_in_another_company: "Esiste già un invito valido per questo indirizzo in un’altra azienda.",
  revoke_previous_invitation: "Revoca prima l’invito esistente per questo indirizzo.",
  invitation_retry_unavailable: "Invio in corso o limite di tentativi raggiunto. Riprova più tardi.",
  invitation_unavailable: "L’invito è stato accettato, revocato o è scaduto.",
  invitation_result_unavailable: "Impossibile confermare l’esito dell’invio. Controlla lo stato prima di riprovare.",
  invitation_site_not_configured: "Configura l’indirizzo dell’app per inviare gli inviti.",
  transfer_company_owner_first: "Trasferisci prima la proprietà dell’azienda.",
  owner_must_be_active_admin: "Scegli un amministratore attivo con email verificata.",
  last_admin: "L’azienda deve mantenere almeno un amministratore attivo.",
  rider_has_active_orders: "Questo rider ha incarichi in corso.",
  plan_unavailable: "Seleziona un piano disponibile.",
  operator_verified_account_required: "L’indirizzo deve appartenere a un account verificato e attivo.",
  operator_cannot_disable_self: "Un altro operatore deve disabilitare il tuo accesso.",
  invalid_timezone: "Inserisci un fuso orario IANA valido, ad esempio Europe/Rome.",
};

export function actionError(error: unknown) {
  const message = (error as { message?: string } | null)?.message;
  const code = (error as { code?: string } | null)?.code;
  return MESSAGES[message ?? ""] ??
    (code === "23505" ? "Esiste già un record con questi dati." : "Operazione non riuscita. Controlla i dati e riprova.");
}
