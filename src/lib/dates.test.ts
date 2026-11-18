import { describe, expect, it } from "vitest";
import { dayjs, getPeriodRange, isoToWallClock, wallClockToIso } from "./dates";

describe("getPeriodRange (Europe/Rome)", () => {
  it("returns the local day as [00:00, 24:00) in UTC terms (winter, UTC+1)", () => {
    const range = getPeriodRange(dayjs("2026-01-15"), "day", "Europe/Rome");
    expect(range.from).toBe("2026-01-14T23:00:00.000Z");
    expect(range.to).toBe("2026-01-15T23:00:00.000Z");
  });

  it("follows daylight saving time (summer, UTC+2)", () => {
    const range = getPeriodRange(dayjs("2026-07-15"), "day", "Europe/Rome");
    expect(range.from).toBe("2026-07-14T22:00:00.000Z");
    expect(range.to).toBe("2026-07-15T22:00:00.000Z");
  });

  it("returns a 23 hour day when clocks go forward", () => {
    const range = getPeriodRange(dayjs("2026-03-29"), "day", "Europe/Rome");
    const hours = dayjs(range.to).diff(dayjs(range.from), "hour");
    expect(hours).toBe(23);
  });

  it("covers a whole month", () => {
    const range = getPeriodRange(dayjs("2026-02-10"), "month", "Europe/Rome");
    expect(range.from).toBe("2026-01-31T23:00:00.000Z");
    expect(range.to).toBe("2026-02-28T23:00:00.000Z");
  });

  it("covers a whole year", () => {
    const range = getPeriodRange(dayjs("2026-06-01"), "year", "Europe/Rome");
    expect(range.from).toBe("2025-12-31T23:00:00.000Z");
    expect(range.to).toBe("2026-12-31T23:00:00.000Z");
  });

  it("starts weeks on Monday", () => {
    // Wednesday 2026-11-18 -> week of Monday 2026-11-16
    const range = getPeriodRange(dayjs("2026-11-18"), "week", "Europe/Rome");
    expect(range.from).toBe("2026-11-15T23:00:00.000Z");
    expect(range.to).toBe("2026-11-22T23:00:00.000Z");

    // Sunday 2026-11-22 still belongs to that week
    const sunday = getPeriodRange(dayjs("2026-11-22"), "week", "Europe/Rome");
    expect(sunday.from).toBe(range.from);
  });
});

describe("wall clock conversion", () => {
  it("round-trips an instant through the picker representation", () => {
    const iso = "2026-07-15T07:30:00.000Z"; // 09:30 in Rome (UTC+2)
    const wall = isoToWallClock(iso, "Europe/Rome");
    expect(wall.format("HH:mm")).toBe("09:30");
    expect(wallClockToIso(wall, "Europe/Rome")).toBe(iso);
  });

  it("interprets picked times in the tenant timezone", () => {
    const picked = dayjs("2026-01-10T09:00:00"); // what the user typed: 09:00
    expect(wallClockToIso(picked, "Europe/Rome")).toBe("2026-01-10T08:00:00.000Z");
    expect(wallClockToIso(picked, "America/New_York")).toBe("2026-01-10T14:00:00.000Z");
  });
});
