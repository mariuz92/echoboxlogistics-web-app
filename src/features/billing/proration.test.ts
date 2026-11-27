import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { baseFee, planChangeKind, remainingMonths, upgradeDifference, yearlyRefund } from "./proration";
import type { PlanInfo } from "./types";

const plan = (code: string, month: number, year: number | null): PlanInfo => ({
  code, name: code, description: "", price_month: month, price_year: year, currency: "EUR",
  included_riders: 3, included_orders: 300, extra_rider_price: 5, extra_orders_price: 8, orders_block: 100,
});
const starter = plan("starter", 29, 290);
const pro = plan("pro", 79, 790);
const NOW = dayjs("2026-11-15T10:00:00Z");

describe("remainingMonths", () => {
  it("counts whole months only: the month in progress is used", () => {
    expect(remainingMonths("2027-11-15T10:00:00Z", NOW)).toBe(12);
    expect(remainingMonths("2027-07-14T10:00:00Z", NOW)).toBe(7);
    expect(remainingMonths("2027-07-15T10:00:00Z", NOW)).toBe(8);
  });
  it("is never negative or above a year", () => {
    expect(remainingMonths("2026-10-01T00:00:00Z", NOW)).toBe(0);
    expect(remainingMonths("2030-01-01T00:00:00Z", NOW)).toBe(12);
    expect(remainingMonths(null, NOW)).toBe(0);
  });
});

describe("yearlyRefund", () => {
  it("refunds the base fee of the whole months left", () => {
    expect(yearlyRefund(790, 8)).toBe(526.67);
    expect(yearlyRefund(790, 12)).toBe(790);
    expect(yearlyRefund(790, 0)).toBe(0);
  });
  it("ignores nonsense", () => {
    expect(yearlyRefund(-10, 5)).toBe(0);
    expect(yearlyRefund(120, 99)).toBe(120);
  });
});

describe("upgradeDifference", () => {
  it("charges the yearly difference for the months left", () => {
    // 790 - 290 = 500, for 6 of 12 months.
    expect(upgradeDifference(starter, pro, 6)).toBe(250);
  });
  it("is zero for a downgrade", () => expect(upgradeDifference(pro, starter, 6)).toBe(0));
  it("uses 12 months of the monthly price when a plan has no yearly price", () => {
    expect(baseFee(plan("x", 10, null), "year")).toBe(120);
  });
});

describe("planChangeKind", () => {
  it("is an upgrade to a pricier plan and a downgrade to a cheaper one", () => {
    expect(planChangeKind(starter, "year", pro, "year")).toBe("upgrade");
    expect(planChangeKind(pro, "year", starter, "year")).toBe("downgrade");
  });
  it("treats yearly -> monthly on the same plan as a downgrade", () => {
    expect(planChangeKind(pro, "year", pro, "month")).toBe("downgrade");
    expect(planChangeKind(pro, "month", pro, "year")).toBe("upgrade");
    expect(planChangeKind(pro, "year", pro, "year")).toBe("same");
  });
});
