import { useMemo, useState } from "react";
import { Button, Card, Empty, Flex, Grid, Popconfirm, Segmented, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import {
  DownloadOutlined,
  LeftOutlined,
  RightOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { dayjs, type Dayjs } from "../../lib/dates";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { useMembers } from "../orders/hooks";
import { nameOf, useRiders } from "./riders";
import type { Profile } from "../../types/domain";
import type { RiderAvailability, RiderHours, RiderShift } from "./api";
import { AutoFillModal } from "./components/AutoFillModal";
import { DayTimeline } from "./components/DayTimeline";
import { ShiftEditor } from "./components/ShiftEditor";
import { coverageTotals, countPerSlot, dayBounds, needPerSlot, toSpan } from "./coverage";
import { buildHoursCsv, downloadCsv } from "./csv";
import { useAvailability, useNeeds, useRiderHours, useShiftMutations, useShifts, useShiftsRealtime } from "./hooks";
import {
  adjustmentMinutes,
  dayKeyOf,
  formatDuration,
  formatHours,
  isAdjusted,
  isCovered,
  minutesBetween,
  timeRange,
  uncovered,
  weekDayKeys,
  weekRange,
  weekStartOf,
} from "./time";
import { t, tn } from "../../i18n";

type Cell = { availability: RiderAvailability[]; shifts: RiderShift[] };

const dayLabel = (day: string) => dayjs(day).format("ddd D/M");
const sum = (shifts: RiderShift[]) => shifts.reduce((total, s) => total + minutesBetween(s.start_at, s.end_at), 0);

/** A week navigator: previous, this week, next. */
function WeekNav({ weekStart, onChange, tz }: { weekStart: Dayjs; onChange: (next: Dayjs) => void; tz: string }) {
  const end = weekStart.add(6, "day");
  const thisWeek = weekStartOf(dayjs().tz(tz));
  const label =
    weekStart.month() === end.month()
      ? `${weekStart.format("D")}–${end.format("D MMMM YYYY")}`
      : `${weekStart.format("D MMM")} – ${end.format("D MMM YYYY")}`;
  return (
    <Flex gap={8} align="center" wrap>
      <Button icon={<LeftOutlined />} aria-label={t("Settimana precedente")} onClick={() => onChange(weekStart.subtract(7, "day"))} />
      <Typography.Text strong style={{ minWidth: 180, textAlign: "center" }}>
        {label}
      </Typography.Text>
      <Button icon={<RightOutlined />} aria-label={t("Settimana successiva")} onClick={() => onChange(weekStart.add(7, "day"))} />
      <Button disabled={weekStart.isSame(thisWeek, "day")} onClick={() => onChange(thisWeek)}>
        {t("Questa settimana")}
      </Button>
    </Flex>
  );
}

function WeekGrid({ onAutoFill }: { onAutoFill: (day: string) => void }) {
  const { timezone: tz } = useReadyUser();
  const wide = Grid.useBreakpoint().md ?? true;
  const riderWidth = wide ? 150 : 104;
  const dayWidth = wide ? 124 : 118;
  const totalWidth = wide ? 80 : 72;
  const [weekStart, setWeekStart] = useState(() => weekStartOf(dayjs().tz(tz)));
  const range = useMemo(() => weekRange(weekStart, tz), [weekStart, tz]);
  const days = useMemo(() => weekDayKeys(weekStart), [weekStart]);
  const { data: availability = [], isLoading: loadingA } = useAvailability(range);
  const { data: shifts = [], isLoading: loadingS } = useShifts(range);
  const { data: needs = [] } = useNeeds(range);
  const { cover } = useShiftMutations();
  const [editing, setEditing] = useState<{ riderId: string; day: string } | null>(null);

  const extra = useMemo(() => [...availability.map((a) => a.rider_id), ...shifts.map((s) => s.rider_id)], [availability, shifts]);
  const riders = useRiders(extra);
  const { data: members = [] } = useMembers();

  // rider -> day -> cell
  const cells = useMemo(() => {
    const map = new Map<string, Cell>();
    const at = (riderId: string, day: string) => {
      const key = `${riderId}|${day}`;
      let cell = map.get(key);
      if (!cell) map.set(key, (cell = { availability: [], shifts: [] }));
      return cell;
    };
    for (const a of availability) at(a.rider_id, dayKeyOf(a.start_at, tz)).availability.push(a);
    for (const s of shifts) at(s.rider_id, dayKeyOf(s.start_at, tz)).shifts.push(s);
    return map;
  }, [availability, shifts, tz]);
  const cellOf = (riderId: string, day: string): Cell => cells.get(`${riderId}|${day}`) ?? { availability: [], shifts: [] };

  const toCover = useMemo(
    () => riders.reduce((n, r) => n + days.reduce((m, d) => m + uncovered(cellOf(r.id, d).availability, cellOf(r.id, d).shifts).length, 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riders, days, cells],
  );
  const riderTotal = (riderId: string) => days.reduce((n, d) => n + sum(cellOf(riderId, d).shifts), 0);
  const dayTotal = (day: string) => riders.reduce((n, r) => n + sum(cellOf(r.id, day).shifts), 0);
  const dayPeople = (day: string) => riders.filter((r) => cellOf(r.id, day).shifts.length > 0).length;
  const weekTotal = riders.reduce((n, r) => n + riderTotal(r.id), 0);
  // minutes still missing against the staffing needs, per day
  const missingBy = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of days) {
      const b = dayBounds(d, tz);
      const have = countPerSlot(shifts.map(toSpan), b);
      const need = needPerSlot(needs.map((n) => ({ ...toSpan(n), riders: n.riders_needed })), b);
      map.set(d, coverageTotals(have, need).missing);
    }
    return map;
  }, [days, shifts, needs, tz]);

  const columns: TableColumnsType<Profile> = [
    {
      title: t("Rider"),
      key: "rider",
      fixed: "left",
      width: riderWidth,
      render: (_, r) => (
        <Typography.Text strong>
          {nameOf(r)}
          {r.disabled && <Tag style={{ marginLeft: 6 }}>{t("Disattivato")}</Tag>}
        </Typography.Text>
      ),
    },
    ...days.map((day) => ({
      title: dayLabel(day),
      key: day,
      width: dayWidth,
      render: (_: unknown, r: Profile) => {
        const cell = cellOf(r.id, day);
        const open = uncovered(cell.availability, cell.shifts);
        return (
          <button
            type="button"
            className="shift-cell"
            onClick={() => setEditing({ riderId: r.id, day })}
            aria-label={t("Turni di {rider}, {day}", { rider: nameOf(r), day: dayLabel(day) })}
          >
            {cell.shifts.map((s) => (
              <Tag
                key={s.id}
                color={isAdjusted(s) ? "gold" : "blue"}
                style={{ margin: "0 0 4px", display: "block", textAlign: "center" }}
              >
                {!isCovered(s, cell.availability) && (
                  <Tooltip title={t("Fuori dalla disponibilità indicata")}>
                    <WarningOutlined style={{ marginRight: 4 }} />
                  </Tooltip>
                )}
                {timeRange(s.start_at, s.end_at, tz)}
              </Tag>
            ))}
            {open.map((a) => (
              <Tag
                key={a.id}
                color="green"
                variant="outlined"
                style={{ margin: "0 0 4px", display: "block", textAlign: "center", borderStyle: "dashed", background: "transparent" }}
              >
                {timeRange(a.start_at, a.end_at, tz)}
              </Tag>
            ))}
            {cell.shifts.length === 0 && open.length === 0 && <span style={{ opacity: 0.35 }}>—</span>}
          </button>
        );
      },
    })),
    {
      title: t("Ore"),
      key: "total",
      fixed: wide ? ("right" as const) : undefined,
      width: totalWidth,
      align: "right",
      render: (_, r) => <Typography.Text strong>{formatDuration(riderTotal(r.id))}</Typography.Text>,
    },
  ];

  const editRider = editing ? members.find((m) => m.id === editing.riderId) : undefined;
  const editCell = editing ? cellOf(editing.riderId, editing.day) : undefined;

  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
        <WeekNav weekStart={weekStart} onChange={setWeekStart} tz={tz} />
        <Flex gap={8} wrap>
        <Button icon={<ThunderboltOutlined />} onClick={() => onAutoFill(days[0])}>
          {t("Riempi in automatico")}
        </Button>
        <Popconfirm
          title={t("Usare la disponibilità come turni?")}
          description={t("Crea un turno per ogni fascia di disponibilità non ancora coperta, in questa settimana. Potrai cambiare gli orari dopo.")}
          okText={t("Crea turni")}
          cancelText={t("Annulla")}
          disabled={toCover === 0}
          onConfirm={() => cover.mutate({ from: days[0], to: days[6] })}
        >
          <Button type="primary" icon={<ThunderboltOutlined />} disabled={toCover === 0} loading={cover.isPending}>
            {toCover > 0 ? t("Usa la disponibilità ({n})", { n: toCover }) : t("Usa la disponibilità")}
          </Button>
        </Popconfirm>
        </Flex>
      </Flex>

      <Flex gap={16} wrap style={{ marginBottom: 12 }} aria-label={t("Legenda")}>
        <Tag color="blue">{t("Turno")}</Tag>
        <Tag color="gold">{t("Turno modificato")}</Tag>
        <Tag color="green" variant="outlined" style={{ borderStyle: "dashed", background: "transparent" }}>
          {t("Disponibile, non ancora coperto")}
        </Tag>
      </Flex>

      <Card styles={{ body: { padding: 0 } }}>
        <Table<Profile>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={riders}
          loading={loadingA || loadingS}
          pagination={false}
          scroll={{ x: riderWidth + 7 * dayWidth + totalWidth }}
          locale={{ emptyText: <Empty description={t("Nessun rider attivo. Invita i rider dalla sezione Team e rider.")} /> }}
          summary={() =>
            riders.length === 0 ? null : (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>{t("Ore del giorno")}</Typography.Text>
                  </Table.Summary.Cell>
                  {days.map((d, i) => (
                    <Table.Summary.Cell key={d} index={i + 1}>
                      <Typography.Text strong>{formatDuration(dayTotal(d))}</Typography.Text>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>{tn(dayPeople(d), "{n} rider", "{n} rider")}</div>
                      {(missingBy.get(d) ?? 0) > 0 && (
                        <div style={{ fontSize: 12, color: "var(--ant-color-error)" }}>{t("mancano {hours}", { hours: formatDuration(missingBy.get(d) ?? 0) })}</div>
                      )}
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={8} align="right">
                    <Typography.Text strong>{formatDuration(weekTotal)}</Typography.Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )
          }
        />
      </Card>

      {editing && editRider && editCell && (
        <ShiftEditor
          open
          onClose={() => setEditing(null)}
          riderId={editing.riderId}
          riderName={nameOf(editRider)}
          day={editing.day}
          availability={editCell.availability}
          shifts={editCell.shifts}
        />
      )}
    </>
  );
}

type Mode = "week" | "month";

function HoursTab() {
  const { timezone: tz } = useReadyUser();
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => dayjs().tz(tz));

  const { from, to, label } = useMemo(() => {
    if (mode === "week") {
      const start = weekStartOf(anchor);
      const end = start.add(6, "day");
      return { from: start.format("YYYY-MM-DD"), to: end.format("YYYY-MM-DD"), label: `${start.format("D MMM")} – ${end.format("D MMM YYYY")}` };
    }
    const start = dayjs(anchor.format("YYYY-MM-01"));
    return { from: start.format("YYYY-MM-DD"), to: start.endOf("month").format("YYYY-MM-DD"), label: start.format("MMMM YYYY") };
  }, [mode, anchor]);

  const { data: rows = [], isLoading } = useRiderHours(from, to);
  const step = (dir: 1 | -1) => setAnchor((a) => (mode === "week" ? a.add(dir * 7, "day") : a.add(dir, "month")));
  const paid = rows.reduce((n, r) => n + r.paid_minutes, 0);
  const planned = rows.reduce((n, r) => n + r.planned_minutes, 0);

  const exportCsv = () =>
    downloadCsv(
      `ore-rider_${from}_${to}.csv`,
      buildHoursCsv(rows, tz, {
        rider: t("Rider"),
        day: t("Giorno"),
        from: t("Dalle"),
        to: t("Alle"),
        hours: t("Ore da pagare"),
        plannedHours: t("Ore previste"),
        changed: t("Modificato"),
        note: t("Nota"),
        total: t("Totale"),
        yes: t("sì"),
      }),
    );

  const columns: TableColumnsType<RiderHours> = [
    { title: t("Rider"), dataIndex: "name", render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: t("Turni"), dataIndex: "shifts", align: "right", width: 90 },
    {
      title: t("Ore previste"),
      dataIndex: "planned_minutes",
      align: "right",
      width: 130,
      render: (m: number) => formatHours(m),
    },
    {
      title: t("Ore da pagare"),
      dataIndex: "paid_minutes",
      align: "right",
      width: 150,
      render: (m: number) => <Typography.Text strong>{formatHours(m)}</Typography.Text>,
    },
    {
      title: t("Differenza"),
      key: "diff",
      align: "right",
      width: 140,
      render: (_, r) => {
        const diff = r.paid_minutes - r.planned_minutes;
        if (r.adjusted === 0) return <span style={{ opacity: 0.4 }}>—</span>;
        return (
          <Tag color={diff > 0 ? "gold" : diff < 0 ? "default" : "blue"}>
            {diff === 0 ? t("orari cambiati") : `${diff > 0 ? "+" : "−"}${formatDuration(Math.abs(diff))}`}
          </Tag>
        );
      },
    },
  ];

  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
        <Flex gap={8} align="center" wrap>
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "week", label: t("Settimana") },
              { value: "month", label: t("Mese") },
            ]}
          />
          <Button icon={<LeftOutlined />} aria-label={t("Periodo precedente")} onClick={() => step(-1)} />
          <Typography.Text strong style={{ minWidth: 150, textAlign: "center" }}>
            {label}
          </Typography.Text>
          <Button icon={<RightOutlined />} aria-label={t("Periodo successivo")} onClick={() => step(1)} />
        </Flex>
        <Button icon={<DownloadOutlined />} disabled={rows.length === 0} onClick={exportCsv}>
          {t("Esporta CSV")}
        </Button>
      </Flex>

      <Card styles={{ body: { padding: 0 } }}>
        <Table<RiderHours>
          rowKey="rider_id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 640 }}
          locale={{ emptyText: <Empty description={t("Nessun turno in questo periodo")} /> }}
          expandable={{
            expandedRowRender: (r) => (
              <Table
                size="small"
                rowKey="shift_id"
                pagination={false}
                dataSource={r.items}
                columns={[
                  { title: t("Giorno"), dataIndex: "day", width: 130, render: (d: string) => dayjs(d).format("ddd D MMM") },
                  { title: t("Orario"), key: "time", width: 140, render: (_, i) => timeRange(i.start_at, i.end_at, tz) },
                  { title: t("Ore"), key: "h", width: 90, align: "right", render: (_, i) => formatHours(minutesBetween(i.start_at, i.end_at)) },
                  {
                    title: t("Previsto"),
                    key: "p",
                    render: (_, i) =>
                      isAdjusted(i) ? (
                        <Tag color="gold">
                          {timeRange(i.planned_start_at, i.planned_end_at, tz)}
                          {` · ${adjustmentMinutes(i) > 0 ? "+" : "−"}${formatDuration(Math.abs(adjustmentMinutes(i)))}`}
                        </Tag>
                      ) : null,
                  },
                  { title: t("Nota"), dataIndex: "note", ellipsis: true },
                ]}
              />
            ),
          }}
          summary={() =>
            rows.length === 0 ? null : (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <Typography.Text strong>{t("Totale")}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    {rows.reduce((n, r) => n + r.shifts, 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    {formatHours(planned)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Typography.Text strong>{formatHours(paid)}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} />
                </Table.Summary.Row>
              </Table.Summary>
            )
          }
        />
      </Card>
      <Typography.Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 13 }}>
        {t("Le ore da pagare seguono gli orari attuali dei turni. Le ore previste sono quelle decise al momento della pianificazione: la differenza mostra gli extra o le ore ridotte. Un turno conta nel giorno in cui inizia.")}
      </Typography.Text>
    </>
  );
}

export default function AdminShiftsPage() {
  usePageTitle(t("Turni"));
  useShiftsRealtime();
  const [fill, setFill] = useState<{ day: string; scope: "day" | "week" } | null>(null);

  return (
    <>
      <PageHeader
        title={t("Turni")}
        subtitle={t("Disponibilità dei rider, turni a ore e ore da pagare.")}
      />
      <Tabs
        defaultActiveKey="week"
        items={[
          { key: "week", label: t("Settimana"), children: <WeekGrid onAutoFill={(day) => setFill({ day, scope: "week" })} /> },
          { key: "day", label: t("Giornata"), children: <DayTimeline onAutoFill={(day) => setFill({ day, scope: "day" })} /> },
          { key: "hours", label: t("Ore da pagare"), children: <HoursTab /> },
        ]}
        destroyOnHidden
      />
      {fill && <AutoFillModal open onClose={() => setFill(null)} day={fill.day} initialScope={fill.scope} />}
    </>
  );
}
