import dayjs, { type Dayjs } from "dayjs";
import type { BillingInterval, PlanInfo } from "./types";

/**
 * Yearly plans: what happens when a customer changes or cancels in the middle of the term.
 * (Written down for customers in docs/BILLING.md and shown on the landing page and in Settings.)
 *
 *  - Upgrade   effective at once; the customer pays the difference in base fee for the whole months left.
 *  - Downgrade effective at the next renewal; nothing is refunded or charged.
 *  - Cancel    the base fee of the whole months left is refunded. Extra riders and orders are usage
 *              already consumed and are never refunded. A month that has started counts as used.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Whole months left in the term (0 to 12). The month in progress counts as used. */
export function remainingMonths(endsAt: string | Dayjs | null | undefined, now: Dayjs = dayjs()): number {
  if (!endsAt) return 0;
  return Math.min(12, Math.max(0, dayjs(endsAt).diff(now, "month")));
}

/** Refund when a yearly plan is cancelled: the base fee paid for the term, for the whole months left. */
export function yearlyRefund(basePaid: number, monthsLeft: number): number {
  return round2((Math.max(0, basePaid) * Math.min(12, Math.max(0, monthsLeft))) / 12);
}

/** Price of the base fee for the interval of a subscription. */
export function baseFee(plan: PlanInfo, interval: BillingInterval): number {
  return interval === "year" ? plan.price_year ?? plan.price_month * 12 : plan.price_month;
}

/** Amount charged for an upgrade in the middle of a yearly term: the difference, for the months left. */
export function upgradeDifference(current: PlanInfo, next: PlanInfo, monthsLeft: number): number {
  const difference = baseFee(next, "year") - baseFee(current, "year");
  return difference > 0 ? yearlyRefund(difference, monthsLeft) : 0;
}

export type PlanChangeKind = "upgrade" | "downgrade" | "same";

/** A change is a downgrade when the plan is cheaper, or the plan is the same but goes from yearly to monthly. */
export function planChangeKind(
  current: Pick<PlanInfo, "code" | "price_month">, currentInterval: BillingInterval,
  next: Pick<PlanInfo, "code" | "price_month">, nextInterval: BillingInterval,
): PlanChangeKind {
  if (current.code === next.code) {
    if (currentInterval === nextInterval) return "same";
    return currentInterval === "year" ? "downgrade" : "upgrade";
  }
  return next.price_month < current.price_month ? "downgrade" : "upgrade";
}
