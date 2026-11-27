// Prices shown on the landing page and used by its cost calculator.
//
// The landing page reads the plans from the database (the public-plans Edge Function), so a price
// changed in the Superadmin console appears on the site within minutes. This file is the fallback
// shown while the plans load, or when the server cannot be reached; the unit test pricing.test.ts
// checks that it matches the plans seeded by the migration. Update it when you change the prices
// for good, so the fallback does not show old numbers.

export interface PricePlan {
  code: string;
  name: string;
  /** Short text under the name; the landing page translates it for the starting plans. */
  description: string;
  /** The plan that carries the "most popular" badge. */
  highlighted: boolean;
  currency: string;
  priceMonth: number;
  /** `null` = no yearly price (no discount). */
  priceYear: number | null;
  /** `null` = unlimited. */
  includedRiders: number | null;
  includedOrders: number | null;
  extraRider: number;
  /** Price of one block of `ordersBlock` extra orders. */
  extraOrders: number;
  ordersBlock: number;
}

export const PRICE_PLANS: readonly PricePlan[] = [
  { code: "starter", name: "Starter", description: "", highlighted: false, currency: "EUR", priceMonth: 29, priceYear: 290, includedRiders: 3, includedOrders: 300, extraRider: 5, extraOrders: 8, ordersBlock: 100 },
  { code: "pro", name: "Pro", description: "", highlighted: true, currency: "EUR", priceMonth: 79, priceYear: 790, includedRiders: 10, includedOrders: 1500, extraRider: 4, extraOrders: 6, ordersBlock: 100 },
  { code: "business", name: "Business", description: "", highlighted: false, currency: "EUR", priceMonth: 149, priceYear: 1490, includedRiders: 30, includedOrders: 6000, extraRider: 3, extraOrders: 5, ordersBlock: 100 },
];

export interface CostBreakdown {
  base: number;
  extraRiders: number;
  extraOrders: number;
  extraRiderCount: number;
  extraOrderBlocks: number;
  total: number;
}

export type PriceInterval = "month" | "year";

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Cost per month of a plan for a given number of riders and orders per month. With the yearly
 * interval the base fee is the yearly price spread over 12 months (the monthly price when the plan
 * has no yearly price); extras are always monthly, and never charged on an unlimited limit.
 */
export function monthlyCost(plan: PricePlan, riders: number, orders: number, interval: PriceInterval = "month"): CostBreakdown {
  const extraRiderCount = plan.includedRiders === null ? 0 : Math.max(0, Math.floor(riders) - plan.includedRiders);
  const extraOrderBlocks = plan.includedOrders === null
    ? 0 : Math.ceil(Math.max(0, Math.floor(orders) - plan.includedOrders) / plan.ordersBlock);
  const extraRiders = extraRiderCount * plan.extraRider;
  const extraOrders = extraOrderBlocks * plan.extraOrders;
  const base = interval === "year" && plan.priceYear !== null ? round2(plan.priceYear / 12) : plan.priceMonth;
  return { base, extraRiders, extraOrders, extraRiderCount, extraOrderBlocks, total: round2(base + extraRiders + extraOrders) };
}

/** The plan with the lowest monthly cost for this usage (the cheaper one on ties). */
export function cheapestPlan(
  plans: readonly PricePlan[], riders: number, orders: number, interval: PriceInterval = "month",
): PricePlan {
  return plans.reduce((best, plan) =>
    monthlyCost(plan, riders, orders, interval).total < monthlyCost(best, riders, orders, interval).total ? plan : best);
}

/** The discount of a plan's yearly price against twelve months, or null when there is none. */
export function priceSaving(plan: PricePlan): { listPrice: number; saving: number; percent: number; perMonth: number } | null {
  if (plan.priceYear === null) return null;
  const listPrice = round2(plan.priceMonth * 12);
  const saving = round2(listPrice - plan.priceYear);
  if (listPrice <= 0 || saving <= 0) return null;
  return { listPrice, saving, percent: Math.round((saving / listPrice) * 100), perMonth: round2(plan.priceYear / 12) };
}

const money = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const limit = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);

/**
 * Reads the answer of the public-plans function. Strict on purpose: anything unexpected returns null
 * and the page keeps its built-in prices instead of showing something wrong.
 */
export function parsePublicPlans(data: unknown): PricePlan[] | null {
  if (!Array.isArray(data) || data.length === 0 || data.length > 6) return null;
  const plans: PricePlan[] = [];
  for (const row of data as Record<string, unknown>[]) {
    if (!row || typeof row !== "object") return null;
    const { code, name, description, highlighted, currency, price_month, price_year, included_riders, included_orders } = row;
    const { extra_rider_price, extra_orders_price, orders_block } = row;
    if (typeof code !== "string" || !/^[a-z][a-z0-9_-]{1,39}$/.test(code)) return null;
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) return null;
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
    if (!money(price_month) || !(price_year === null || money(price_year))) return null;
    if (!limit(included_riders) || !limit(included_orders)) return null;
    if (!money(extra_rider_price) || !money(extra_orders_price)) return null;
    if (typeof orders_block !== "number" || !Number.isInteger(orders_block) || orders_block < 1 || orders_block > 10000) return null;
    plans.push({
      code, name: name.trim(), description: typeof description === "string" ? description.slice(0, 300) : "",
      highlighted: highlighted === true, currency, priceMonth: price_month, priceYear: price_year as number | null,
      includedRiders: included_riders, includedOrders: included_orders, extraRider: extra_rider_price,
      extraOrders: extra_orders_price, ordersBlock: orders_block,
    });
  }
  if (new Set(plans.map((p) => p.code)).size !== plans.length) return null;
  // At most one plan carries the badge.
  const first = plans.findIndex((p) => p.highlighted);
  return plans.map((p, i) => ({ ...p, highlighted: i === first }));
}
