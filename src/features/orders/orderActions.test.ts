import { describe, expect, it } from "vitest";
import { getChannelFreeActions, getStatusActions, isPickupOverdue, needsAssignment } from "./orderActions";

const pickupPlanned = { pickup_address: "Via Roma 1", pickup_at: "2026-11-18T10:00:00Z" };
const noPickup = { pickup_address: null, pickup_at: null };

describe("getStatusActions", () => {
  it("offers nothing for a finished order", () => {
    expect(getStatusActions({ status: "picked_up", ...noPickup })).toEqual([]);
  });

  it("only lets a cancelled order be re-opened", () => {
    const actions = getStatusActions({ status: "cancelled", ...noPickup });
    expect(actions.map((a) => a.status)).toEqual(["received"]);
  });

  it("never offers assigned statuses (they require choosing a rider)", () => {
    const statuses = [
      "received",
      "delivery_assigned",
      "out_for_delivery",
      "delivered",
      "awaiting_pickup",
      "pickup_assigned",
      "out_for_pickup",
    ] as const;
    for (const status of statuses) {
      const targets = getStatusActions({ status, ...pickupPlanned }).map((a) => a.status);
      expect(targets).not.toContain("delivery_assigned");
      expect(targets).not.toContain("pickup_assigned");
    }
  });

  it("only offers 'awaiting pickup' once a pickup is planned", () => {
    expect(
      getStatusActions({ status: "delivered", ...noPickup }).map((a) => a.status),
    ).not.toContain("awaiting_pickup");
    expect(
      getStatusActions({ status: "delivered", ...pickupPlanned }).map((a) => a.status),
    ).toContain("awaiting_pickup");
  });

  it("asks for confirmation before cancelling", () => {
    const cancel = getStatusActions({ status: "received", ...noPickup }).find(
      (a) => a.status === "cancelled",
    );
    expect(cancel?.confirm).toBeTruthy();
    expect(cancel?.danger).toBe(true);
  });
});

describe("isPickupOverdue", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  it("flags planned pickups in the past while radios are still out", () => {
    expect(isPickupOverdue({ status: "awaiting_pickup", pickup_at: "2026-11-18T10:00:00Z" }, now)).toBe(true);
  });

  it("ignores future pickups, unscheduled pickups and closed orders", () => {
    expect(isPickupOverdue({ status: "awaiting_pickup", pickup_at: "2026-11-18T15:00:00Z" }, now)).toBe(false);
    expect(isPickupOverdue({ status: "delivered", pickup_at: null }, now)).toBe(false);
    expect(isPickupOverdue({ status: "picked_up", pickup_at: "2026-11-18T10:00:00Z" }, now)).toBe(false);
    expect(isPickupOverdue({ status: "cancelled", pickup_at: "2026-11-18T10:00:00Z" }, now)).toBe(false);
  });
});

describe("needsAssignment", () => {
  it("is true only when a leg is waiting for a rider", () => {
    expect(needsAssignment({ status: "received" })).toBe(true);
    expect(needsAssignment({ status: "awaiting_pickup" })).toBe(true);
    expect(needsAssignment({ status: "delivery_assigned" })).toBe(false);
    expect(needsAssignment({ status: "delivered" })).toBe(false);
  });
});

describe("getChannelFreeActions", () => {
  const at = { pickup_at: null };

  it("records the return of the radios once they are out", () => {
    for (const status of ["delivered", "awaiting_pickup", "pickup_assigned", "out_for_pickup"] as const) {
      expect(getChannelFreeActions({ status, ...at }).returned?.status).toBe("picked_up");
    }
  });

  it("only offers to cancel an order that was never delivered", () => {
    for (const status of ["received", "delivery_assigned", "out_for_delivery"] as const) {
      const actions = getChannelFreeActions({ status, ...at });
      expect(actions.returned).toBeUndefined();
      expect(actions.cancel?.status).toBe("cancelled");
    }
  });

  it("offers cancelling next to the return of the radios", () => {
    expect(getChannelFreeActions({ status: "delivered", ...at }).cancel?.status).toBe("cancelled");
  });

  it("offers nothing for orders that no longer hold a channel", () => {
    expect(getChannelFreeActions({ status: "picked_up", ...at })).toEqual({});
    expect(getChannelFreeActions({ status: "cancelled", ...at })).toEqual({});
  });
});
