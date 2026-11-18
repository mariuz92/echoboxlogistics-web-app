import { supabase } from "../../lib/supabase";
import type { Dayjs } from "../../lib/dates";
import type { OrderStatus } from "../../types/domain";

/** Shape returned by the `get_dashboard_stats` SQL function. */
export interface DashboardStats {
  month: string;
  timezone: string;
  current: {
    orders: number;
    revenue: number;
    radios: number;
    extras: number;
    lost: number;
    avg_order_value: number;
    cancelled: number;
  };
  previous: { orders: number; revenue: number };
  status_distribution: { status: OrderStatus; count: number }[];
  daily: { date: string; deliveries: number; pickups: number; revenue: number }[];
  weekly: { week_start: string; orders: number; revenue: number }[];
  hourly: { hour: number; deliveries: number; pickups: number }[];
  heatmap: { weekday: number; hour: number; count: number }[];
  top_guides: { name: string; orders: number; revenue: number; radios: number }[];
  channels: { channel: number; orders: number }[];
  top_locations: { location: string; orders: number }[];
}

export async function getDashboardStats(month: Dayjs): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc("get_dashboard_stats", {
    p_month: month.startOf("month").format("YYYY-MM-DD"),
  });
  if (error) throw error;
  return data as unknown as DashboardStats;
}
