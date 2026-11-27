import { describe, expect, it } from "vitest";
import { monthlyEquivalent, yearlyDeal } from "./deal";
import type { PlanInfo, Usage } from "./types";

const plan = (over: Partial<PlanInfo> = {}): PlanInfo => ({
  code: "starter", name: "Starter", description: "", price_month: 29, price_year: 290, currency: "EUR",
  included_riders: 3, included_orders: 300, extra_rider_price: 5, extra_orders_price: 8, orders_block: 100, ...over,
});
const usage = (orders: number, riders: number): Usage => ({ period_start: "2026-11-01", period_end: "2026-11-30", orders, riders, active_riders: 0 });

describe("yearlyDeal", () => {
  it("shows two months free on every starting plan", () => {
    expect(yearlyDeal(plan())).toEqual({ listPrice: 348, price: 290, saving: 58, percent: 17, monthsFree: 2, perMonth: 24.17 });
    expect(yearlyDeal(plan({ price_month: 79, price_year: 790 }))).toMatchObject({ saving: 158, monthsFree: 2 });
    expect(yearlyDeal(plan({ price_month: 149, price_year: 1490 }))).toMatchObject({ saving: 298, percent: 17 });
  });
  it("is null without a real discount", () => {
    expect(yearlyDeal(plan({ price_year: null }))).toBeNull();
    expect(yearlyDeal(plan({ price_year: 348 }))).toBeNull();
    expect(yearlyDeal(plan({ price_month: 0, price_year: 0 }))).toBeNull();
  });
});

describe("monthlyEquivalent", () => {
  it("adds the monthly extras to the base fee", () => {
    expect(monthlyEquivalent(plan(), "month", usage(305, 4))).toBe(42);
  });
  it("uses a twelfth of the yearly price on a yearly plan; extras stay at list price", () => {
    expect(monthlyEquivalent(plan(), "year", usage(305, 4))).toBe(37.17);
    expect(monthlyEquivalent(plan(), "year", usage(10, 1))).toBe(24.17);
  });
});
