import type { Database, Tables } from "./database.types";
import { dayjs, getPeriodRange } from "../lib/dates";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type OrderSource = Database["public"]["Enums"]["order_source"];

export type Tenant = Tables<"tenants">;
export type Profile = Tables<"profiles">;
export type Guide = Tables<"guides">;
export type Invitation = Tables<"invitations">;
export type OrderEvent = Tables<"order_events">;
export type RiderActivity = Database["public"]["Views"]["rider_activity"]["Row"];
/**
 * Row of public.get_channel_board(): an open order holding a channel during the
 * requested period. Declared by hand because the generated type marks every
 * column of a `returns table` function as non-null (pickup_at can be null).
 */
export interface ChannelUse {
  channel: number;
  order_id: string;
  guide_name: string;
  status: OrderStatus;
  delivery_at: string;
  pickup_at: string | null;
  /** End of the period in which the order occupies its channel. */
  busy_until: string;
}

/** The channel configuration of a company (any equipment: 1 to 10,000 channels). */
export type ChannelSettings = Pick<Tenant, "channel_min" | "channel_max" | "disabled_channels" | "channels_exclusive">;

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

/** Most channels a company can configure (the database enforces the same limit). */
export const MAX_CHANNELS = 10000;

export const channelCount = (s: Pick<ChannelSettings, "channel_min" | "channel_max">): number =>
  s.channel_max - s.channel_min + 1;

/**
 * When an order stops occupying its channel: the planned pickup, or the end of
 * the delivery day (company time zone) when no pickup is planned; never less
 * than a minute after delivery. Mirrors private.channel_window() in SQL.
 */
export function channelWindowEnd(deliveryIso: string, pickupIso: string | null | undefined, tz: string): string {
  const delivery = dayjs(deliveryIso);
  const end = dayjs(pickupIso ?? getPeriodRange(delivery.tz(tz), "day", tz).to);
  const min = delivery.add(1, "minute");
  return (end.isBefore(min) ? min : end).toISOString();
}

/** Orders in `uses` that hold `channel` during [from, to), ignoring `excludeOrderId`. */
export function channelConflicts<T extends Pick<ChannelUse, "channel" | "order_id" | "delivery_at" | "busy_until">>(
  uses: T[],
  channel: number,
  from: string,
  to: string,
  excludeOrderId?: string | null,
): T[] {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return uses.filter(
    (u) =>
      u.channel === channel &&
      u.order_id !== excludeOrderId &&
      Date.parse(u.delivery_at) < end &&
      Date.parse(u.busy_until) > start,
  );
}

/**
 * Parses a list such as "13, 20-22 40" into sorted unique channel numbers.
 * Returns null when the text contains anything else, or a range that is too big.
 */
export function parseChannelList(text: string, maxItems = MAX_CHANNELS): number[] | null {
  const out = new Set<number>();
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  for (const part of parts) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (b < a || b - a >= maxItems) return null;
    for (let c = a; c <= b; c++) out.add(c);
    if (out.size > maxItems) return null;
  }
  return [...out].sort((x, y) => x - y);
}

/** Formats channel numbers compactly: [3, 7, 8, 9, 12] -> "3, 7–9, 12". */
export function formatChannelList(channels: readonly number[]): string {
  const sorted = [...new Set(channels)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(", ");
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
