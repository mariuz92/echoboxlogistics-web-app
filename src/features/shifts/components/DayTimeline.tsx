import { useMemo, useState } from "react";
import { Button, Flex, Segmented, Tag, Tooltip, Typography, theme } from "antd";
import { LeftOutlined, RightOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { dayjs } from "../../../lib/dates";
import { useReadyUser } from "../../../providers/current-user";
import type { RiderAvailability, RiderShift } from "../api";
import {
  coverageTotals,
  countPerSlot,
  dayBounds,
  hourCells,
  levelOf,
  needPerSlot,
  toSpan,
  type CoverageLevel,
} from "../coverage";
import { useAvailability, useNeeds, useShifts } from "../hooks";
import { nameOf, useRiders } from "../riders";
import { dayKeyOf, formatDuration, isAdjusted, minutesBetween, timeRange, weekStartOf } from "../time";
import { NeedsEditor } from "./NeedsEditor";
import { ShiftEditor } from "./ShiftEditor";
import { t } from "../../../i18n";

const HOUR = 3_600_000;
const LABEL_WIDTH = 150;
const HOUR_WIDTH = 46;
const ROW_HEIGHT = 44;

interface DayTimelineProps {
  onAutoFill: (day: string) => void;
}

/**
 * One day as a Gantt chart: a row per rider with their shifts as bars (and the availability behind
 * them), and under it how many riders are needed and how many are on shift, hour by hour.
 */
export function DayTimeline({ onAutoFill }: DayTimelineProps) {
  const { timezone: tz } = useReadyUser();
  const { token } = theme.useToken();
  const [day, setDay] = useState(() => dayjs().tz(tz).format("YYYY-MM-DD"));
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const b = useMemo(() => dayBounds(day, tz), [day, tz]);
  const range = useMemo(() => ({ from: new Date(b.start).toISOString(), to: new Date(b.end).toISOString() }), [b]);
  const { data: availability = [] } = useAvailability(range);
  const { data: shifts = [] } = useShifts(range);
  const weekStart = useMemo(() => weekStartOf(dayjs(day)), [day]);
  const weekRange = useMemo(() => {
    const start = dayBounds(weekStart.format("YYYY-MM-DD"), tz).start;
    const end = dayBounds(weekStart.add(6, "day").format("YYYY-MM-DD"), tz).end;
    return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
  }, [weekStart, tz]);
  const { data: weekNeeds = [] } = useNeeds(weekRange);
  const needs = useMemo(
    () => weekNeeds.filter((n) => Date.parse(n.start_at) < b.end && Date.parse(n.end_at) > b.start),
    [weekNeeds, b],
  );
  const riders = useRiders([...availability.map((a) => a.rider_id), ...shifts.map((s) => s.rider_id)]);

  const have = useMemo(() => countPerSlot(shifts.map(toSpan), b), [shifts, b]);
  const need = useMemo(() => needPerSlot(needs.map((n) => ({ ...toSpan(n), riders: n.riders_needed })), b), [needs, b]);
  const cells = useMemo(() => hourCells(have, need, b, tz), [have, need, b, tz]);
  const totals = useMemo(() => coverageTotals(have, need), [have, need]);

  // the hours on screen: the working hours by default, the whole day on request
  const [first, last] = useMemo(() => {
    if (full) return [0, cells.length];
    const spans = [...shifts, ...availability, ...needs].map(toSpan);
    let from = 7;
    let to = 22;
    if (spans.length) {
      from = Math.min(from, Math.floor((Math.min(...spans.map((s) => s.start)) - b.start) / HOUR));
      to = Math.max(to, Math.ceil((Math.max(...spans.map((s) => s.end)) - b.start) / HOUR));
    }
    return [Math.max(0, from), Math.min(cells.length, to)];
  }, [full, shifts, availability, needs, cells.length, b.start]);
  const visible = cells.slice(first, last);
  const viewStart = visible[0]?.start ?? b.start;
  const viewEnd = visible[visible.length - 1]?.end ?? b.end;
  const pct = (ms: number) => ((Math.min(Math.max(ms, viewStart), viewEnd) - viewStart) / (viewEnd - viewStart)) * 100;
  const bar = (startIso: string, endIso: string) => {
    const left = pct(Date.parse(startIso));
    return { left: `${left}%`, width: `${Math.max(pct(Date.parse(endIso)) - left, 0.5)}%` };
  };

  const colors: Record<CoverageLevel, { bg: string; fg: string }> = {
    idle: { bg: token.colorFillQuaternary, fg: token.colorTextSecondary },
    covered: { bg: token.colorSuccessBg, fg: token.colorSuccessText },
    partial: { bg: token.colorWarningBg, fg: token.colorWarningText },
    short: { bg: token.colorErrorBg, fg: token.colorErrorText },
  };
  const gridLines = {
    backgroundImage: `linear-gradient(to right, ${token.colorBorderSecondary} 1px, transparent 1px)`,
    backgroundSize: `${100 / Math.max(visible.length, 1)}% 100%`,
  };

  const byRider = (rows: (RiderShift | RiderAvailability)[]) => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) map.set(r.rider_id, [...(map.get(r.rider_id) ?? []), r]);
    return map;
  };
  const shiftsBy = byRider(shifts) as Map<string, RiderShift[]>;
  const availBy = byRider(availability) as Map<string, RiderAvailability[]>;


  const shiftDay = (n: number) => setDay(dayjs(day).add(n, "day").format("YYYY-MM-DD"));
  const today = dayjs().tz(tz).format("YYYY-MM-DD");
  const label = dayjs(day).format("dddd D MMMM YYYY");
  const editRider = editing ? riders.find((r) => r.id === editing) : undefined;
  const hasNeeds = need.some((n) => n > 0);

  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
        <Flex gap={8} align="center" wrap>
          <Button icon={<LeftOutlined />} aria-label={t("Giorno precedente")} onClick={() => shiftDay(-1)} />
          <Typography.Text strong style={{ minWidth: 200, textAlign: "center" }}>
            {label.charAt(0).toUpperCase() + label.slice(1)}
          </Typography.Text>
          <Button icon={<RightOutlined />} aria-label={t("Giorno successivo")} onClick={() => shiftDay(1)} />
          <Button disabled={day === today} onClick={() => setDay(today)}>
            {t("Oggi")}
          </Button>
        </Flex>
        <Flex gap={8} align="center" wrap>
          <Segmented<string>
            value={full ? "full" : "work"}
            onChange={(v) => setFull(v === "full")}
            options={[
              { value: "work", label: t("Ore di lavoro") },
              { value: "full", label: t("24 ore") },
            ]}
          />
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => onAutoFill(day)}>
            {t("Riempi in automatico")}
          </Button>
        </Flex>
      </Flex>

      <Flex gap={12} wrap align="center" style={{ marginBottom: 12 }}>
        {hasNeeds ? (
          <Tag color={totals.missing === 0 ? "green" : "red"} style={{ margin: 0 }}>
            {totals.missing === 0
              ? t("Fabbisogno coperto: {hours}", { hours: formatDuration(totals.required) })
              : t("Coperte {covered} su {required}: mancano {missing}", {
                  covered: formatDuration(totals.covered),
                  required: formatDuration(totals.required),
                  missing: formatDuration(totals.missing),
                })}
          </Tag>
        ) : (
          <Typography.Text type="secondary">{t("Nessun fabbisogno indicato per questo giorno.")}</Typography.Text>
        )}
        <Tag color="blue" style={{ margin: 0 }}>{t("Turno")}</Tag>
        <Tag color="gold" style={{ margin: 0 }}>{t("Turno modificato")}</Tag>
        <Tag color="green" variant="outlined" style={{ margin: 0, borderStyle: "dashed", background: "transparent" }}>
          {t("Disponibile")}
        </Tag>
      </Flex>

      <div style={{ overflowX: "auto", border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, background: token.colorBgContainer }}>
        <div
          role="table"
          aria-label={t("Turni della giornata")}
          style={{ display: "grid", gridTemplateColumns: `${LABEL_WIDTH}px repeat(${visible.length}, minmax(${HOUR_WIDTH}px, 1fr))`, minWidth: LABEL_WIDTH + visible.length * HOUR_WIDTH }}
        >
          {/* hours */}
          <div style={{ padding: "8px 12px", color: token.colorTextSecondary, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>{t("Rider")}</div>
          {visible.map((c) => (
            <div key={c.start} style={{ padding: "8px 0", textAlign: "left", paddingLeft: 4, fontSize: 12, color: token.colorTextSecondary, borderBottom: `1px solid ${token.colorBorderSecondary}`, borderLeft: `1px solid ${token.colorBorderSecondary}` }}>
              {c.label}
            </div>
          ))}

          {/* riders */}
          {riders.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 24, textAlign: "center", color: token.colorTextSecondary }}>
              {t("Nessun rider attivo. Invita i rider dalla sezione Team e rider.")}
            </div>
          )}
          {riders.map((r) => {
            const mine = shiftsBy.get(r.id) ?? [];
            const minutes = mine.reduce((n, s) => n + minutesBetween(s.start_at, s.end_at), 0);
            return (
              <div key={r.id} style={{ display: "contents" }} role="row">
                <button
                  type="button"
                  onClick={() => setEditing(r.id)}
                  style={{ all: "unset", cursor: "pointer", boxSizing: "border-box", padding: "0 12px", height: ROW_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "center", borderBottom: `1px solid ${token.colorBorderSecondary}` }}
                  aria-label={t("Turni di {rider}, {day}", { rider: nameOf(r), day: dayjs(day).format("ddd D/M") })}
                >
                  <Typography.Text strong ellipsis style={{ maxWidth: LABEL_WIDTH - 24 }}>{nameOf(r)}</Typography.Text>
                  {minutes > 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDuration(minutes)}</Typography.Text>}
                </button>
                <div
                  style={{ gridColumn: `2 / span ${visible.length}`, position: "relative", height: ROW_HEIGHT, borderBottom: `1px solid ${token.colorBorderSecondary}`, cursor: "pointer", ...gridLines }}
                  onClick={() => setEditing(r.id)}
                >
                  {(availBy.get(r.id) ?? []).map((a) => (
                    <Tooltip key={a.id} title={t("Disponibile {range}", { range: timeRange(a.start_at, a.end_at, tz) })}>
                      <div style={{ position: "absolute", top: 3, bottom: 3, ...bar(a.start_at, a.end_at), border: `1px dashed ${token.colorSuccess}`, borderRadius: 6, background: token.colorSuccessBg, opacity: 0.7 }} />
                    </Tooltip>
                  ))}
                  {mine.map((s) => (
                    <Tooltip key={s.id} title={`${nameOf(r)} · ${timeRange(s.start_at, s.end_at, tz)} (${formatDuration(minutesBetween(s.start_at, s.end_at))})`}>
                      <div
                        style={{ position: "absolute", top: 8, bottom: 8, ...bar(s.start_at, s.end_at), borderRadius: 6, background: isAdjusted(s) ? token.colorWarning : token.colorPrimary, color: "#fff", fontSize: 12, lineHeight: `${ROW_HEIGHT - 16}px`, padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", boxShadow: token.boxShadowTertiary }}
                      >
                        {timeRange(s.start_at, s.end_at, tz)}
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            );
          })}

          {/* needed and covered, hour by hour */}
          <div style={{ padding: "8px 12px", fontWeight: 600 }}>{t("Servono")}</div>
          {visible.map((c) => (
            <div key={`n${c.start}`} style={{ textAlign: "center", padding: "8px 0", color: token.colorTextSecondary, borderLeft: `1px solid ${token.colorBorderSecondary}` }}>
              {c.need > 0 ? c.need : "·"}
            </div>
          ))}
          <div style={{ padding: "8px 12px", fontWeight: 600 }}>{t("In turno")}</div>
          {visible.map((c) => {
            const level = levelOf(c);
            const text = c.have === c.haveMax ? String(c.have) : `${c.have}–${c.haveMax}`;
            return (
              <Tooltip
                key={`h${c.start}`}
                title={
                  level === "idle"
                    ? t("{n} rider in turno", { n: text })
                    : level === "covered"
                      ? t("Coperto: {have} in turno, ne servono {need}", { have: text, need: c.need })
                      : t("Non coperto: {have} in turno, ne servono {need}", { have: text, need: c.need })
                }
              >
                <div
                  style={{ textAlign: "center", padding: "8px 0", fontWeight: 600, background: colors[level].bg, color: colors[level].fg, borderLeft: `1px solid ${token.colorBorderSecondary}` }}
                  data-level={level}
                >
                  {text}
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <NeedsEditor day={day} weekStart={weekStart.format("YYYY-MM-DD")} needs={weekNeeds} tz={tz} />
      </div>

      {editing && editRider && (
        <ShiftEditor
          open
          onClose={() => setEditing(null)}
          riderId={editing}
          riderName={nameOf(editRider)}
          day={day}
          availability={(availBy.get(editing) ?? []).filter((a) => dayKeyOf(a.start_at, tz) === day)}
          shifts={(shiftsBy.get(editing) ?? []).filter((s) => dayKeyOf(s.start_at, tz) === day)}
        />
      )}
    </>
  );
}
