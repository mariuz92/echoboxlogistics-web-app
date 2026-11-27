import { instantOf, timeOf } from "./time";

/**
 * Coverage of a day: how many riders are on a shift in each quarter of an hour, compared with how
 * many are needed. Pure functions over millisecond timestamps, so they are easy to test.
 */

export const SLOT_MS = 15 * 60_000;

/** A calendar day of the company, as instants ([start, end), 23 to 25 hours on a clock-change day). */
export interface DayBounds {
  day: string;
  start: number;
  end: number;
}

export interface Span {
  start: number;
  end: number;
}

export interface NeedSpan extends Span {
  riders: number;
}

export function dayBounds(day: string, tz: string): DayBounds {
  return {
    day,
    start: Date.parse(instantOf(day, "00:00", tz)),
    end: Date.parse(instantOf(day, "24:00", tz)),
  };
}

export const slotCount = (b: DayBounds) => Math.round((b.end - b.start) / SLOT_MS);

export function toSpan(slot: { start_at: string; end_at: string }): Span {
  return { start: Date.parse(slot.start_at), end: Date.parse(slot.end_at) };
}

/** For each quarter hour of the day, how many of the spans cover it completely. */
export function countPerSlot(spans: Span[], b: DayBounds): number[] {
  const out = new Array<number>(slotCount(b)).fill(0);
  for (const s of spans) {
    const from = Math.max(0, Math.floor((s.start - b.start) / SLOT_MS));
    const to = Math.min(out.length, Math.ceil((s.end - b.start) / SLOT_MS));
    for (let k = from; k < to; k++) out[k] += 1;
  }
  return out;
}

/** For each quarter hour, the riders needed (blocks never overlap, the largest wins if they do). */
export function needPerSlot(needs: NeedSpan[], b: DayBounds): number[] {
  const out = new Array<number>(slotCount(b)).fill(0);
  for (const n of needs) {
    const from = Math.max(0, Math.floor((n.start - b.start) / SLOT_MS));
    const to = Math.min(out.length, Math.ceil((n.end - b.start) / SLOT_MS));
    for (let k = from; k < to; k++) out[k] = Math.max(out[k], n.riders);
  }
  return out;
}

export interface HourCell {
  start: number;
  end: number;
  /** "09" for the hour starting at 09:00. */
  label: string;
  /** The fewest riders on shift at any moment of the hour. */
  have: number;
  /** The most riders on shift at any moment of the hour. */
  haveMax: number;
  /** The most riders needed at any moment of the hour. */
  need: number;
}

/** Groups the quarter hours into the hours of the day. */
export function hourCells(have: number[], need: number[], b: DayBounds, tz: string): HourCell[] {
  const cells: HourCell[] = [];
  for (let k = 0; k < have.length; k += 4) {
    const range = have.slice(k, k + 4);
    cells.push({
      start: b.start + k * SLOT_MS,
      end: Math.min(b.end, b.start + (k + 4) * SLOT_MS),
      label: timeOf(new Date(b.start + k * SLOT_MS).toISOString(), tz).slice(0, 2),
      have: Math.min(...range),
      haveMax: Math.max(...range),
      need: Math.max(...need.slice(k, k + 4)),
    });
  }
  return cells;
}

export type CoverageLevel = "idle" | "covered" | "partial" | "short";

/**
 * How an hour compares with what is needed:
 * idle (nobody needed), covered (enough all hour), partial (enough only for part of it), short (not enough).
 */
export function levelOf(cell: Pick<HourCell, "have" | "haveMax" | "need">): CoverageLevel {
  if (cell.need === 0) return "idle";
  if (cell.have >= cell.need) return "covered";
  return cell.haveMax >= cell.need ? "partial" : "short";
}

/** Minutes of need and how many of them are covered (a rider over the need does not count twice). */
export function coverageTotals(have: number[], need: number[]): { required: number; covered: number; missing: number } {
  let required = 0;
  let covered = 0;
  for (let k = 0; k < need.length; k++) {
    required += need[k];
    covered += Math.min(need[k], have[k]);
  }
  const minutes = SLOT_MS / 60_000;
  return { required: required * minutes, covered: covered * minutes, missing: (required - covered) * minutes };
}
