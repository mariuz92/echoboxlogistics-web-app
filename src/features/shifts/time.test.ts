import { describe, expect, it } from "vitest";
import { dayjs } from "../../lib/dates";
import {
  adjustmentMinutes, dayKeyOf, formatDuration, instantOf, isAdjusted, isCovered, isValidWindow, minutesBetween,
  normalizeEnd, shiftInstants, slotMinutes, timeOf, timeRange, toWindow, uncovered, windowsProblem, weekDayKeys, weekStartOf, windowToInstants, windowsOverlap,
} from "./time";

const ROME = "Europe/Rome";

describe("weeks", () => {
  it("start on Monday", () => {
    expect(weekStartOf(dayjs("2026-11-27")).format("YYYY-MM-DD")).toBe("2026-11-23"); // a Friday
    expect(weekStartOf(dayjs("2026-11-29")).format("YYYY-MM-DD")).toBe("2026-11-23"); // a Sunday
    expect(weekStartOf(dayjs("2026-11-23")).format("YYYY-MM-DD")).toBe("2026-11-23");
  });
  it("have seven days", () => {
    const days = weekDayKeys(dayjs("2026-11-23"));
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-11-23");
    expect(days[6]).toBe("2026-11-29");
  });
});

describe("company time zone", () => {
  it("turns a day and a time into the instant stored", () => {
    expect(instantOf("2026-11-25", "09:00", ROME)).toBe("2026-11-25T08:00:00.000Z"); // CET, UTC+1
    expect(instantOf("2026-07-25", "09:00", ROME)).toBe("2026-07-25T07:00:00.000Z"); // CEST, UTC+2
  });
  it("24:00 is the next midnight", () => {
    expect(instantOf("2026-11-25", "24:00", ROME)).toBe("2026-11-25T23:00:00.000Z");
  });
  it("24:00 is the local midnight even on a clock-change day", () => {
    expect(instantOf("2026-03-29", "24:00", ROME)).toBe("2026-03-29T22:00:00.000Z"); // 00:00 CEST on the 30th
    expect(instantOf("2026-10-25", "24:00", ROME)).toBe("2026-10-25T23:00:00.000Z"); // 00:00 CET on the 26th
    expect(slotMinutes("2026-03-29", "00:00", "24:00", ROME)).toBe(23 * 60); // a 23-hour day
  });
  it("reads the day and the time back", () => {
    expect(dayKeyOf("2026-11-25T23:30:00.000Z", ROME)).toBe("2026-11-26"); // past midnight in Rome
    expect(timeOf("2026-11-25T08:00:00.000Z", ROME)).toBe("09:00");
  });
  it("converts a window", () => {
    expect(windowToInstants("2026-11-25", { start: "09:00", end: "13:30" }, ROME)).toEqual({
      start: "2026-11-25T08:00:00.000Z", end: "2026-11-25T12:30:00.000Z",
    });
  });
});

describe("windows", () => {
  it("accept times on the 15-minute grid", () => {
    expect(isValidWindow({ start: "09:00", end: "13:15" })).toBe(true);
    expect(isValidWindow({ start: "16:00", end: "24:00" })).toBe(true);
  });
  it("reject others", () => {
    expect(isValidWindow({ start: "09:10", end: "13:00" })).toBe(false);
    expect(isValidWindow({ start: "13:00", end: "09:00" })).toBe(false);
    expect(isValidWindow({ start: "09:00", end: "09:00" })).toBe(false);
    expect(isValidWindow({ start: "24:00", end: "24:00" })).toBe(false);
    expect(isValidWindow({ start: "9:00", end: "12:00" })).toBe(false);
  });
  it("detect overlaps but not windows that touch", () => {
    expect(windowsOverlap({ start: "09:00", end: "12:00" }, { start: "11:00", end: "14:00" })).toBe(true);
    expect(windowsOverlap({ start: "09:00", end: "12:00" }, { start: "12:00", end: "14:00" })).toBe(false);
  });
  it("treat an end of 00:00 as midnight", () => {
    expect(normalizeEnd("00:00")).toBe("24:00");
    expect(normalizeEnd("13:00")).toBe("13:00");
  });
});

describe("hours", () => {
  it("count minutes between instants", () => {
    expect(minutesBetween("2026-11-25T08:00:00Z", "2026-11-25T12:30:00Z")).toBe(270);
  });
  it("show hours for people", () => {
    expect(formatDuration(450)).toBe("7 h 30");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(65)).toBe("1 h 05");
    expect(formatDuration(0)).toBe("0 min");
  });
});

describe("coverage by availability", () => {
  const w = (a: string, b: string) => ({ start_at: `2026-11-25T${a}:00Z`, end_at: `2026-11-25T${b}:00Z` });
  it("a shift inside one window is covered", () => {
    expect(isCovered(w("09:00", "12:00"), [w("08:00", "13:00")])).toBe(true);
  });
  it("a shift sticking out is not", () => {
    expect(isCovered(w("09:00", "14:00"), [w("08:00", "13:00")])).toBe(false);
    expect(isCovered(w("09:00", "12:00"), [])).toBe(false);
  });
  it("two touching windows cover a shift across them", () => {
    expect(isCovered(w("09:00", "15:00"), [w("08:00", "12:00"), w("12:00", "16:00")])).toBe(true);
  });
  it("a gap between windows breaks the coverage", () => {
    expect(isCovered(w("09:00", "15:00"), [w("08:00", "11:00"), w("12:00", "16:00")])).toBe(false);
  });
  it("lists the availability nobody covers yet", () => {
    const windows = [w("09:00", "12:00"), w("14:00", "18:00")];
    expect(uncovered(windows, [w("10:00", "11:00")])).toEqual([windows[1]]);
    expect(uncovered(windows, [])).toEqual(windows);
  });
});

describe("adjustments", () => {
  const base = { planned_start_at: "2026-11-25T08:00:00Z", planned_end_at: "2026-11-25T12:00:00Z" };
  it("a shift equal to the plan is not adjusted", () => {
    expect(isAdjusted({ ...base, start_at: base.planned_start_at, end_at: base.planned_end_at })).toBe(false);
    expect(adjustmentMinutes({ ...base, start_at: base.planned_start_at, end_at: base.planned_end_at })).toBe(0);
  });
  it("shows extra hours as positive and shorter hours as negative", () => {
    expect(adjustmentMinutes({ ...base, start_at: base.planned_start_at, end_at: "2026-11-25T13:00:00Z" })).toBe(60);
    expect(adjustmentMinutes({ ...base, start_at: "2026-11-25T08:30:00Z", end_at: base.planned_end_at })).toBe(-30);
    expect(isAdjusted({ ...base, start_at: "2026-11-25T08:30:00Z", end_at: base.planned_end_at })).toBe(true);
  });
});

describe("shifts typed as two times", () => {
  it("end after start is the same day", () => {
    expect(shiftInstants("2026-11-25", "09:00", "13:00", ROME)).toEqual({
      start: "2026-11-25T08:00:00.000Z", end: "2026-11-25T12:00:00.000Z",
    });
  });
  it("end at midnight is the end of the day", () => {
    expect(slotMinutes("2026-11-25", "18:00", "24:00", ROME)).toBe(360);
  });
  it("end not after start is the next day (night shift)", () => {
    expect(slotMinutes("2026-11-25", "22:00", "02:00", ROME)).toBe(240);
    expect(slotMinutes("2026-11-25", "22:00", "00:00", ROME)).toBe(120);
  });
  it("follows the clock change", () => {
    // 2026-10-25: the clocks go back at 03:00, the night is an hour longer
    expect(slotMinutes("2026-10-24", "22:00", "06:00", ROME)).toBe(9 * 60);
  });
  it("shows a range, with 24:00 for midnight", () => {
    expect(timeRange("2026-11-25T08:00:00.000Z", "2026-11-25T12:30:00.000Z", ROME)).toBe("09:00–13:30");
    expect(timeRange("2026-11-25T15:00:00.000Z", "2026-11-25T23:00:00.000Z", ROME)).toBe("16:00–24:00");
  });
});

describe("windows of a day", () => {
  it("reads a stored slot back as typed times", () => {
    expect(toWindow({ start_at: "2026-11-25T08:00:00Z", end_at: "2026-11-25T12:00:00Z" }, ROME)).toEqual({ start: "09:00", end: "13:00" });
    expect(toWindow({ start_at: "2026-11-25T15:00:00Z", end_at: "2026-11-25T23:00:00Z" }, ROME)).toEqual({ start: "16:00", end: "24:00" });
  });
  it("accepts several separate windows", () => {
    expect(windowsProblem([{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }])).toBeNull();
    expect(windowsProblem([])).toBeNull();
  });
  it("flags overlaps, bad times and too many windows", () => {
    expect(windowsProblem([{ start: "09:00", end: "12:00" }, { start: "11:00", end: "14:00" }])).toBe("overlap");
    expect(windowsProblem([{ start: "12:00", end: "09:00" }])).toBe("invalid");
    const seven = Array.from({ length: 7 }, (_, i) => ({ start: `${String(i * 3).padStart(2, "0")}:00`, end: `${String(i * 3 + 1).padStart(2, "0")}:00` }));
    expect(windowsProblem(seven)).toBe("too_many");
  });
});
