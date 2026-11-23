import { supabase } from "../../lib/supabase";
import type { Dayjs } from "../../lib/dates";

/** What happened in a period (month, or the part of it up to today). */
export interface PeriodFigures {
  orders: number;
  revenue: number;
  /** radios delivered, extras included */
  radios: number;
  lost: number;
  /** orders with a recorded delivery, and how many were within 10 minutes of the time */
  delivered: number;
  on_time: number;
  cancelled: number;
  /** orders booked for the period, cancelled ones included */
  booked: number;
}

export interface CapacityDay {
  date: string;
  /** most groups out at the same time in any hour of the day */
  groups: number;
  /** most radios out at the same time in any hour of the day */
  radios: number;
  deliveries: number;
  pickups: number;
}

/** Shape returned by the `get_dashboard_insights` SQL function (see the migration for the definitions). */
export interface DashboardInsights {
  month: string;
  timezone: string;
  /** a month still running is measured up to `through` and compared with the same days of the one before */
  in_progress: boolean;
  through: string;
  booked_ahead: { orders: number; revenue: number; radios: number };
  current: PeriodFigures;
  previous: PeriodFigures;
  trend: { month: string; orders: number; revenue: number; radios: number }[];
  capacity: {
    /** channels available (range minus disabled) */
    channels: number;
    /** whether a channel can serve only one group at a time */
    exclusive: boolean;
    days: CapacityDay[];
    upcoming: CapacityDay[];
  };
  alerts: {
    overdue_pickups: { orders: number; radios: number; oldest_days: number };
    unassigned_deliveries: number;
    unassigned_pickups: number;
  };
  stops: { weekday: number; hour: number; count: number }[];
  guides: {
    top: { name: string; orders: number; revenue: number; radios: number }[];
    active: number;
    new: number;
    new_revenue: number;
    win_back: { name: string; orders: number; revenue: number; last_order: string; days_since: number }[];
    losses: { name: string; lost: number; radios: number }[];
  };
  operations: {
    lead_time: { same_day: number; days_1_2: number; days_3_7: number; days_8_30: number; over_30: number };
    sources: { source: "dashboard" | "public_form"; orders: number; revenue: number; cancelled: number }[];
    avg_days_out: number | null;
    riders: { name: string; stops: number; deliveries: number; delivered: number; on_time: number }[];
  };
  locations: { location: string; orders: number; revenue: number; radios: number }[];
}

export async function getDashboardInsights(month: Dayjs): Promise<DashboardInsights> {
  const { data, error } = await supabase.rpc("get_dashboard_insights", {
    p_month: month.startOf("month").format("YYYY-MM-DD"),
  });
  if (error) throw error;
  return data as unknown as DashboardInsights;
}
