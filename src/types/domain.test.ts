import { describe, expect, it } from "vitest";
import {
  channelConflicts,
  channelCount,
  channelWindowEnd,
  formatChannelList,
  getAssignBlocker,
  getAssignableLeg,
  hasRole,
  isOpenStatus,
  ORDER_STATUSES,
  ORDER_STATUS_META,
  parseChannelList,
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

describe("channelWindowEnd", () => {
  const tz = "Europe/Rome";

  it("ends at the planned pickup", () => {
    expect(channelWindowEnd("2026-07-10T08:00:00.000Z", "2026-07-10T12:00:00.000Z", tz)).toBe("2026-07-10T12:00:00.000Z");
  });

  it("ends at midnight of the delivery day (company time zone) without a pickup", () => {
    // 10:00 in Rome on 10 July (UTC+2) -> midnight in Rome = 22:00 UTC
    expect(channelWindowEnd("2026-07-10T08:00:00.000Z", null, tz)).toBe("2026-07-10T22:00:00.000Z");
  });

  it("never lasts less than a minute", () => {
    expect(channelWindowEnd("2026-07-10T08:00:00.000Z", "2026-07-10T08:00:00.000Z", tz)).toBe("2026-07-10T08:01:00.000Z");
  });
});

describe("channelConflicts", () => {
  const uses = [
    { channel: 5, order_id: "a", delivery_at: "2026-07-10T08:00:00Z", busy_until: "2026-07-10T12:00:00Z" },
    { channel: 5, order_id: "b", delivery_at: "2026-07-10T13:00:00Z", busy_until: "2026-07-10T16:00:00Z" },
    { channel: 6, order_id: "c", delivery_at: "2026-07-10T08:00:00Z", busy_until: "2026-07-10T20:00:00Z" },
  ];

  it("finds orders on the same channel whose times overlap", () => {
    expect(channelConflicts(uses, 5, "2026-07-10T11:00:00Z", "2026-07-10T14:00:00Z").map((u) => u.order_id)).toEqual(["a", "b"]);
  });

  it("lets the same channel serve back-to-back groups", () => {
    expect(channelConflicts(uses, 5, "2026-07-10T12:00:00Z", "2026-07-10T13:00:00Z")).toEqual([]);
  });

  it("ignores the order being edited", () => {
    expect(channelConflicts(uses, 5, "2026-07-10T09:00:00Z", "2026-07-10T10:00:00Z", "a")).toEqual([]);
  });
});

describe("channel lists", () => {
  it("parses numbers and ranges in any order", () => {
    expect(parseChannelList("13, 20-22 3;3")).toEqual([3, 13, 20, 21, 22]);
    expect(parseChannelList("")).toEqual([]);
  });

  it("rejects text that is not a channel list", () => {
    expect(parseChannelList("13, abc")).toBeNull();
    expect(parseChannelList("9-2")).toBeNull();
    expect(parseChannelList("1-20000")).toBeNull();
  });

  it("formats runs as ranges", () => {
    expect(formatChannelList([12, 3, 7, 8, 9])).toBe("3, 7–9, 12");
    expect(formatChannelList([])).toBe("");
  });

  it("counts channels in a range", () => {
    expect(channelCount({ channel_min: 1, channel_max: 1 })).toBe(1);
    expect(channelCount({ channel_min: 1, channel_max: 10000 })).toBe(10000);
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
