import { dayjs, getPeriodRange, type DateRange, type Dayjs } from "../../lib/dates";
import { numberLocale } from "../../i18n";

/**
 * Time helpers for rider availability and shifts. Everything follows the company's time zone: a
 * "day" is a calendar day there, and times are typed as HH:mm on a 15-minute grid.
 */

/** A window typed by the rider or the admin: "09:00" to "13:00" ("24:00" = midnight). */
export interface TimeWindow {
  start: string;
  end: string;
}

export const MINUTE_STEP = 15;

/** Monday of the week containing `date`, as a plain date. */
export function weekStartOf(date: Dayjs): Dayjs {
  const day = dayjs(date.format("YYYY-MM-DD"));
  return day.subtract((day.day() + 6) % 7, "day");
}

/** The seven days of a week as "YYYY-MM-DD" keys. */
export function weekDayKeys(weekStart: Dayjs): string[] {
  return Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day").format("YYYY-MM-DD"));
}

/** [from, to) of the week, ready for the API (company time zone). */
export function weekRange(weekStart: Dayjs, tz: string): DateRange {
  return getPeriodRange(weekStart, "week", tz);
}

/** The calendar day ("YYYY-MM-DD") of an instant in the company's time zone. */
export function dayKeyOf(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format("YYYY-MM-DD");
}

/** "HH:mm" of an instant in the company's time zone. */
export function timeOf(iso: string, tz: string): string {
  return dayjs(iso).tz(tz).format("HH:mm");
}

/** The instant of a day and a time in the company's time zone ("24:00" = the next midnight). */
export function instantOf(day: string, time: string, tz: string): string {
  // "24:00" is the next local midnight (not 24 hours later: a clock-change day is 23 or 25 hours long)
  if (time === "24:00") return dayjs.tz(`${dayjs(day).add(1, "day").format("YYYY-MM-DD")} 00:00`, tz).toISOString();
  return dayjs.tz(`${day} ${time}`, tz).toISOString();
}

/** A window of a day as the instants the database stores. */
export function windowToInstants(day: string, window: TimeWindow, tz: string): { start: string; end: string } {
  return { start: instantOf(day, window.start, tz), end: instantOf(day, window.end, tz) };
}

/** An end time typed as 00:00 means midnight, the end of the day. */
export function normalizeEnd(end: string): string {
  return end === "00:00" ? "24:00" : end;
}

/** Whether a window is well formed: on the grid and ending after it starts. */
export function isValidWindow(window: TimeWindow): boolean {
  const minutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const re = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
  if (!re.test(window.start) || !re.test(window.end) || window.start === "24:00") return false;
  if (minutes(window.start) % MINUTE_STEP !== 0 || minutes(window.end) % MINUTE_STEP !== 0) return false;
  return minutes(window.end) > minutes(window.start);
}

/** True if two windows of the same day overlap. */
export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Whole minutes between two instants. */
export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
}

/** "7 h 30", "2 h", "45 min": hours for people. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, "0")}`;
}

/** 450 minutes -> "7,5" (decimal hours, the number a payroll sheet wants). */
export function formatHours(minutes: number): string {
  return (Math.round((minutes / 60) * 100) / 100).toLocaleString(numberLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

interface Slot {
  start_at: string;
  end_at: string;
}

/**
 * Whether a shift is fully inside the availability the rider gave (the union of their windows).
 * A shift outside it is allowed (the admin decides) but worth a warning.
 */
export function isCovered(shift: Slot, windows: Slot[]): boolean {
  const start = Date.parse(shift.start_at);
  const end = Date.parse(shift.end_at);
  const sorted = windows
    .map((w) => [Date.parse(w.start_at), Date.parse(w.end_at)] as const)
    .sort((a, b) => a[0] - b[0]);
  let cursor = start;
  for (const [ws, we] of sorted) {
    if (we <= cursor) continue;
    if (ws > cursor) return false;
    cursor = we;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

/** The availability windows that no shift touches yet. */
export function uncovered<A extends Slot>(windows: A[], shifts: Slot[]): A[] {
  return windows.filter((w) => !shifts.some((s) => Date.parse(s.start_at) < Date.parse(w.end_at) && Date.parse(w.start_at) < Date.parse(s.end_at)));
}

/** A shift was changed after it was planned (extra or shorter hours). */
export function isAdjusted(shift: { start_at: string; end_at: string; planned_start_at: string; planned_end_at: string }): boolean {
  return shift.start_at !== shift.planned_start_at || shift.end_at !== shift.planned_end_at;
}

/** Minutes added (positive) or taken away (negative) by the changes made to a shift. */
export function adjustmentMinutes(shift: { start_at: string; end_at: string; planned_start_at: string; planned_end_at: string }): number {
  return minutesBetween(shift.start_at, shift.end_at) - minutesBetween(shift.planned_start_at, shift.planned_end_at);
}

/**
 * The instants of a shift typed as a day and two times. An end that is not after the start
 * (e.g. 22:00 to 02:00, or to 00:00) belongs to the next day, so a night shift is one shift.
 */
export function shiftInstants(day: string, start: string, end: string, tz: string): { start: string; end: string } {
  const startAt = instantOf(day, start, tz);
  const next = dayjs(day).add(1, "day").format("YYYY-MM-DD");
  const sameDay = end === "24:00" || end > start;
  return { start: startAt, end: sameDay ? instantOf(day, end, tz) : instantOf(next, end, tz) };
}

/** The longest a single shift or window may last (the database enforces it too). */
export const MAX_SLOT_MINUTES = 16 * 60;

/** Minutes of a shift typed as two times on a day (end not after start = next day). */
export function slotMinutes(day: string, start: string, end: string, tz: string): number {
  const { start: s, end: e } = shiftInstants(day, start, end, tz);
  return minutesBetween(s, e);
}

/** "09:00–13:00" for display; the end at midnight reads 24:00. */
export function timeRange(startIso: string, endIso: string, tz: string): string {
  const end = timeOf(endIso, tz);
  const endsAtMidnight = end === "00:00" && dayKeyOf(endIso, tz) !== dayKeyOf(startIso, tz);
  return `${timeOf(startIso, tz)}–${endsAtMidnight ? "24:00" : end}`;
}

/** A stored slot as the "HH:mm" window the editors use (an end at midnight reads 24:00). */
export function toWindow(slot: Slot, tz: string): TimeWindow {
  const end = timeOf(slot.end_at, tz);
  const endsAtMidnight = end === "00:00" && dayKeyOf(slot.end_at, tz) !== dayKeyOf(slot.start_at, tz);
  return { start: timeOf(slot.start_at, tz), end: endsAtMidnight ? "24:00" : end };
}

/** Why a day's windows cannot be saved yet (an overlap or a bad time), or null. */
export function windowsProblem(windows: TimeWindow[]): "invalid" | "overlap" | "too_many" | null {
  if (windows.length > 6) return "too_many";
  if (windows.some((w) => !isValidWindow(w))) return "invalid";
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) if (windowsOverlap(sorted[i - 1], sorted[i])) return "overlap";
  return null;
}
