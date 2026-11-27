// Shapes returned by the billing RPCs (company_billing, platform_billing_overview).
// Plans and limits live in the database; the mobile app reads the same RPCs.

export type SubscriptionState = "trial" | "active" | "past_due" | "expired" | "cancelled";
export type BillingInterval = "month" | "year";
export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type RequestStatus = "open" | "approved" | "rejected" | "cancelled";

/** `null` limits mean unlimited. */
export interface PlanInfo {
  code: string;
  name: string;
  description: string;
  price_month: number;
  price_year: number | null;
  currency: string;
  included_riders: number | null;
  included_orders: number | null;
  extra_rider_price: number;
  extra_orders_price: number;
  orders_block: number;
}

export interface AdminPlan extends PlanInfo {
  available: boolean;
  is_public: boolean;
  sort_order: number;
}

export interface Usage {
  period_start: string;
  period_end: string;
  orders: number;
  riders: number;
  active_riders: number;
}

export interface EstimateLine {
  code: "base" | "extra_riders" | "extra_orders";
  quantity: number;
  unit_price: number;
  amount: number;
  block?: number;
}

export interface Estimate {
  currency: string;
  interval: BillingInterval;
  lines: EstimateLine[];
  total: number;
  usage: Usage;
}

export interface InvoiceLine {
  code?: string;
  label?: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  period_start: string;
  period_end: string;
  lines: InvoiceLine[];
  amount: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  external_url: string | null;
}

export interface CompanySubscription {
  plan_code: string;
  state: SubscriptionState;
  interval: BillingInterval;
  forever: boolean;
  ends_at: string | null;
  grace_until: string | null;
  closeout_until: string | null;
  billing_email: string | null;
  started_at: string;
  /** A downgrade agreed during the term, applied at the renewal. */
  next_plan_code: string | null;
  next_billing_interval: BillingInterval | null;
}

export interface PlanRequest {
  id: string;
  to_plan: string;
  billing_interval: BillingInterval;
  note: string;
  created_at: string;
}

export interface CompanyBilling {
  access_mode: "full" | "closeout" | "read_only" | "suspended";
  subscription: CompanySubscription | null;
  plan: PlanInfo | null;
  usage: Usage;
  estimate: Estimate | null;
  plans: PlanInfo[];
  invoices: Invoice[];
  request: PlanRequest | null;
  last_response: { to_plan: string; status: "approved" | "rejected"; response: string | null; handled_at: string } | null;
}

export type LimitLevel = "unlimited" | "ok" | "warning" | "reached";

/** How close a usage figure is to its included amount: warning from 80 %, reached from 100 %. */
export function limitLevel(used: number, included: number | null): { percent: number | null; level: LimitLevel } {
  if (included === null) return { percent: null, level: "unlimited" };
  if (included <= 0) return { percent: used > 0 ? 100 : 0, level: used > 0 ? "reached" : "ok" };
  const percent = Math.round((used / included) * 100);
  return { percent, level: used >= included ? "reached" : used >= included * 0.8 ? "warning" : "ok" };
}
