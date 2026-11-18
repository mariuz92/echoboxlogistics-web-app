import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/it";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);
dayjs.locale("it");

export { dayjs };
export type { Dayjs };

export const DEFAULT_TIMEZONE = "Europe/Rome";

export type Period = "day" | "week" | "month" | "year";

export interface DateRange {
  /** inclusive, ISO 8601 */
  from: string;
  /** exclusive, ISO 8601 */
  to: string;
}

/**
 * Start/end (end exclusive) of the period containing `date`, evaluated in the
 * tenant's timezone, as ISO strings ready for the API.
 * Day boundaries must follow the company's timezone, not the browser's.
 */
export function getPeriodRange(
  date: Dayjs,
  period: Period,
  tz: string = DEFAULT_TIMEZONE,
): DateRange {
  // 1) Calendar arithmetic on plain (timezone-less) dates: whole days/months,
  //    unaffected by DST.
  const day = dayjs(date.format("YYYY-MM-DD"));
  let startDay: Dayjs;
  let endDay: Dayjs;

  switch (period) {
    case "week":
      startDay = day.subtract((day.day() + 6) % 7, "day"); // Monday
      endDay = startDay.add(7, "day");
      break;
    case "month":
      startDay = day.startOf("month");
      endDay = startDay.add(1, "month");
      break;
    case "year":
      startDay = day.startOf("year");
      endDay = startDay.add(1, "year");
      break;
    default:
      startDay = day;
      endDay = day.add(1, "day");
  }

  // 2) Anchor each boundary at local midnight in the tenant's timezone. A day
  //    can therefore be 23 or 25 hours long around DST changes.
  const from = dayjs.tz(startDay.format("YYYY-MM-DD"), tz);
  const to = dayjs.tz(endDay.format("YYYY-MM-DD"), tz);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const fmtDateTime = (value?: string | null, tz: string = DEFAULT_TIMEZONE) =>
  value ? dayjs(value).tz(tz).format("DD/MM/YYYY HH:mm") : "—";

export const fmtDate = (value?: string | null, tz: string = DEFAULT_TIMEZONE) =>
  value ? dayjs(value).tz(tz).format("DD/MM/YYYY") : "—";

export const fmtTime = (value?: string | null, tz: string = DEFAULT_TIMEZONE) =>
  value ? dayjs(value).tz(tz).format("HH:mm") : "—";

export const fmtRelative = (value?: string | null) =>
  value ? dayjs(value).fromNow() : "—";

export const fmtMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    value ?? 0,
  );

export const fmtNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat("it-IT").format(value ?? 0);

/**
 * Date pickers work with plain wall-clock values in the browser's zone, while
 * the database stores absolute instants. These helpers translate between the
 * two using the company's timezone so that "09:00" always means 09:00 in the
 * tenant's city, wherever the user's laptop is.
 */
export const isoToWallClock = (iso: string, tz: string = DEFAULT_TIMEZONE): Dayjs =>
  dayjs(dayjs(iso).tz(tz).format("YYYY-MM-DDTHH:mm:ss"));

export const wallClockToIso = (value: Dayjs, tz: string = DEFAULT_TIMEZONE): string =>
  dayjs.tz(value.format("YYYY-MM-DDTHH:mm:ss"), tz).toISOString();
