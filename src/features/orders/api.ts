import { supabase } from "../../lib/supabase";
import type { DateRange } from "../../lib/dates";
import type { TablesInsert, TablesUpdate } from "../../types/database.types";
import type {
  ChannelUse,
  Order,
  OrderEvent,
  OrderLeg,
  OrderStatus,
} from "../../types/domain";

/** Orders joined with the names of their riders. */
const ORDER_SELECT =
  "*, delivery_rider:profiles!orders_delivery_rider_id_fkey(id, full_name), pickup_rider:profiles!orders_pickup_rider_id_fkey(id, full_name)";

const MAX_ROWS = 2000;

const asOrders = (rows: unknown): Order[] => (rows ?? []) as Order[];

/**
 * Orders whose delivery OR pickup falls inside the range. (The old app only
 * looked at the delivery time, so a pickup never showed on its own day.)
 */
export async function listOrders(range: DateRange): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .or(
      `and(delivery_at.gte.${range.from},delivery_at.lt.${range.to}),` +
        `and(pickup_at.gte.${range.from},pickup_at.lt.${range.to})`,
    )
    .order("delivery_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) throw error;
  return asOrders(data);
}

/** Delivered orders still waiting for their radios to come back. */
export async function listPendingPickups(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .in("status", ["delivered", "awaiting_pickup"])
    .order("delivery_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return asOrders(data);
}

/** Jobs for the signed-in rider (RLS limits the result to their own orders and open pickups). */
export async function listRiderJobs(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .not("status", "in", "(picked_up,cancelled)")
    .order("delivery_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return asOrders(data);
}

export type NewOrderInput = Omit<
  TablesInsert<"orders">,
  "id" | "status" | "tenant_id" | "source" | "created_by" | "delivery_rider_id" | "pickup_rider_id"
>;

export async function createOrder(tenantId: string, input: NewOrderInput): Promise<string> {
  const { data, error } = await supabase
    .from("orders")
    .insert({ ...input, tenant_id: tenantId, source: "dashboard" })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export type OrderPatch = Omit<
  TablesUpdate<"orders">,
  "id" | "tenant_id" | "status" | "delivery_rider_id" | "pickup_rider_id" | "source" | "created_by"
>;

export async function updateOrder(id: string, patch: OrderPatch): Promise<void> {
  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

/** Assigns a rider to one leg of the order; `riderId = null` removes the assignment. */
export async function assignOrder(
  orderId: string,
  leg: OrderLeg,
  riderId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("assign_order", {
    p_order_id: orderId,
    p_leg: leg,
    p_rider_id: riderId as string,
  });
  if (error) throw error;
}

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.rpc("admin_set_status", {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
}

export type RiderAction =
  | "claim_pickup"
  | "start_delivery"
  | "complete_delivery"
  | "start_pickup"
  | "complete_pickup";

export async function riderAction(
  orderId: string,
  action: RiderAction,
  lost?: number,
): Promise<void> {
  const { error } = await supabase.rpc("rider_order_action", {
    p_order_id: orderId,
    p_action: action,
    p_lost: lost as number,
  });
  if (error) throw error;
}

export async function listOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const { data, error } = await supabase
    .from("order_events")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

/** Open orders holding a channel during [from, to) (admins only; riders get nothing). */
export async function getChannelBoard(from: string, to: string): Promise<ChannelUse[]> {
  const { data, error } = await supabase.rpc("get_channel_board", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as ChannelUse[];
}
