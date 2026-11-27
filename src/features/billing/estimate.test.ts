import { describe, expect, it } from "vitest";
import { estimateFromPlan } from "./estimate";
import type { PlanInfo, Usage } from "./types";

const starter: PlanInfo = {
  code: "starter", name: "Starter", description: "", price_month: 29, price_year: 290, currency: "EUR",
  included_riders: 3, included_orders: 300, extra_rider_price: 5, extra_orders_price: 8, orders_block: 100,
};
const usage = (orders: number, riders: number): Usage => ({
  period_start: "2026-11-01", period_end: "2026-11-30", orders, riders, active_riders: 0,
});

describe("estimateFromPlan", () => {
  it("matches the database test: 4 riders and 305 orders on Starter cost 42", () => {
    const estimate = estimateFromPlan(starter, "month", usage(305, 4));
    expect(estimate.total).toBe(42);
    expect(estimate.lines.map((l) => l.code)).toEqual(["base", "extra_riders", "extra_orders"]);
  });

  it("has only the base fee within the limits", () => {
    expect(estimateFromPlan(starter, "month", usage(300, 3)).lines).toHaveLength(1);
  });

  it("uses the yearly price for a yearly subscription", () => {
    expect(estimateFromPlan(starter, "year", usage(0, 0)).total).toBe(290);
  });

  it("never charges for unlimited limits", () => {
    const custom = { ...starter, included_riders: null, included_orders: null };
    expect(estimateFromPlan(custom, "month", usage(99999, 500)).total).toBe(29);
  });
});
