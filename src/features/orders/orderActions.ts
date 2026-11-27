import type { Order, OrderStatus } from "../../types/domain";
import { t } from "../../i18n";

export interface StatusAction {
  /** Target status passed to admin_set_status */
  status: OrderStatus;
  label: string;
  danger?: boolean;
  /** Ask for confirmation before running it */
  confirm?: string;
}

/**
 * Status changes an admin can trigger from the order menu for the order's
 * current state. Assigning riders is a separate action (assign_order); the
 * database enforces the same transitions (public.admin_set_status).
 */
export function getStatusActions(order: Pick<Order, "status" | "pickup_address" | "pickup_at">): StatusAction[] {
  const hasPickup = Boolean(order.pickup_address && order.pickup_at);

  switch (order.status) {
    case "received":
      return [cancel()];
    case "delivery_assigned":
      return [
        { status: "out_for_delivery", label: "Segna in consegna" },
        { status: "delivered", label: "Segna consegnato" },
        cancel(),
      ];
    case "out_for_delivery":
      return [{ status: "delivered", label: "Segna consegnato" }, cancel()];
    case "delivered":
      return [
        ...(hasPickup ? [{ status: "awaiting_pickup" as const, label: "Metti in attesa di ritiro" }] : []),
        { status: "picked_up", label: "Segna ritirato" },
        cancel(),
      ];
    case "awaiting_pickup":
      return [{ status: "picked_up", label: "Segna ritirato" }, cancel()];
    case "pickup_assigned":
      return [
        { status: "out_for_pickup", label: "Segna in ritiro" },
        { status: "picked_up", label: "Segna ritirato" },
        cancel(),
      ];
    case "out_for_pickup":
      return [{ status: "picked_up", label: "Segna ritirato" }, cancel()];
    case "cancelled":
      return [{ status: "received", label: "Riapri ordine" }];
    default:
      return [];
  }
}

/**
 * What an admin can do to give a channel back from the occupied channels window: record that the
 * radios came back (only once they are out), or cancel the order. Same rules as the order menu.
 */
export function getChannelFreeActions(order: Pick<Order, "status" | "pickup_at">): {
  returned?: StatusAction;
  cancel?: StatusAction;
} {
  const actions = getStatusActions({ status: order.status, pickup_at: order.pickup_at, pickup_address: null });
  return {
    returned: actions.find((a) => a.status === "picked_up"),
    cancel: actions.find((a) => a.status === "cancelled"),
  };
}

function cancel(): StatusAction {
  return {
    status: "cancelled",
    label: t("Annulla ordine"),
    danger: true,
    confirm: t("L'ordine verrà annullato e il canale radio tornerà disponibile."),
  };
}

/** A pickup is overdue when it was planned in the past and radios are still out. */
export function isPickupOverdue(
  order: Pick<Order, "status" | "pickup_at">,
  now: Date = new Date(),
): boolean {
  if (!["delivered", "awaiting_pickup", "pickup_assigned", "out_for_pickup"].includes(order.status)) {
    return false;
  }
  return order.pickup_at ? new Date(order.pickup_at).getTime() < now.getTime() : false;
}

/** Orders that need an admin to do something (no rider yet for a leg that is due). */
export function needsAssignment(order: Pick<Order, "status">): boolean {
  return order.status === "received" || order.status === "awaiting_pickup";
}
