import { describe, expect, it } from "vitest";
import { DEFAULT_FILL, autoFill, mergeTouching, type FillOptions } from "./autofill";
import type { DayBounds } from "./coverage";

const DAY: DayBounds = { day: "2026-12-02", start: Date.UTC(2026, 11, 2), end: Date.UTC(2026, 11, 3) };
const t = (hhmm: string, day = DAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  return day.start + (h * 60 + m) * 60_000;
};
const span = (a: string, b: string) => ({ start: t(a), end: t(b) });
const need = (a: string, b: string, riders = 1) => ({ ...span(a, b), riders });
const win = (riderId: string, a: string, b: string) => ({ riderId, ...span(a, b) });
const sh = (riderId: string, a: string, b: string) => ({ riderId, ...span(a, b) });
const RIDERS = [{ id: "a", name: "Anna" }, { id: "b", name: "Bruno" }, { id: "c", name: "Carla" }];
const opts = (over: Partial<FillOptions> = {}): FillOptions => ({ ...DEFAULT_FILL, ...over });
const range = (p: { start: number; end: number }) => `${new Date(p.start).toISOString().slice(11, 16)}-${new Date(p.end).toISOString().slice(11, 16)}`;

describe("auto-fill", () => {
  it("gives the need to the rider who is available", () => {
    const r = autoFill([DAY], RIDERS, [win("a", "08:00", "14:00")], [need("09:00", "13:00")], [], opts());
    expect(r.proposals.map((p) => [p.riderId, range(p)])).toEqual([["a", "09:00-13:00"]]);
    expect(r.gaps).toEqual([]);
    expect(r.required).toBe(240);
    expect(r.coveredBefore).toBe(0);
    expect(r.coveredAfter).toBe(240);
  });

  it("reports what nobody can cover", () => {
    const r = autoFill([DAY], RIDERS, [win("a", "09:00", "11:00")], [need("09:00", "13:00")], [], opts());
    expect(r.proposals.map(range)).toEqual(["09:00-11:00"]);
    expect(r.gaps.map((g) => [range(g), g.missing])).toEqual([["11:00-13:00", 1]]);
    expect(r.coveredAfter).toBe(120);
  });

  it("needs several riders at once: different riders", () => {
    const w = [win("a", "09:00", "13:00"), win("b", "09:00", "13:00"), win("c", "09:00", "13:00")];
    const r = autoFill([DAY], RIDERS, w, [need("09:00", "13:00", 2)], [], opts());
    expect(r.proposals).toHaveLength(2);
    expect(new Set(r.proposals.map((p) => p.riderId)).size).toBe(2);
    expect(r.gaps).toEqual([]);
  });

  it("does not add anything where the need is already covered", () => {
    const r = autoFill([DAY], RIDERS, [win("b", "09:00", "13:00")], [need("09:00", "13:00")], [sh("a", "09:00", "13:00")], opts());
    expect(r.proposals).toEqual([]);
    expect(r.coveredBefore).toBe(240);
  });

  it("covers only what is missing around an existing shift", () => {
    const r = autoFill([DAY], RIDERS, [win("b", "08:00", "18:00")], [need("09:00", "17:00")], [sh("a", "11:00", "14:00")], opts({ minMinutes: 60 }));
    expect(r.proposals.map((p) => [p.riderId, range(p)])).toEqual([["b", "09:00-11:00"], ["b", "14:00-17:00"]]);
  });

  it("never double books a rider who already has a shift", () => {
    const r = autoFill([DAY], RIDERS, [win("a", "09:00", "13:00"), win("b", "09:00", "13:00")], [need("09:00", "13:00", 2)], [sh("a", "09:00", "13:00")], opts());
    expect(r.proposals.map((p) => [p.riderId, range(p)])).toEqual([["b", "09:00-13:00"]]);
  });

  it("makes shifts at least the minimum length when the rider is available that long", () => {
    const r = autoFill([DAY], RIDERS, [win("a", "09:00", "17:00")], [need("09:00", "10:00")], [], opts({ minMinutes: 120 }));
    expect(r.proposals.map(range)).toEqual(["09:00-11:00"]);
  });

  it("but takes a shorter stretch when that is all the rider has", () => {
    const r = autoFill([DAY], RIDERS, [win("a", "09:00", "10:00")], [need("09:00", "10:00")], [], opts({ minMinutes: 120 }));
    expect(r.proposals.map(range)).toEqual(["09:00-10:00"]);
  });

  it("respects the daily limit of a rider and gives the rest to another", () => {
    const w = [win("a", "08:00", "20:00"), win("b", "08:00", "20:00")];
    const r = autoFill([DAY], RIDERS, w, [need("08:00", "20:00")], [], opts({ dailyMaxMinutes: 360, maxMinutes: 360, balance: false }));
    const hours = Object.fromEntries(RIDERS.map((x) => [x.id, r.proposals.filter((p) => p.riderId === x.id).reduce((n, p) => n + (p.end - p.start) / 3_600_000, 0)]));
    expect(hours.a).toBe(6);
    expect(hours.b).toBe(6);
    expect(r.gaps).toEqual([]);
  });

  it("splits a long need into shifts no longer than the maximum", () => {
    const r = autoFill([DAY], RIDERS, [win("a", "06:00", "22:00"), win("b", "06:00", "22:00")], [need("08:00", "20:00")], [], opts({ maxMinutes: 360, dailyMaxMinutes: 720 }));
    expect(r.proposals.every((p) => (p.end - p.start) / 60_000 <= 360)).toBe(true);
    expect(r.gaps).toEqual([]);
  });

  it("balance: the rider with fewer hours goes first", () => {
    const w = [win("a", "09:00", "13:00"), win("b", "09:00", "13:00")];
    const existing = [sh("a", "14:00", "20:00")]; // Anna already has 6 hours, outside the need
    const r = autoFill([DAY], RIDERS, w, [need("09:00", "13:00")], existing, opts({ balance: true }));
    expect(r.proposals.map((p) => p.riderId)).toEqual(["b"]);
  });

  it("without balance the longest stretch wins", () => {
    const w = [win("a", "09:00", "11:00"), win("b", "09:00", "13:00")];
    const existing = [sh("b", "14:00", "20:00")];
    const r = autoFill([DAY], RIDERS, w, [need("09:00", "13:00")], existing, opts({ balance: false }));
    expect(r.proposals.map((p) => [p.riderId, range(p)])).toEqual([["b", "09:00-13:00"]]);
  });

  it("is deterministic", () => {
    const w = [win("a", "09:00", "13:00"), win("b", "09:00", "13:00"), win("c", "09:00", "13:00")];
    const first = autoFill([DAY], RIDERS, w, [need("09:00", "13:00")], [], opts());
    const second = autoFill([DAY], [...RIDERS].reverse(), [...w].reverse(), [need("09:00", "13:00")], [], opts());
    expect(second.proposals).toEqual(first.proposals);
  });

  it("does nothing without needs", () => {
    const r = autoFill([DAY], RIDERS, [win("a", "09:00", "13:00")], [], [], opts());
    expect(r).toEqual({ proposals: [], gaps: [], required: 0, coveredBefore: 0, coveredAfter: 0 });
  });

  it("ignores availability that does not cover a quarter hour completely", () => {
    const r = autoFill([DAY], RIDERS, [{ riderId: "a", start: t("09:00") + 60_000, end: t("13:00") }], [need("09:00", "13:00")], [], opts({ minMinutes: 15 }));
    expect(r.proposals.map(range)).toEqual(["09:15-13:00"]);
    expect(r.gaps.map(range)).toEqual(["09:00-09:15"]);
  });
});

describe("merging", () => {
  it("joins touching shifts of the same rider", () => {
    const merged = mergeTouching([{ riderId: "a", ...span("09:00", "11:00") }, { riderId: "a", ...span("11:00", "13:00") }, { riderId: "b", ...span("11:00", "13:00") }], 600);
    expect(merged.map((p) => [p.riderId, range(p)])).toEqual([["a", "09:00-13:00"], ["b", "11:00-13:00"]]);
  });
  it("keeps them apart when the result would be too long", () => {
    expect(mergeTouching([{ riderId: "a", ...span("09:00", "11:00") }, { riderId: "a", ...span("11:00", "13:00") }], 180)).toHaveLength(2);
  });
});
