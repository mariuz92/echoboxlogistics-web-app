import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { billingAlerts } from "./alerts";
import type { CompanyBilling, PlanInfo, SubscriptionState, Usage } from "./types";

const starter: PlanInfo = {
  code: "starter", name: "Starter", description: "", price_month: 29, price_year: 290, currency: "EUR",
  included_riders: 3, included_orders: 300, extra_rider_price: 5, extra_orders_price: 8, orders_block: 100,
};
const usage = (orders: number, riders: number): Usage => ({
  period_start: "2026-11-01", period_end: "2026-11-30", orders, riders, active_riders: 0,
});
const NOW = dayjs("2026-11-20T10:00:00Z");

function billing(
  over: Partial<CompanyBilling> & { state?: SubscriptionState; ends_at?: string | null; grace_until?: string | null } = {},
): CompanyBilling {
  const { state = "active", ends_at = null, grace_until = null, ...rest } = over;
  return {
    access_mode: "full",
    subscription: {
      plan_code: "starter", state, interval: "month", forever: false, ends_at, grace_until, closeout_until: null,
      billing_email: null, started_at: "2026-10-01T00:00:00Z",
    },
    plan: starter, usage: usage(10, 1), estimate: null, plans: [starter], invoices: [], request: null, last_response: null,
    ...rest,
  };
}

describe("billingAlerts", () => {
  it("is quiet for a healthy subscription", () => {
    expect(billingAlerts(billing(), NOW)).toEqual([]);
  });

  it("is quiet for a company without a subscription", () => {
    expect(billingAlerts(billing({ subscription: null }), NOW)).toEqual([]);
  });

  it("warns at 80 % of the orders, then at 100 %", () => {
    const warn = billingAlerts(billing({ usage: usage(250, 1) }), NOW);
    expect(warn.map((a) => a.id)).toEqual(["orders_80:2026-11-01"]);
    const reached = billingAlerts(billing({ usage: usage(305, 1) }), NOW);
    expect(reached.map((a) => a.id)).toEqual(["orders_100:2026-11-01"]);
    expect(reached[0].message).toContain("305");
    expect(reached[0].message).toContain("8,00");
  });

  it("flags riders at the included number and never blocks", () => {
    const alerts = billingAlerts(billing({ usage: usage(10, 3) }), NOW);
    expect(alerts.map((a) => a.id)).toEqual(["riders_100:2026-11-01"]);
    expect(alerts[0].level).toBe("info");
  });

  it("does not alert on unlimited plans", () => {
    const custom = { ...starter, included_riders: null, included_orders: null };
    expect(billingAlerts(billing({ plan: custom, usage: usage(99999, 500) }), NOW)).toEqual([]);
  });

  it("announces a trial ending within 7 days, not before", () => {
    expect(billingAlerts(billing({ state: "trial", ends_at: "2026-11-25T10:00:00Z" }), NOW)[0].id).toBe("trial:2026-11-25");
    expect(billingAlerts(billing({ state: "trial", ends_at: "2026-12-30T10:00:00Z" }), NOW)).toEqual([]);
  });

  it("tells that a trial is over", () => {
    const alert = billingAlerts(billing({ state: "trial", ends_at: "2026-11-10T10:00:00Z" }), NOW)[0];
    expect(alert).toMatchObject({ id: "trial_over:2026-11-10", level: "warning" });
  });

  it("warns about a late payment with its deadline", () => {
    const alert = billingAlerts(billing({ state: "past_due", grace_until: "2026-11-30T00:00:00Z" }), NOW)[0];
    expect(alert).toMatchObject({ id: "past_due", level: "warning" });
    expect(alert.message).toContain("30/11/2026");
  });

  it("keeps a dismissed notice stable across a month (same id) and new next month", () => {
    const november = billingAlerts(billing({ usage: usage(305, 1) }), NOW)[0].id;
    const december = billingAlerts(billing({ usage: { ...usage(305, 1), period_start: "2026-12-01" } }), NOW)[0].id;
    expect(november).not.toBe(december);
  });
});
