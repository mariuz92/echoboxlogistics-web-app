import type { Database, Tables } from "./database.types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type OrderSource = Database["public"]["Enums"]["order_source"];

export type Tenant = Tables<"tenants">;
export type Profile = Tables<"profiles">;
export type Guide = Tables<"guides">;
export type Invitation = Tables<"invitations">;
export type OrderEvent = Tables<"order_events">;
export type RiderActivity = Database["public"]["Views"]["rider_activity"]["Row"];
export type ChannelState = "free" | "busy" | "disabled";

/**
 * Row of public.get_channel_status(). Declared by hand: the generated type
 * marks every column of a `returns table` function as non-null, but free and
 * disabled channels have no order.
 */
export interface ChannelStatus {
  channel: number;
  state: ChannelState;
  order_id: string | null;
  guide_name: string | null;
  delivery_at: string | null;
  status: OrderStatus | null;
}

export type RiderRef = Pick<Profile, "id" | "full_name">;

/** An order together with the (embedded) names of its riders. */
export type Order = Tables<"orders"> & {
  delivery_rider: RiderRef | null;
  pickup_rider: RiderRef | null;
};

export type OrderLeg = "delivery" | "pickup";

/* -------------------------------------------------------------------------- */
/* Status metadata                                                            */
/* -------------------------------------------------------------------------- */

export interface StatusMeta {
  label: string;
  /** antd Tag preset colour */
  color: string;
  /** Hex colour for charts (kept in sync with `color`) */
  hex: string;
  group: "open" | "done" | "cancelled";
  hint: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  received: {
    label: "Presa in carico",
    color: "gold",
    hex: "#d97706",
    group: "open",
    hint: "Ordine registrato, nessun rider assegnato.",
  },
  delivery_assigned: {
    label: "Consegna assegnata",
    color: "geekblue",
    hex: "#3b5bdb",
    group: "open",
    hint: "Un rider è stato assegnato alla consegna.",
  },
  out_for_delivery: {
    label: "In consegna",
    color: "blue",
    hex: "#1d5fa8",
    group: "open",
    hint: "Il rider sta consegnando le radioguide.",
  },
  delivered: {
    label: "Consegnato",
    color: "green",
    hex: "#16a34a",
    group: "open",
    hint: "Consegnato. Il ritiro non è ancora stato pianificato.",
  },
  awaiting_pickup: {
    label: "Attesa ritiro",
    color: "orange",
    hex: "#ea580c",
    group: "open",
    hint: "Consegnato, in attesa che un rider ritiri le radioguide.",
  },
  pickup_assigned: {
    label: "Ritiro assegnato",
    color: "purple",
    hex: "#7c3aed",
    group: "open",
    hint: "Un rider è stato assegnato al ritiro.",
  },
  out_for_pickup: {
    label: "In ritiro",
    color: "magenta",
    hex: "#c026d3",
    group: "open",
    hint: "Il rider sta ritirando le radioguide.",
  },
  picked_up: {
    label: "Ritirato",
    color: "cyan",
    hex: "#0891b2",
    group: "done",
    hint: "Ciclo concluso: radioguide rientrate.",
  },
  cancelled: {
    label: "Annullato",
    color: "red",
    hex: "#dc2626",
    group: "cancelled",
    hint: "Ordine annullato.",
  },
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_META) as OrderStatus[];

export const isOpenStatus = (status: OrderStatus): boolean =>
  ORDER_STATUS_META[status].group === "open";

/** Statuses in which a rider is actively committed to the order. */
export const RIDER_ACTIVE_STATUSES: OrderStatus[] = [
  "delivery_assigned",
  "out_for_delivery",
  "pickup_assigned",
  "out_for_pickup",
];

/* -------------------------------------------------------------------------- */
/* Assignment rules (mirror public.assign_order)                              */
/* -------------------------------------------------------------------------- */

/** Which leg a rider assignment would apply to for this order. */
export function getAssignableLeg(order: Pick<Order, "status">): OrderLeg | null {
  switch (order.status) {
    case "received":
    case "delivery_assigned":
      return "delivery";
    case "delivered":
    case "awaiting_pickup":
    case "pickup_assigned":
      return "pickup";
    default:
      return null; // in progress, finished or cancelled
  }
}

export type AssignBlocker = "no_leg" | "pickup_details_missing" | null;

export function getAssignBlocker(
  order: Pick<Order, "status" | "pickup_at" | "pickup_address">,
): AssignBlocker {
  const leg = getAssignableLeg(order);
  if (!leg) return "no_leg";
  if (leg === "pickup" && (!order.pickup_at || !order.pickup_address)) {
    return "pickup_details_missing";
  }
  return null;
}

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "received",
  "delivery_assigned",
  "out_for_delivery",
  "awaiting_pickup",
  "pickup_assigned",
  "out_for_pickup",
  "picked_up",
];

/* -------------------------------------------------------------------------- */
/* Radio channels                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Channels an order may be moved to: every free channel plus the one the order
 * already holds (the old UI dropped it from the list, so editing an order made
 * its own channel disappear).
 */
export function selectableChannels(
  channels: Pick<ChannelStatus, "channel" | "state" | "order_id">[],
  currentOrderId?: string | null,
): number[] {
  return channels
    .filter(
      (c) =>
        c.state === "free" ||
        (currentOrderId != null && c.order_id === currentOrderId),
    )
    .map((c) => c.channel);
}

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Amministratore",
  rider: "Rider",
};

export const hasRole = (profile: Pick<Profile, "roles"> | null | undefined, role: AppRole) =>
  Boolean(profile?.roles.includes(role));
