import { describe, expect, it } from "vitest";
import {
  getAssignBlocker,
  getAssignableLeg,
  hasRole,
  isOpenStatus,
  ORDER_STATUSES,
  ORDER_STATUS_META,
  selectableChannels,
  type ChannelStatus,
  type OrderStatus,
} from "./domain";

describe("getAssignableLeg", () => {
  const cases: [OrderStatus, "delivery" | "pickup" | null][] = [
    ["received", "delivery"],
    ["delivery_assigned", "delivery"],
    ["out_for_delivery", null],
    ["delivered", "pickup"],
    ["awaiting_pickup", "pickup"],
    ["pickup_assigned", "pickup"],
    ["out_for_pickup", null],
    ["picked_up", null],
    ["cancelled", null],
  ];

  it.each(cases)("%s -> %s", (status, leg) => {
    expect(getAssignableLeg({ status })).toBe(leg);
  });
});

describe("getAssignBlocker", () => {
  it("allows delivery assignment without pickup details", () => {
    expect(
      getAssignBlocker({ status: "received", pickup_at: null, pickup_address: null }),
    ).toBeNull();
  });

  it("requires pickup details before assigning the pickup leg", () => {
    expect(
      getAssignBlocker({ status: "delivered", pickup_at: null, pickup_address: null }),
    ).toBe("pickup_details_missing");
    expect(
      getAssignBlocker({
        status: "delivered",
        pickup_at: "2026-11-18T10:00:00Z",
        pickup_address: null,
      }),
    ).toBe("pickup_details_missing");
    expect(
      getAssignBlocker({
        status: "awaiting_pickup",
        pickup_at: "2026-11-18T10:00:00Z",
        pickup_address: "Via Roma 1",
      }),
    ).toBeNull();
  });

  it("blocks finished and in-progress orders", () => {
    expect(
      getAssignBlocker({ status: "out_for_delivery", pickup_at: null, pickup_address: null }),
    ).toBe("no_leg");
    expect(
      getAssignBlocker({ status: "cancelled", pickup_at: null, pickup_address: null }),
    ).toBe("no_leg");
  });
});

describe("selectableChannels", () => {
  const channels: Pick<ChannelStatus, "channel" | "state" | "order_id">[] = [
    { channel: 0, state: "free", order_id: null },
    { channel: 1, state: "busy", order_id: "order-a" },
    { channel: 2, state: "busy", order_id: "order-b" },
    { channel: 3, state: "disabled", order_id: null },
    { channel: 4, state: "free", order_id: null },
  ];

  it("offers only free channels for a new order", () => {
    expect(selectableChannels(channels)).toEqual([0, 4]);
  });

  it("keeps the channel an order already holds selectable (regression: it used to vanish when editing)", () => {
    expect(selectableChannels(channels, "order-a")).toEqual([0, 1, 4]);
  });

  it("never offers channels held by other orders or disabled ones", () => {
    const result = selectableChannels(channels, "order-a");
    expect(result).not.toContain(2);
    expect(result).not.toContain(3);
  });
});

describe("status metadata", () => {
  it("defines a label, colour and group for every status", () => {
    for (const status of ORDER_STATUSES) {
      const meta = ORDER_STATUS_META[status];
      expect(meta.label).toBeTruthy();
      expect(meta.color).toBeTruthy();
      expect(meta.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("treats picked up and cancelled orders as closed", () => {
    expect(isOpenStatus("picked_up")).toBe(false);
    expect(isOpenStatus("cancelled")).toBe(false);
    expect(isOpenStatus("awaiting_pickup")).toBe(true);
  });
});

describe("hasRole", () => {
  it("handles missing profiles", () => {
    expect(hasRole(null, "admin")).toBe(false);
    expect(hasRole({ roles: ["rider"] }, "admin")).toBe(false);
    expect(hasRole({ roles: ["rider", "admin"] }, "admin")).toBe(true);
  });
});
