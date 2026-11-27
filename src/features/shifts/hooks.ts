import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { supabase } from "../../lib/supabase";
import type { DateRange } from "../../lib/dates";
import { getErrorMessage } from "../../lib/errors";
import {
  copyNeeds,
  coverFromAvailability,
  createShifts,
  deleteNeed,
  deleteShift,
  getRiderHours,
  listAvailability,
  listNeeds,
  listShiftEvents,
  listShifts,
  saveAvailability,
  saveNeed,
  saveShift,
  type NeedInput,
  type NewShift,
  type ShiftInput,
} from "./api";
import type { TimeWindow } from "./time";
import { t, tn } from "../../i18n";

export const shiftKeys = {
  all: ["shifts"] as const,
  availability: (range: DateRange) => ["shifts", "availability", range.from, range.to] as const,
  list: (range: DateRange) => ["shifts", "list", range.from, range.to] as const,
  events: (id: string) => ["shifts", "events", id] as const,
  hours: (from: string, to: string) => ["shifts", "hours", from, to] as const,
};

export const useAvailability = (range: DateRange) =>
  useQuery({
    queryKey: shiftKeys.availability(range),
    queryFn: () => listAvailability(range),
    placeholderData: keepPreviousData,
  });

export const useShifts = (range: DateRange) =>
  useQuery({
    queryKey: shiftKeys.list(range),
    queryFn: () => listShifts(range),
    placeholderData: keepPreviousData,
  });

export const useNeeds = (range: DateRange) =>
  useQuery({
    queryKey: ["shifts", "needs", range.from, range.to] as const,
    queryFn: () => listNeeds(range),
    placeholderData: keepPreviousData,
  });

export const useShiftEvents = (shiftId: string | undefined) =>
  useQuery({
    queryKey: shiftKeys.events(shiftId ?? ""),
    queryFn: () => listShiftEvents(shiftId!),
    enabled: Boolean(shiftId),
  });

export const useRiderHours = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: shiftKeys.hours(from, to),
    queryFn: () => getRiderHours(from, to),
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * Keeps the shift screens fresh: a change made by anyone in the company (a rider saving their
 * availability, an admin planning a shift) reaches every open screen without a reload.
 */
export function useShiftsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: shiftKeys.all }), 250);
    };
    const channel = supabase
      .channel(`shifts-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_availability" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_shifts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_needs" }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

/** Mutations for the shift screens; errors are reported with a translated toast. */
export function useShiftMutations() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: shiftKeys.all });
  const onError = (error: unknown) => void message.error(getErrorMessage(error));

  return {
    saveAvailability: useMutation({
      mutationFn: ({ day, windows, riderId }: { day: string; windows: TimeWindow[]; riderId?: string }) =>
        saveAvailability(day, windows, riderId),
      onSuccess: () => {
        refresh();
        void message.success(t("Disponibilità salvata."));
      },
      onError,
    }),
    saveShift: useMutation({
      mutationFn: (input: ShiftInput) => saveShift(input),
      onSuccess: () => {
        refresh();
        void message.success(t("Turno salvato."));
      },
      onError,
    }),
    deleteShift: useMutation({
      mutationFn: (shiftId: string) => deleteShift(shiftId),
      onSuccess: () => {
        refresh();
        void message.success(t("Turno eliminato."));
      },
      onError,
    }),
    saveNeed: useMutation({
      mutationFn: (input: NeedInput) => saveNeed(input),
      onSuccess: () => {
        refresh();
        void message.success(t("Fabbisogno salvato."));
      },
      onError,
    }),
    deleteNeed: useMutation({
      mutationFn: (needId: string) => deleteNeed(needId),
      onSuccess: refresh,
      onError,
    }),
    copyNeeds: useMutation({
      mutationFn: ({ from, to, offsetDays }: { from: string; to: string; offsetDays: number }) =>
        copyNeeds(from, to, offsetDays),
      onSuccess: () => {
        refresh();
        void message.success(t("Fabbisogno copiato."));
      },
      onError,
    }),
    createShifts: useMutation({
      mutationFn: (shifts: NewShift[]) => createShifts(shifts),
      onSuccess: (count) => {
        refresh();
        void message.success(tn(count, "{n} turno creato.", "{n} turni creati."));
      },
      onError,
    }),
    cover: useMutation({
      mutationFn: ({ from, to, riderId }: { from: string; to: string; riderId?: string }) =>
        coverFromAvailability(from, to, riderId),
      onSuccess: (count) => {
        refresh();
        void message.success(
          count === 0
            ? t("Nessun turno da aggiungere: la disponibilità è già coperta.")
            : tn(count, "{n} turno aggiunto dalla disponibilità.", "{n} turni aggiunti dalla disponibilità."),
        );
      },
      onError,
    }),
  };
}
