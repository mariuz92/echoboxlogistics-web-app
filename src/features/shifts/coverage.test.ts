import { describe, expect, it } from "vitest";
import { countPerSlot, coverageTotals, dayBounds, hourCells, levelOf, needPerSlot, slotCount } from "./coverage";

const ROME = "Europe/Rome";
const at = (b: { start: number }, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return b.start + (h * 60 + m) * 60_000;
};

describe("day bounds", () => {
  it("a normal day has 96 quarter hours", () => {
    expect(slotCount(dayBounds("2026-11-25", ROME))).toBe(96);
  });
  it("a clock-change day has 92 or 100", () => {
    expect(slotCount(dayBounds("2026-03-29", ROME))).toBe(92); // clocks go forward
    expect(slotCount(dayBounds("2026-10-25", ROME))).toBe(100); // clocks go back
  });
});

describe("coverage", () => {
  const b = dayBounds("2026-11-25", ROME);
  it("counts riders per quarter hour", () => {
    const counts = countPerSlot([{ start: at(b, "09:00"), end: at(b, "11:00") }, { start: at(b, "10:00"), end: at(b, "12:00") }], b);
    expect(counts[at(b, "08:45") === b.start ? 0 : 35]).toBe(0); // 08:45
    expect(counts[36]).toBe(1); // 09:00
    expect(counts[40]).toBe(2); // 10:00
    expect(counts[44]).toBe(1); // 11:00
    expect(counts[48]).toBe(0); // 12:00
  });
  it("needs take the largest value where blocks meet", () => {
    const need = needPerSlot([{ start: at(b, "09:00"), end: at(b, "13:00"), riders: 2 }, { start: at(b, "13:00"), end: at(b, "15:00"), riders: 3 }], b);
    expect(need[36]).toBe(2);
    expect(need[51]).toBe(2);
    expect(need[52]).toBe(3);
    expect(need[60]).toBe(0);
  });
  it("groups the quarter hours into hours with the least and most riders", () => {
    const have = countPerSlot([{ start: at(b, "09:30"), end: at(b, "11:00") }], b);
    const need = needPerSlot([{ start: at(b, "09:00"), end: at(b, "11:00"), riders: 1 }], b);
    const cells = hourCells(have, need, b, ROME);
    expect(cells).toHaveLength(24);
    const nine = cells.find((c) => c.label === "09")!;
    expect(nine).toMatchObject({ have: 0, haveMax: 1, need: 1 });
    expect(levelOf(nine)).toBe("partial");
    expect(levelOf(cells.find((c) => c.label === "10")!)).toBe("covered");
    expect(levelOf(cells.find((c) => c.label === "12")!)).toBe("idle");
  });
  it("an hour with nobody is short", () => {
    expect(levelOf({ have: 0, haveMax: 0, need: 2 })).toBe("short");
    expect(levelOf({ have: 1, haveMax: 1, need: 2 })).toBe("short");
  });
  it("totals what is needed, covered and missing", () => {
    const have = countPerSlot([{ start: at(b, "09:00"), end: at(b, "10:00") }, { start: at(b, "09:00"), end: at(b, "10:00") }], b);
    const need = needPerSlot([{ start: at(b, "09:00"), end: at(b, "11:00"), riders: 1 }], b);
    // need: 1 rider for 2 h = 120; covered 60 (the second rider does not count twice); missing 60
    expect(coverageTotals(have, need)).toEqual({ required: 120, covered: 60, missing: 60 });
  });
});
