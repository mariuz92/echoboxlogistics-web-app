import { useEffect } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { App } from "antd";
import { supabase } from "../../lib/supabase";
import { getErrorMessage } from "../../lib/errors";
import type { DateRange } from "../../lib/dates";
import type { OrderLeg, OrderStatus } from "../../types/domain";
import {
  assignOrder,
  createOrder,
  deleteOrder,
  getChannelStatus,
  listOrderEvents,
  listOrders,
  listPendingPickups,
  listRiderJobs,
  riderAction,
  setOrderStatus,
  updateOrder,
  type NewOrderInput,
  type OrderPatch,
  type RiderAction,
} from "./api";
import { listRiderActivity, listMembers } from "../members/api";
import { listGuides } from "../guides/api";

export const queryKeys = {
  orders: ["orders"] as const,
  list: (range: DateRange) => ["orders", "list", range.from, range.to] as const,
  pending: ["orders", "pending"] as const,
  riderJobs: ["orders", "rider-jobs"] as const,
  events: (id: string) => ["orders", "events", id] as const,
  channels: ["channels"] as const,
  riderActivity: ["rider-activity"] as const,
  members: ["members"] as const,
  guides: ["guides"] as const,
};

export function useOrders(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.list(range),
    queryFn: () => listOrders(range),
    placeholderData: keepPreviousData,
  });
}

export const usePendingPickups = () =>
  useQuery({ queryKey: queryKeys.pending, queryFn: listPendingPickups });

export const useRiderJobs = () =>
  useQuery({ queryKey: queryKeys.riderJobs, queryFn: listRiderJobs });

export const useChannelStatus = (enabled = true) =>
  useQuery({ queryKey: queryKeys.channels, queryFn: getChannelStatus, enabled });

export const useOrderEvents = (orderId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.events(orderId ?? ""),
    queryFn: () => listOrderEvents(orderId!),
    enabled: Boolean(orderId),
  });

export const useRiderActivity = () =>
  useQuery({ queryKey: queryKeys.riderActivity, queryFn: listRiderActivity });

export const useMembers = () =>
  useQuery({ queryKey: queryKeys.members, queryFn: listMembers });

export const useGuides = (enabled = true) =>
  useQuery({ queryKey: queryKeys.guides, queryFn: listGuides, enabled });

/**
 * Keeps every order-derived query fresh: any change to the `orders` table
 * (made by anyone in the company, RLS-filtered) refetches the lists, the
 * channel map and the rider activity. Replaces the Firestore onSnapshot
 * listeners.
 */
export function useOrdersRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
        void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
        void queryClient.invalidateQueries({ queryKey: queryKeys.riderActivity });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }, 250);
    };

    const channel = supabase
      .channel(`orders-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

/** Mutations for the orders screens; errors are reported with a translated toast. */
export function useOrderMutations() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
    void queryClient.invalidateQueries({ queryKey: queryKeys.riderActivity });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onError = (error: unknown) => {
    void message.error(getErrorMessage(error));
  };

  return {
    create: useMutation({
      mutationFn: ({ tenantId, input }: { tenantId: string; input: NewOrderInput }) =>
        createOrder(tenantId, input),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: OrderPatch }) => updateOrder(id, patch),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteOrder(id),
      onSuccess: refresh,
      onError,
    }),
    assign: useMutation({
      mutationFn: ({
        orderId,
        leg,
        riderId,
      }: {
        orderId: string;
        leg: OrderLeg;
        riderId: string | null;
      }) => assignOrder(orderId, leg, riderId),
      onSuccess: refresh,
      onError,
    }),
    setStatus: useMutation({
      mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
        setOrderStatus(orderId, status),
      onSuccess: refresh,
      onError,
    }),
    riderAction: useMutation({
      mutationFn: ({
        orderId,
        action,
        lost,
      }: {
        orderId: string;
        action: RiderAction;
        lost?: number;
      }) => riderAction(orderId, action, lost),
      onSuccess: refresh,
      onError,
    }),
  };
}
