import { describe, expect, it } from "vitest";
import { formatPct, lossRate, pctChange } from "./utils";

describe("pctChange", () => {
  it("computes growth and decline", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(100, 100)).toBe(0);
  });

  it("has no baseline when the previous period is empty (regression: used to report +100%)", () => {
    expect(pctChange(0, 0)).toBeNull();
    expect(pctChange(40, 0)).toBeNull();
  });
});

describe("formatPct", () => {
  it("formats with sign and Italian decimal comma", () => {
    expect(formatPct(12.34)).toBe("+12,3%");
    expect(formatPct(-5)).toBe("-5,0%");
    expect(formatPct(0)).toBe("0,0%");
    expect(formatPct(null)).toBe("n/d");
  });
});

describe("lossRate", () => {
  it("is zero without deliveries", () => {
    expect(lossRate(3, 0)).toBe(0);
    expect(lossRate(5, 100)).toBe(5);
  });
});
