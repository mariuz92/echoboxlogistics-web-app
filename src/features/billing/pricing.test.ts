import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cheapestPlan, monthlyCost, PRICE_PLANS } from "./pricing";
import { limitLevel } from "./types";

const [starter, pro, business] = PRICE_PLANS;

describe("monthlyCost", () => {
  it("charges only the base fee within the included riders and orders", () => {
    expect(monthlyCost(starter, 3, 300).total).toBe(29);
    expect(monthlyCost(pro, 0, 0).total).toBe(79);
  });

  it("adds extra riders and blocks of extra orders", () => {
    // Same figures as the database test: 4 riders, 305 orders on Starter = 29 + 5 + 8.
    const cost = monthlyCost(starter, 4, 305);
    expect(cost).toMatchObject({ extraRiderCount: 1, extraOrderBlocks: 1, total: 42 });
  });

  it("rounds a started block of orders up", () => {
    expect(monthlyCost(starter, 1, 301).extraOrderBlocks).toBe(1);
    expect(monthlyCost(starter, 1, 400).extraOrderBlocks).toBe(1);
    expect(monthlyCost(starter, 1, 401).extraOrderBlocks).toBe(2);
  });

  it("spreads the yearly price over twelve months", () => {
    // 290 / 12 = 24.17 per month: two months free compared with 29 x 12 = 348.
    expect(monthlyCost(starter, 3, 300, "year").base).toBe(24.17);
    expect(monthlyCost(starter, 4, 305, "year").total).toBe(37.17);
  });

  it("ignores fractions and negatives", () => {
    expect(monthlyCost(starter, -2, -10).total).toBe(29);
    expect(monthlyCost(starter, 3.9, 300.9).total).toBe(29);
  });
});

describe("cheapestPlan", () => {
  it("moves to a bigger plan when extras would cost more", () => {
    expect(cheapestPlan(2, 100).code).toBe("starter");
    expect(cheapestPlan(10, 1500).code).toBe("pro");
    expect(cheapestPlan(30, 6000).code).toBe("business");
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

describe("price list = database seed", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261127000000_subscription_billing.sql", import.meta.url), "utf8");
  for (const plan of PRICE_PLANS) {
    it(`${plan.code} matches the seeded plan`, () => {
      const row = new RegExp(`\\('${plan.code}', '[^']*', '[^']*', ([\\d.]+), ([\\d.]+), (\\d+), (\\d+), ([\\d.]+), ([\\d.]+), (\\d+),`).exec(sql);
      expect(row, "seed row not found").not.toBeNull();
      expect(row!.slice(1).map(Number)).toEqual([
        plan.priceMonth, plan.priceYear, plan.includedRiders, plan.includedOrders,
        plan.extraRider, plan.extraOrders, plan.ordersBlock,
      ]);
    });
  }
  it("business is larger than pro, which is larger than starter", () => {
    expect(business.includedOrders).toBeGreaterThan(pro.includedOrders);
    expect(pro.includedOrders).toBeGreaterThan(starter.includedOrders);
  });
});
