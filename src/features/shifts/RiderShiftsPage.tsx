import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Flex, Space, Tag, Typography } from "antd";
import { CheckOutlined, DeleteOutlined, LeftOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import { dayjs, type Dayjs } from "../../lib/dates";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import type { RiderShift } from "./api";
import { TimeField } from "./components/TimeField";
import { useAvailability, useShiftMutations, useShifts, useShiftsRealtime } from "./hooks";
import {
  dayKeyOf,
  formatDuration,
  minutesBetween,
  normalizeEnd,
  timeRange,
  toWindow,
  weekDayKeys,
  weekRange,
  weekStartOf,
  windowsProblem,
  type TimeWindow,
} from "./time";
import { t } from "../../i18n";

/** How far ahead a rider can say when they are available (the database enforces it too). */
const MAX_DAYS_AHEAD = 90;

const sameWindows = (a: TimeWindow[], b: TimeWindow[]) => JSON.stringify(a) === JSON.stringify(b);

interface DayCardProps {
  day: string;
  today: string;
  /** What is saved for the day. */
  saved: TimeWindow[];
  shifts: RiderShift[];
  tz: string;
}

function DayCard({ day, today, saved, shifts, tz }: DayCardProps) {
  const { saveAvailability } = useShiftMutations();
  const [windows, setWindows] = useState<TimeWindow[]>(saved);
  const past = day < today;
  const savedKey = JSON.stringify(saved);

  // availability changed elsewhere (another device, an admin): show it
  useEffect(() => setWindows(JSON.parse(savedKey) as TimeWindow[]), [savedKey]);

  const dirty = !sameWindows(windows, saved);
  const problem = windowsProblem(windows);
  const set = (i: number, patch: Partial<TimeWindow>) =>
    setWindows((list) => list.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const add = () => {
    const last = windows[windows.length - 1];
    const start = last && last.end !== "24:00" ? last.end : "09:00";
    setWindows((list) => [...list, { start, end: start < "13:00" ? "13:00" : "24:00" }]);
  };
  const save = () =>
    saveAvailability.mutate({ day, windows: windows.map((w) => ({ start: w.start, end: normalizeEnd(w.end) })) });

  const total = shifts.reduce((n, s) => n + minutesBetween(s.start_at, s.end_at), 0);
  const d = dayjs(day);
  const isToday = day === today;
  const text = d.format("dddd D MMMM");
  const title = text.charAt(0).toUpperCase() + text.slice(1);

  return (
    <Card
      size="small"
      style={{ borderColor: isToday ? "var(--ant-color-primary)" : undefined, opacity: past ? 0.75 : 1 }}
      title={
        <Flex align="center" gap={8} wrap>
          <Typography.Text strong>{title}</Typography.Text>
          {isToday && <Tag color="blue">{t("Oggi")}</Tag>}
        </Flex>
      }
      extra={total > 0 && <Typography.Text strong>{formatDuration(total)}</Typography.Text>}
    >
      {shifts.length > 0 && (
        <Flex vertical gap={6} style={{ marginBottom: 12 }}>
          {shifts.map((s) => (
            <Alert
              key={s.id}
              type="success"
              showIcon
              title={
                <span>
                  {t("Turno")} <strong>{timeRange(s.start_at, s.end_at, tz)}</strong> · {formatDuration(minutesBetween(s.start_at, s.end_at))}
                  {s.note ? ` · ${s.note}` : ""}
                </span>
              }
            />
          ))}
        </Flex>
      )}

      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("Sono disponibile")}
      </Typography.Text>

      {past ? (
        <Typography.Text>
          {saved.length === 0 ? t("Nessuna disponibilità indicata") : saved.map((w) => `${w.start}–${w.end}`).join(" · ")}
        </Typography.Text>
      ) : (
        <>
          {windows.length === 0 && (
            <Typography.Text style={{ display: "block", marginBottom: 8 }}>{t("Non disponibile")}</Typography.Text>
          )}
          <Flex vertical gap={8}>
            {windows.map((w, i) => (
              <Flex key={i} gap={8} align="center" wrap>
                <TimeField value={w.start} onChange={(start) => set(i, { start })} label={t("Dalle")} />
                <span aria-hidden>–</span>
                <TimeField value={w.end} onChange={(end) => set(i, { end })} label={t("Alle")} isEnd />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={t("Rimuovi fascia")}
                  onClick={() => setWindows((list) => list.filter((_, j) => j !== i))}
                />
              </Flex>
            ))}
          </Flex>
          <Flex gap={8} wrap style={{ marginTop: 12 }}>
            <Button icon={<PlusOutlined />} onClick={add} disabled={windows.length >= 6}>
              {t("Aggiungi fascia")}
            </Button>
            <Button onClick={() => setWindows([{ start: "00:00", end: "24:00" }])}>{t("Tutto il giorno")}</Button>
            {windows.length > 0 && <Button onClick={() => setWindows([])}>{t("Non disponibile")}</Button>}
            <Button
              type="primary"
              icon={<CheckOutlined />}
              disabled={!dirty || problem !== null}
              loading={saveAvailability.isPending}
              onClick={save}
            >
              {t("Salva")}
            </Button>
          </Flex>
          {problem && (
            <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
              {problem === "overlap"
                ? t("Due fasce si sovrappongono.")
                : problem === "too_many"
                  ? t("Puoi indicare al massimo 6 fasce al giorno.")
                  : t("Ogni fascia deve finire dopo il suo inizio.")}
            </Typography.Text>
          )}
        </>
      )}
    </Card>
  );
}

/** A rider says when they can work, and sees the shifts the company assigned. */
export default function RiderShiftsPage() {
  usePageTitle(t("I miei turni"));
  useShiftsRealtime();
  const { timezone: tz } = useReadyUser();
  const todayDay = dayjs().tz(tz);
  const today = todayDay.format("YYYY-MM-DD");
  const thisWeek = weekStartOf(todayDay);
  const [weekStart, setWeekStart] = useState<Dayjs>(thisWeek);

  const range = useMemo(() => weekRange(weekStart, tz), [weekStart, tz]);
  const days = useMemo(() => weekDayKeys(weekStart), [weekStart]);
  const { data: availability = [] } = useAvailability(range);
  const { data: shifts = [] } = useShifts(range);

  const savedBy = useMemo(() => {
    const map = new Map<string, TimeWindow[]>();
    for (const a of availability) {
      const key = dayKeyOf(a.start_at, tz);
      map.set(key, [...(map.get(key) ?? []), toWindow(a, tz)]);
    }
    return map;
  }, [availability, tz]);
  const shiftsBy = useMemo(() => {
    const map = new Map<string, RiderShift[]>();
    for (const s of shifts) {
      const key = dayKeyOf(s.start_at, tz);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [shifts, tz]);

  const weekMinutes = shifts
    .filter((s) => days.includes(dayKeyOf(s.start_at, tz)))
    .reduce((n, s) => n + minutesBetween(s.start_at, s.end_at), 0);
  const end = weekStart.add(6, "day");
  const label = `${weekStart.format("D MMM")} – ${end.format("D MMM YYYY")}`;
  const lastWeek = todayDay.add(MAX_DAYS_AHEAD, "day");

  return (
    <>
      <PageHeader
        title={t("I miei turni")}
        subtitle={t("Indica quando sei disponibile: l’amministratore pianifica i turni in base alle tue disponibilità.")}
      />
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<LeftOutlined />}
            aria-label={t("Settimana precedente")}
            onClick={() => setWeekStart(weekStart.subtract(7, "day"))}
          />
          <Typography.Text strong style={{ minWidth: 170, textAlign: "center", display: "inline-block" }}>
            {label}
          </Typography.Text>
          <Button
            icon={<RightOutlined />}
            aria-label={t("Settimana successiva")}
            disabled={weekStart.add(7, "day").isAfter(lastWeek, "day")}
            onClick={() => setWeekStart(weekStart.add(7, "day"))}
          />
        </Space>
        <Typography.Text>
          {weekMinutes > 0 ? t("Turni assegnati: {hours}", { hours: formatDuration(weekMinutes) }) : t("Nessun turno assegnato in questa settimana")}
        </Typography.Text>
      </Flex>
      <Flex vertical gap={12}>
        {days.map((day) => (
          <DayCard key={day} day={day} today={today} saved={savedBy.get(day) ?? []} shifts={shiftsBy.get(day) ?? []} tz={tz} />
        ))}
      </Flex>
    </>
  );
}
