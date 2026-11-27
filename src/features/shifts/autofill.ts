import { SLOT_MS, countPerSlot, needPerSlot, slotCount, type DayBounds, type NeedSpan, type Span } from "./coverage";

/**
 * Auto-fill: proposes shifts that cover the staffing needs using the riders' availability.
 * It only proposes: nothing is saved until the admin accepts, and every shift can be edited after.
 *
 * Each step takes the first quarter hour that is short of riders and gives it to a rider who is
 * available, free, and under their daily limit, extending the shift while the need continues
 * (and up to the minimum length, so nobody gets a 15-minute shift). With "balance" on, among the
 * riders who can cover a decent stretch the one with the fewest hours so far is chosen.
 */

export interface FillRider {
  id: string;
  name: string;
}

export interface FillWindow extends Span {
  riderId: string;
}

export interface FillShift extends Span {
  riderId: string;
}

export interface FillOptions {
  /** A shift is made at least this long when the rider is available that long. */
  minMinutes: number;
  /** The longest single shift. */
  maxMinutes: number;
  /** The most minutes a rider works in a day (existing shifts included). */
  dailyMaxMinutes: number;
  /** Spread the hours between riders instead of giving the longest stretches to the same ones. */
  balance: boolean;
}

export const DEFAULT_FILL: FillOptions = { minMinutes: 120, maxMinutes: 10 * 60, dailyMaxMinutes: 10 * 60, balance: true };

export interface Proposal extends Span {
  riderId: string;
}

export interface Gap extends Span {
  /** Riders still missing in this stretch. */
  missing: number;
}

export interface FillResult {
  proposals: Proposal[];
  /** What could not be covered (nobody available). */
  gaps: Gap[];
  /** Minutes of need in the period, and how many were covered before and after. */
  required: number;
  coveredBefore: number;
  coveredAfter: number;
}

const MIN = SLOT_MS / 60_000;

function slotsOf(spans: Span[], b: DayBounds, whole: boolean): boolean[] {
  const out = new Array<boolean>(slotCount(b)).fill(false);
  for (const s of spans) {
    for (let k = 0; k < out.length; k++) {
      const from = b.start + k * SLOT_MS;
      const to = from + SLOT_MS;
      if (whole ? s.start <= from && s.end >= to : s.start < to && s.end > from) out[k] = true;
    }
  }
  return out;
}

export function autoFill(
  days: DayBounds[],
  riders: FillRider[],
  windows: FillWindow[],
  needs: NeedSpan[],
  shifts: FillShift[],
  options: FillOptions = DEFAULT_FILL,
): FillResult {
  const order = [...riders].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const total = new Map<string, number>(order.map((r) => [r.id, 0]));
  const proposals: Proposal[] = [];
  const gaps: Gap[] = [];
  let required = 0;
  let coveredBefore = 0;
  let coveredAfter = 0;

  // hours already given in the period count for fairness
  for (const s of shifts) if (total.has(s.riderId)) total.set(s.riderId, total.get(s.riderId)! + (s.end - s.start) / 60_000);

  for (const day of days) {
    const K = slotCount(day);
    const need = needPerSlot(needs, day);
    if (!need.some((n) => n > 0)) continue;
    const have = countPerSlot(shifts, day);
    const before = have.map((h, k) => Math.min(h, need[k]));

    const avail = new Map<string, boolean[]>();
    const busy = new Map<string, boolean[]>();
    const worked = new Map<string, number>();
    for (const r of order) {
      avail.set(r.id, slotsOf(windows.filter((w) => w.riderId === r.id), day, true));
      const mine = shifts.filter((s) => s.riderId === r.id);
      const b = slotsOf(mine, day, false);
      busy.set(r.id, b);
      worked.set(r.id, b.filter(Boolean).length * MIN);
    }

    const dead = new Array<boolean>(K).fill(false);
    for (;;) {
      const k = need.findIndex((n, i) => n > have[i] && !dead[i]);
      if (k < 0) break;

      const options_: { rider: FillRider; len: number; gain: number }[] = [];
      for (const r of order) {
        const a = avail.get(r.id)!;
        const b = busy.get(r.id)!;
        if (!a[k] || b[k]) continue;
        let len = 0;
        let gain = 0;
        for (let j = k; j < K && a[j] && !b[j]; j++) {
          const minutes = (len + 1) * MIN;
          if (minutes > options.maxMinutes || worked.get(r.id)! + minutes > options.dailyMaxMinutes) break;
          if (!(need[j] > have[j]) && len * MIN >= options.minMinutes) break;
          if (need[j] > have[j]) gain++;
          len++;
        }
        if (len > 0 && gain > 0) options_.push({ rider: r, len, gain });
      }
      if (options_.length === 0) {
        dead[k] = true;
        continue;
      }

      const hours = (o: { rider: FillRider }) => total.get(o.rider.id)!;
      let pick = options_[0];
      if (options.balance) {
        const decent = Math.min(Math.max(...options_.map((o) => o.gain)), options.minMinutes / MIN);
        const eligible = options_.filter((o) => o.gain >= decent);
        pick = eligible.reduce((best, o) => (hours(o) < hours(best) || (hours(o) === hours(best) && o.gain > best.gain) ? o : best));
      } else {
        pick = options_.reduce((best, o) => (o.gain > best.gain || (o.gain === best.gain && hours(o) < hours(best)) ? o : best));
      }

      const b = busy.get(pick.rider.id)!;
      for (let j = k; j < k + pick.len; j++) {
        b[j] = true;
        have[j] += 1;
      }
      worked.set(pick.rider.id, worked.get(pick.rider.id)! + pick.len * MIN);
      total.set(pick.rider.id, total.get(pick.rider.id)! + pick.len * MIN);
      proposals.push({ riderId: pick.rider.id, start: day.start + k * SLOT_MS, end: day.start + (k + pick.len) * SLOT_MS });
    }

    for (let k = 0; k < K; k++) {
      required += need[k] * MIN;
      coveredBefore += before[k] * MIN;
      coveredAfter += Math.min(need[k], have[k]) * MIN;
    }
    for (let k = 0; k < K; ) {
      const missing = need[k] - have[k];
      if (missing <= 0) {
        k++;
        continue;
      }
      let j = k;
      while (j < K && need[j] - have[j] === missing) j++;
      gaps.push({ start: day.start + k * SLOT_MS, end: day.start + j * SLOT_MS, missing });
      k = j;
    }
  }

  return { proposals: mergeTouching(proposals, options.maxMinutes), gaps, required, coveredBefore, coveredAfter };
}

/** Shifts of the same rider that touch become one shift (when it is not too long). */
export function mergeTouching(list: Proposal[], maxMinutes: number): Proposal[] {
  const sorted = [...list].sort((a, b) => a.riderId.localeCompare(b.riderId) || a.start - b.start);
  const out: Proposal[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && last.riderId === p.riderId && last.end === p.start && (p.end - last.start) / 60_000 <= maxMinutes) {
      last.end = p.end;
    } else out.push({ ...p });
  }
  return out.sort((a, b) => a.start - b.start || a.riderId.localeCompare(b.riderId));
}
