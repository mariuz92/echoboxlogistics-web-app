import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cheapestPlan, monthlyCost, parsePublicPlans, priceSaving, PRICE_PLANS, type PricePlan } from "./pricing";
import { limitLevel } from "./types";

const [starter, pro, business] = PRICE_PLANS;

describe("monthlyCost", () => {
  it("charges only the base fee within the included riders and orders", () => {
    expect(monthlyCost(starter, 3, 300).total).toBe(29);
    expect(monthlyCost(pro, 0, 0).total).toBe(79);
  });

  it("adds extra riders and blocks of extra orders", () => {
    // Same figures as the database test: 4 riders, 305 orders on Starter = 29 + 5 + 8.
    expect(monthlyCost(starter, 4, 305)).toMatchObject({ extraRiderCount: 1, extraOrderBlocks: 1, total: 42 });
  });

  it("rounds a started block of orders up", () => {
    expect(monthlyCost(starter, 1, 301).extraOrderBlocks).toBe(1);
    expect(monthlyCost(starter, 1, 400).extraOrderBlocks).toBe(1);
    expect(monthlyCost(starter, 1, 401).extraOrderBlocks).toBe(2);
  });

  it("spreads the yearly price over twelve months", () => {
    expect(monthlyCost(starter, 3, 300, "year").base).toBe(24.17);
    expect(monthlyCost(starter, 4, 305, "year").total).toBe(37.17);
  });

  it("uses the monthly price when a plan has no yearly price", () => {
    expect(monthlyCost({ ...starter, priceYear: null }, 3, 300, "year").base).toBe(29);
  });

  it("never charges extras on an unlimited limit", () => {
    const open = { ...starter, includedRiders: null, includedOrders: null };
    expect(monthlyCost(open, 500, 99999).total).toBe(29);
  });

  it("ignores fractions and negatives", () => {
    expect(monthlyCost(starter, -2, -10).total).toBe(29);
    expect(monthlyCost(starter, 3.9, 300.9).total).toBe(29);
  });
});

describe("cheapestPlan", () => {
  it("moves to a bigger plan when extras would cost more", () => {
    expect(cheapestPlan(PRICE_PLANS, 2, 100).code).toBe("starter");
    expect(cheapestPlan(PRICE_PLANS, 10, 1500).code).toBe("pro");
    expect(cheapestPlan(PRICE_PLANS, 30, 6000).code).toBe("business");
  });
});

describe("priceSaving", () => {
  it("is two months free on the starting plans", () => {
    expect(priceSaving(starter)).toEqual({ listPrice: 348, saving: 58, percent: 17, perMonth: 24.17 });
    expect(priceSaving(business)).toMatchObject({ saving: 298 });
  });
  it("is null without a yearly price or a real discount", () => {
    expect(priceSaving({ ...starter, priceYear: null })).toBeNull();
    expect(priceSaving({ ...starter, priceYear: 348 })).toBeNull();
  });
});

describe("limitLevel", () => {
  it("is unlimited without a limit", () => expect(limitLevel(5000, null)).toEqual({ percent: null, level: "unlimited" }));
  it("warns from 80 % and flags 100 %", () => {
    expect(limitLevel(239, 300).level).toBe("ok");
    expect(limitLevel(240, 300).level).toBe("warning");
    expect(limitLevel(300, 300)).toEqual({ percent: 100, level: "reached" });
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  code: "starter", name: "Starter", description: "", highlighted: false, currency: "EUR", price_month: 29, price_year: 290,
  included_riders: 3, included_orders: 300, extra_rider_price: 5, extra_orders_price: 8, orders_block: 100, ...over,
});

describe("parsePublicPlans", () => {
  it("reads the answer of the database function", () => {
    const plans = parsePublicPlans([row(), row({ code: "pro", name: "Pro", price_month: 79, price_year: null, included_orders: null, highlighted: true })]);
    expect(plans).toHaveLength(2);
    expect(plans![1]).toMatchObject({ code: "pro", priceMonth: 79, priceYear: null, includedOrders: null, highlighted: true });
  });

  it("keeps a single highlighted plan", () => {
    const plans = parsePublicPlans([row({ highlighted: true }), row({ code: "pro", name: "Pro", highlighted: true })]);
    expect(plans!.map((p) => p.highlighted)).toEqual([true, false]);
  });

  it("rejects anything unexpected so the page keeps its own prices", () => {
    expect(parsePublicPlans(null)).toBeNull();
    expect(parsePublicPlans([])).toBeNull();
    expect(parsePublicPlans({ plans: [] })).toBeNull();
    expect(parsePublicPlans([row({ price_month: -1 })])).toBeNull();
    expect(parsePublicPlans([row({ price_month: "29" })])).toBeNull();
    expect(parsePublicPlans([row({ code: "Bad Code" })])).toBeNull();
    expect(parsePublicPlans([row({ currency: "euro" })])).toBeNull();
    expect(parsePublicPlans([row({ orders_block: 0 })])).toBeNull();
    expect(parsePublicPlans([row({ included_riders: 1.5 })])).toBeNull();
    expect(parsePublicPlans([row(), row()])).toBeNull();
    expect(parsePublicPlans(Array.from({ length: 7 }, (_, i) => row({ code: `plan${i}` })))).toBeNull();
  });
});

describe("fallback prices = database seed", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261127000000_subscription_billing.sql", import.meta.url), "utf8");
  for (const plan of PRICE_PLANS) {
    it(`${plan.code} matches the seeded plan`, () => {
      const seed = new RegExp(`\\('${plan.code}', '[^']*', '[^']*', ([\\d.]+), ([\\d.]+), (\\d+), (\\d+), ([\\d.]+), ([\\d.]+), (\\d+),`).exec(sql);
      expect(seed, "seed row not found").not.toBeNull();
      expect(seed!.slice(1).map(Number)).toEqual([
        plan.priceMonth, plan.priceYear, plan.includedRiders, plan.includedOrders, plan.extraRider, plan.extraOrders, plan.ordersBlock,
      ]);
    });
  }
  it("business is larger than pro, which is larger than starter", () => {
    const orders = (p: PricePlan) => p.includedOrders ?? Infinity;
    expect(orders(business)).toBeGreaterThan(orders(pro));
    expect(orders(pro)).toBeGreaterThan(orders(starter));
  });
});
