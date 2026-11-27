import { supabase } from "../../lib/supabase";
import type { DateRange } from "../../lib/dates";
import type { Tables } from "../../types/database.types";
import type { TimeWindow } from "./time";

export type RiderAvailability = Tables<"rider_availability">;
export type RiderShift = Tables<"rider_shifts">;
export type RiderShiftEvent = Tables<"rider_shift_events">;
export type ShiftNeed = Tables<"shift_needs">;

/** One shift as the hours report lists it. */
export interface HoursItem {
  shift_id: string;
  /** The day the shift starts in the company's time zone, "YYYY-MM-DD". */
  day: string;
  start_at: string;
  end_at: string;
  planned_start_at: string;
  planned_end_at: string;
  note: string;
}

/** The hours of one rider in a period: what is paid and what was planned first. */
export interface RiderHours {
  rider_id: string;
  name: string;
  paid_minutes: number;
  planned_minutes: number;
  shifts: number;
  /** How many shifts were changed after they were planned. */
  adjusted: number;
  items: HoursItem[];
}

const PAGE = 1000;

/** PostgREST returns 1000 rows at most per request: read the pages until the last one. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Availability windows that touch [from, to). Riders only see their own (RLS). */
export function listAvailability(range: DateRange): Promise<RiderAvailability[]> {
  return fetchAll<RiderAvailability>((a, b) =>
    supabase
      .from("rider_availability")
      .select("*")
      .lt("start_at", range.to)
      .gt("end_at", range.from)
      .order("start_at", { ascending: true })
      .order("id", { ascending: true })
      .range(a, b),
  );
}

/** Shifts that touch [from, to). Riders only see their own (RLS). */
export function listShifts(range: DateRange): Promise<RiderShift[]> {
  return fetchAll<RiderShift>((a, b) =>
    supabase
      .from("rider_shifts")
      .select("*")
      .lt("start_at", range.to)
      .gt("end_at", range.from)
      .order("start_at", { ascending: true })
      .order("id", { ascending: true })
      .range(a, b),
  );
}

/** The history of a shift (who changed which times, when). Admins only. */
export async function listShiftEvents(shiftId: string): Promise<RiderShiftEvent[]> {
  const { data, error } = await supabase
    .from("rider_shift_events")
    .select("*")
    .eq("shift_id", shiftId)
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Replaces the availability of one day. A rider can only change their own days (today or later);
 * an admin passes `riderId` to do it for a rider. No windows = not available that day.
 */
export async function saveAvailability(day: string, windows: TimeWindow[], riderId?: string): Promise<number> {
  const { data, error } = await supabase.rpc("save_availability", {
    p_day: day,
    p_windows: windows as unknown as never,
    ...(riderId ? { p_rider_id: riderId } : {}),
  });
  if (error) throw error;
  return data ?? 0;
}

export interface ShiftInput {
  riderId: string;
  startAt: string;
  endAt: string;
  note?: string;
  /** Present when an existing shift is being changed. */
  shiftId?: string;
}

/** Creates a shift or, with `shiftId`, changes the times of an existing one. Admins only. */
export async function saveShift(input: ShiftInput): Promise<string> {
  const { data, error } = await supabase.rpc("admin_save_shift", {
    p_rider_id: input.riderId,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_note: input.note ?? "",
    ...(input.shiftId ? { p_shift_id: input.shiftId } : {}),
  });
  if (error) throw error;
  return data;
}

export async function deleteShift(shiftId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_shift", { p_shift_id: shiftId });
  if (error) throw error;
}

/**
 * Turns the availability of the days [from, to] into shifts (one per window nobody covers yet).
 * Returns how many shifts were created.
 */
export async function coverFromAvailability(from: string, to: string, riderId?: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_cover_from_availability", {
    p_from: from,
    p_to: to,
    ...(riderId ? { p_rider_id: riderId } : {}),
  });
  if (error) throw error;
  return data ?? 0;
}

/** Hours per rider for the days [from, to] ("YYYY-MM-DD"). Admins only. */
export async function getRiderHours(from: string, to: string): Promise<RiderHours[]> {
  const { data, error } = await supabase.rpc("get_rider_hours", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as unknown as RiderHours[];
}

/** The staffing needs (riders needed per block of time) that touch [from, to). Admins only. */
export function listNeeds(range: DateRange): Promise<ShiftNeed[]> {
  return fetchAll<ShiftNeed>((a, b) =>
    supabase
      .from("shift_needs")
      .select("*")
      .lt("start_at", range.to)
      .gt("end_at", range.from)
      .order("start_at", { ascending: true })
      .range(a, b),
  );
}

export interface NeedInput {
  startAt: string;
  endAt: string;
  ridersNeeded: number;
  /** Present when an existing block is being changed. */
  needId?: string;
}

export async function saveNeed(input: NeedInput): Promise<string> {
  const { data, error } = await supabase.rpc("admin_save_need", {
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_riders_needed: input.ridersNeeded,
    ...(input.needId ? { p_need_id: input.needId } : {}),
  });
  if (error) throw error;
  return data;
}

export async function deleteNeed(needId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_need", { p_need_id: needId });
  if (error) throw error;
}

/** Copies the needs of the days [from, to] onto the days `offsetDays` later (or earlier). */
export async function copyNeeds(from: string, to: string, offsetDays: number): Promise<number> {
  const { data, error } = await supabase.rpc("admin_copy_needs", { p_from: from, p_to: to, p_offset_days: offsetDays });
  if (error) throw error;
  return data ?? 0;
}

export interface NewShift {
  riderId: string;
  startAt: string;
  endAt: string;
  note?: string;
}

/** Creates several shifts at once, all or none (what the auto-fill proposes). */
export async function createShifts(shifts: NewShift[]): Promise<number> {
  const { data, error } = await supabase.rpc("admin_create_shifts", {
    p_shifts: shifts.map((s) => ({ rider_id: s.riderId, start_at: s.startAt, end_at: s.endAt, note: s.note ?? "" })),
  });
  if (error) throw error;
  return data ?? 0;
}
