import { estimateFromPlan } from "./estimate";
import type { BillingInterval, PlanInfo, Usage } from "./types";

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface YearlyDeal {
  /** What twelve monthly payments would cost. */
  listPrice: number;
  price: number;
  saving: number;
  percent: number;
  monthsFree: number;
  /** The yearly price spread over twelve months. */
  perMonth: number;
}

/** The discount of the yearly price against twelve months, or null when there is none. */
export function yearlyDeal(plan: PlanInfo): YearlyDeal | null {
  const listPrice = round2(plan.price_month * 12);
  if (plan.price_year === null || listPrice <= 0) return null;
  const saving = round2(listPrice - plan.price_year);
  if (saving <= 0) return null;
  return {
    listPrice,
    price: plan.price_year,
    saving,
    percent: Math.round((saving / listPrice) * 100),
    monthsFree: Math.round(saving / plan.price_month),
    perMonth: round2(plan.price_year / 12),
  };
}

/**
 * What a plan would cost per month for the given usage: the base fee (a twelfth of the yearly price
 * on a yearly plan) plus the extra riders and orders, which are always billed monthly.
 */
export function monthlyEquivalent(plan: PlanInfo, interval: BillingInterval, usage: Usage): number {
  const extras = estimateFromPlan(plan, "month", usage).total - plan.price_month;
  const base = interval === "year" ? yearlyDeal(plan)?.perMonth ?? plan.price_month : plan.price_month;
  return round2(base + extras);
}
