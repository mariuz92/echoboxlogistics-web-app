import { dayKeyOf, formatHours, isAdjusted, minutesBetween, timeOf } from "./time";
import type { RiderHours } from "./api";

/** One cell of a CSV file: quoted when needed, and made harmless if a spreadsheet would run it. */
export function csvCell(value: string | number): string {
  let text = String(value);
  // A text starting with = + - @ would be read as a formula by Excel and Sheets.
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface HoursCsvLabels {
  rider: string;
  day: string;
  from: string;
  to: string;
  hours: string;
  plannedHours: string;
  changed: string;
  note: string;
  total: string;
  yes: string;
}

/**
 * The hours to pay as a CSV for a spreadsheet: one line per shift and a total line per rider.
 * Semicolon separated with decimal hours, the way a payroll sheet reads it.
 */
export function buildHoursCsv(rows: RiderHours[], tz: string, labels: HoursCsvLabels): string {
  const lines: string[] = [];
  lines.push(
    [labels.rider, labels.day, labels.from, labels.to, labels.hours, labels.plannedHours, labels.changed, labels.note]
      .map(csvCell)
      .join(";"),
  );
  for (const rider of rows) {
    for (const item of rider.items) {
      lines.push(
        [
          rider.name,
          dayKeyOf(item.start_at, tz),
          timeOf(item.start_at, tz),
          timeOf(item.end_at, tz),
          formatHours(minutesBetween(item.start_at, item.end_at)),
          formatHours(minutesBetween(item.planned_start_at, item.planned_end_at)),
          isAdjusted(item) ? labels.yes : "",
          item.note,
        ]
          .map(csvCell)
          .join(";"),
      );
    }
    lines.push(
      [`${labels.total} ${rider.name}`, "", "", "", formatHours(rider.paid_minutes), formatHours(rider.planned_minutes), "", ""]
        .map(csvCell)
        .join(";"),
    );
  }
  return lines.join("\r\n");
}

/** Downloads a text as a file (with the byte-order mark Excel needs for accents). */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
