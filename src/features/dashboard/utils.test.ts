import { describe, expect, it } from "vitest";
import type { DashboardInsights, PeriodFigures } from "./api";
import { buildInsights, formatPct, lossRate, pctChange } from "./utils";

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

describe("buildInsights", () => {
  const figures = (over: Partial<PeriodFigures> = {}): PeriodFigures => ({
    orders: 100,
    revenue: 10000,
    radios: 3000,
    lost: 0,
    delivered: 100,
    on_time: 98,
    cancelled: 2,
    booked: 102,
    ...over,
  });
  const base = (over: Partial<DashboardInsights> = {}): DashboardInsights => ({
    month: "2026-10",
    timezone: "Europe/Rome",
    in_progress: false,
    through: "2026-10-31",
    booked_ahead: { orders: 0, revenue: 0, radios: 0 },
    current: figures(),
    previous: figures(),
    trend: [],
    capacity: { channels: 40, exclusive: true, days: [], upcoming: [] },
    alerts: { overdue_pickups: { orders: 0, radios: 0, oldest_days: 0 }, unassigned_deliveries: 0, unassigned_pickups: 0 },
    stops: [],
    guides: { top: [], active: 0, new: 0, new_revenue: 0, win_back: [], losses: [] },
    operations: {
      lead_time: { same_day: 0, days_1_2: 0, days_3_7: 0, days_8_30: 0, over_30: 0 },
      sources: [],
      avg_days_out: null,
      riders: [],
    },
    locations: [],
    ...over,
  });
  const keys = (d: DashboardInsights) => buildInsights(d).map((i) => i.key);

  it("says nothing it cannot support when there is no data", () => {
    expect(buildInsights(base({ current: figures({ orders: 0, revenue: 0, radios: 0, delivered: 0, on_time: 0, booked: 0, cancelled: 0 }), previous: figures({ orders: 0, revenue: 0, radios: 0, delivered: 0, on_time: 0, booked: 0, cancelled: 0 }) }))).toEqual([]);
  });

  it("reports revenue against the previous month, and warns on a drop", () => {
    const up = buildInsights(base({ current: figures({ revenue: 12000 }) })).find((i) => i.key === "revenue");
    expect(up?.tone).toBe("good");
    expect(up?.text).toContain("+20,0%");
    const down = buildInsights(base({ current: figures({ revenue: 8000 }) })).find((i) => i.key === "revenue");
    expect(down?.tone).toBe("warn");
  });

  it("compares a month in progress with the same days of the previous one", () => {
    const i = buildInsights(base({ in_progress: true })).find((x) => x.key === "revenue");
    expect(i?.text).toContain("stessi giorni");
  });

  it("warns when the busiest day uses most of the channels, and only for exclusive channels", () => {
    const days = [{ date: "2026-10-14", groups: 34, radios: 600, deliveries: 30, pickups: 30 }];
    const tight = buildInsights(base({ capacity: { channels: 40, exclusive: true, days, upcoming: [] } })).find((i) => i.key === "capacity");
    expect(tight?.tone).toBe("warn");
    const shared = buildInsights(base({ capacity: { channels: 40, exclusive: false, days, upcoming: [] } })).find((i) => i.key === "capacity");
    expect(shared?.tone).toBe("info");
  });

  it("flags revenue that depends on three guides", () => {
    const top = [
      { name: "A", orders: 30, revenue: 3000, radios: 900 },
      { name: "B", orders: 20, revenue: 2000, radios: 600 },
      { name: "C", orders: 10, revenue: 1000, radios: 300 },
    ];
    expect(buildInsights(base({ guides: { ...base().guides, top } })).find((i) => i.key === "concentration")?.tone).toBe("warn");
    const spread = top.map((g) => ({ ...g, revenue: 500 }));
    expect(buildInsights(base({ guides: { ...base().guides, top: spread } })).find((i) => i.key === "concentration")?.tone).toBe("good");
  });

  it("lists guides to win back, losses, late deliveries and last-minute bookings", () => {
    const d = base({
      current: figures({ lost: 90, on_time: 70, cancelled: 10 }),
      guides: {
        ...base().guides,
        win_back: [{ name: "Anna", orders: 12, revenue: 900, last_order: "2026-08-01", days_since: 80 }],
        losses: [{ name: "Matteo", lost: 5, radios: 100 }],
      },
      operations: { ...base().operations, lead_time: { same_day: 40, days_1_2: 20, days_3_7: 20, days_8_30: 20, over_30: 0 } },
    });
    const k = keys(d);
    expect(k).toEqual(expect.arrayContaining(["win-back", "losses", "punctuality", "cancellations", "last-minute"]));
    expect(buildInsights(d).every((i, idx, all) => idx === 0 || (all[idx - 1].tone === "warn" || i.tone !== "warn"))).toBe(true);
  });

  it("names the months to plan around once there is enough history", () => {
    const trend = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"].map((month, n) => ({
      month,
      orders: 10,
      revenue: [100, 200, 300, 900, 1000, 800, 500][n],
      radios: 100,
    }));
    const i = buildInsights(base({ trend, month: "2026-07" })).find((x) => x.key === "seasonality");
    expect(i?.text).toContain("maggio e aprile");
    expect(i?.text).toContain("gennaio");
  });
});
