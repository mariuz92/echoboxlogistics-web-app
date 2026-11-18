/**
 * Percentage change between two periods.
 * Returns null when there is no meaningful baseline (previous = 0): the old
 * dashboard showed a fake "+100%" in that case, even when the current value was 0.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatPct(value: number | null): string {
  if (value === null) return "n/d";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}%`;
}

export const lossRate = (lost: number, radios: number): number =>
  radios > 0 ? (lost / radios) * 100 : 0;

export const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
