import type { BillingInterval, Estimate, EstimateLine, PlanInfo, Usage } from "./types";

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Mirrors private.estimate_bill in the database: base fee + extra riders + blocks of extra
 * orders. The database function is the source of truth; this copy lets the console prefill
 * an invoice without another round trip (the unit test pins both to the same figures).
 */
export function estimateFromPlan(plan: PlanInfo, interval: BillingInterval, usage: Usage): Estimate {
  const base = interval === "year" ? plan.price_year ?? plan.price_month * 12 : plan.price_month;
  const lines: EstimateLine[] = [{ code: "base", quantity: 1, unit_price: base, amount: base }];

  if (plan.included_riders !== null && usage.riders > plan.included_riders) {
    const quantity = usage.riders - plan.included_riders;
    lines.push({
      code: "extra_riders", quantity, unit_price: plan.extra_rider_price, amount: round2(quantity * plan.extra_rider_price),
    });
  }
  if (plan.included_orders !== null && usage.orders > plan.included_orders) {
    const quantity = Math.ceil((usage.orders - plan.included_orders) / plan.orders_block);
    lines.push({
      code: "extra_orders", quantity, unit_price: plan.extra_orders_price, block: plan.orders_block,
      amount: round2(quantity * plan.extra_orders_price),
    });
  }
  return { currency: plan.currency, interval, lines, total: round2(lines.reduce((sum, l) => sum + l.amount, 0)), usage };
}
