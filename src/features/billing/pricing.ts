// Starting prices, shown on the landing page and used by its cost calculator.
//
// The prices that customers are really billed live in the database (platform_plans) and
// are edited in the Superadmin console. This table is only the public price list; the
// unit test pricing.test.ts checks that it matches the plans seeded by the migration, so
// change both together (or edit the console and update this file afterwards).

export interface PricePlan {
  code: "starter" | "pro" | "business";
  priceMonth: number;
  priceYear: number;
  includedRiders: number;
  includedOrders: number;
  extraRider: number;
  /** Price of one block of `ordersBlock` extra orders. */
  extraOrders: number;
  ordersBlock: number;
}

export const PRICE_PLANS: readonly PricePlan[] = [
  { code: "starter", priceMonth: 29, priceYear: 290, includedRiders: 3, includedOrders: 300, extraRider: 5, extraOrders: 8, ordersBlock: 100 },
  { code: "pro", priceMonth: 79, priceYear: 790, includedRiders: 10, includedOrders: 1500, extraRider: 4, extraOrders: 6, ordersBlock: 100 },
  { code: "business", priceMonth: 149, priceYear: 1490, includedRiders: 30, includedOrders: 6000, extraRider: 3, extraOrders: 5, ordersBlock: 100 },
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

/**
 * Cost per month of a plan for a given number of riders and orders per month. With the yearly
 * interval the base fee is the yearly price spread over 12 months; extras are always monthly.
 */
export function monthlyCost(plan: PricePlan, riders: number, orders: number, interval: PriceInterval = "month"): CostBreakdown {
  const extraRiderCount = Math.max(0, Math.floor(riders) - plan.includedRiders);
  const extraOrderBlocks = Math.ceil(Math.max(0, Math.floor(orders) - plan.includedOrders) / plan.ordersBlock);
  const extraRiders = extraRiderCount * plan.extraRider;
  const extraOrders = extraOrderBlocks * plan.extraOrders;
  const base = interval === "year" ? Math.round((plan.priceYear / 12) * 100) / 100 : plan.priceMonth;
  return {
    base,
    extraRiders,
    extraOrders,
    extraRiderCount,
    extraOrderBlocks,
    total: Math.round((base + extraRiders + extraOrders) * 100) / 100,
  };
}

/** The plan with the lowest monthly cost for this usage (the cheaper one on ties). */
export function cheapestPlan(riders: number, orders: number, interval: PriceInterval = "month"): PricePlan {
  return PRICE_PLANS.reduce((best, plan) =>
    monthlyCost(plan, riders, orders, interval).total < monthlyCost(best, riders, orders, interval).total ? plan : best);
}
