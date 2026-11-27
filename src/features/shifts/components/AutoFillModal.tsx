import { useMemo, useState } from "react";
import { Alert, Button, Empty, Flex, InputNumber, Modal, Segmented, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { dayjs } from "../../../lib/dates";
import { useReadyUser } from "../../../providers/current-user";
import { autoFill, DEFAULT_FILL, type FillOptions } from "../autofill";
import { dayBounds, toSpan } from "../coverage";
import { useAvailability, useNeeds, useShiftMutations, useShifts } from "../hooks";
import { nameOf, useRiders } from "../riders";
import { formatDuration, weekDayKeys, weekStartOf } from "../time";
import { numberLocale, t, tn } from "../../../i18n";

interface AutoFillModalProps {
  open: boolean;
  onClose: () => void;
  /** The day the admin was looking at. */
  day: string;
  /** Start with the whole week instead of the day. */
  initialScope?: "day" | "week";
}

type Scope = "day" | "week";

const dayText = (ms: number, tz: string) =>
  new Intl.DateTimeFormat(numberLocale(), { timeZone: tz, weekday: "short", day: "numeric", month: "numeric" }).format(ms);
const hm = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);

/**
 * Proposes the shifts that cover the staffing needs of a day or a week from the riders'
 * availability. Nothing is saved until the admin accepts; the shifts can then be edited like any other.
 */
export function AutoFillModal({ open, onClose, day, initialScope = "day" }: AutoFillModalProps) {
  const { timezone: tz } = useReadyUser();
  const { createShifts } = useShiftMutations();
  const [scope, setScope] = useState<Scope>(initialScope);
  const [options, setOptions] = useState<FillOptions>(DEFAULT_FILL);

  const days = useMemo(
    () => (scope === "day" ? [day] : weekDayKeys(weekStartOf(dayjs(day)))),
    [scope, day],
  );
  const bounds = useMemo(() => days.map((d) => dayBounds(d, tz)), [days, tz]);
  const range = useMemo(
    () => ({ from: new Date(bounds[0].start).toISOString(), to: new Date(bounds[bounds.length - 1].end).toISOString() }),
    [bounds],
  );
  const { data: availability = [], isLoading: l1 } = useAvailability(range);
  const { data: shifts = [], isLoading: l2 } = useShifts(range);
  const { data: needs = [], isLoading: l3 } = useNeeds(range);
  const riders = useRiders([]).filter((r) => r.roles.includes("rider") && !r.disabled);

  const result = useMemo(
    () =>
      autoFill(
        bounds,
        riders.map((r) => ({ id: r.id, name: nameOf(r) })),
        availability.map((a) => ({ riderId: a.rider_id, ...toSpan(a) })),
        needs.map((n) => ({ ...toSpan(n), riders: n.riders_needed })),
        shifts.map((s) => ({ riderId: s.rider_id, ...toSpan(s) })),
        options,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds, riders.map((r) => r.id).join(","), availability, needs, shifts, options],
  );

  const rows = result.proposals.map((p, i) => ({
    key: `${p.riderId}-${p.start}-${i}`,
    rider: nameOf(riders.find((r) => r.id === p.riderId) ?? { full_name: "?", email: "?" }),
    day: dayText(p.start, tz),
    time: `${hm(p.start, tz)}–${hm(p.end, tz) === "00:00" ? "24:00" : hm(p.end, tz)}`,
    minutes: (p.end - p.start) / 60_000,
  }));
  const perRider = new Map<string, number>();
  for (const r of rows) perRider.set(r.rider, (perRider.get(r.rider) ?? 0) + r.minutes);
  const hasNeeds = result.required > 0;
  const missing = result.required - result.coveredAfter;

  const apply = () =>
    createShifts.mutate(
      result.proposals.map((p) => ({ riderId: p.riderId, startAt: new Date(p.start).toISOString(), endAt: new Date(p.end).toISOString() })),
      { onSuccess: onClose },
    );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t("Riempi in automatico")}
      width={760}
      destroyOnHidden
      footer={
        <Flex justify="space-between" align="center" wrap gap={8}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("Anteprima: i turni non sono creati finché non confermi.")}
          </Typography.Text>
          <Space>
            <Button onClick={onClose}>{t("Annulla")}</Button>
            <Button type="primary" disabled={rows.length === 0} loading={createShifts.isPending} onClick={apply}>
              {rows.length > 0 ? tn(rows.length, "Crea {n} turno", "Crea {n} turni") : t("Crea turni")}
            </Button>
          </Space>
        </Flex>
      }
    >
      <Flex gap={12} wrap align="center" style={{ marginBottom: 12 }}>
        <Segmented<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "day", label: t("Questo giorno") },
            { value: "week", label: t("Tutta la settimana") },
          ]}
        />
        <Flex gap={6} align="center">
          <Typography.Text type="secondary">{t("Turno minimo")}</Typography.Text>
          <Select
            value={options.minMinutes}
            onChange={(v) => setOptions((o) => ({ ...o, minMinutes: v }))}
            style={{ width: 96 }}
            options={[30, 60, 120, 180, 240].map((m) => ({ value: m, label: formatDuration(m) }))}
            aria-label={t("Turno minimo")}
          />
        </Flex>
        <Flex gap={6} align="center">
          <Typography.Text type="secondary">{t("Ore massime al giorno")}</Typography.Text>
          <InputNumber
            min={2}
            max={16}
            value={options.dailyMaxMinutes / 60}
            onChange={(v) => setOptions((o) => ({ ...o, dailyMaxMinutes: (v ?? 10) * 60, maxMinutes: Math.min((v ?? 10) * 60, 16 * 60) }))}
            style={{ width: 70 }}
            aria-label={t("Ore massime al giorno")}
          />
        </Flex>
        <Flex gap={6} align="center">
          <Switch checked={options.balance} onChange={(v) => setOptions((o) => ({ ...o, balance: v }))} aria-label={t("Distribuisci le ore in modo equo")} />
          <Typography.Text>{t("Distribuisci le ore in modo equo")}</Typography.Text>
        </Flex>
      </Flex>

      {!hasNeeds && !(l1 || l2 || l3) ? (
        <Empty description={t("Non c’è nessun fabbisogno nel periodo. Indica quanti rider servono nella scheda Giornata.")} />
      ) : (
        <>
          <Alert
            type={missing > 0 ? "warning" : "success"}
            showIcon
            style={{ marginBottom: 12 }}
            title={
              missing > 0
                ? t("Copertura: da {before} a {after} su {required}. Mancano {missing}.", {
                    before: formatDuration(result.coveredBefore),
                    after: formatDuration(result.coveredAfter),
                    required: formatDuration(result.required),
                    missing: formatDuration(missing),
                  })
                : rows.length === 0
                  ? t("Tutto il fabbisogno è già coperto.")
                  : t("Con questi turni il fabbisogno è coperto: {required}.", { required: formatDuration(result.required) })
            }
          />
          {result.gaps.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary">{t("Restano scoperti (nessun rider disponibile):")}</Typography.Text>
              <Flex gap={6} wrap style={{ marginTop: 6 }}>
                {result.gaps.map((g) => (
                  <Tag key={`${g.start}`} color="red">
                    {dayText(g.start, tz)} {hm(g.start, tz)}–{hm(g.end, tz) === "00:00" ? "24:00" : hm(g.end, tz)} · {tn(g.missing, "manca {n} rider", "mancano {n} rider")}
                  </Tag>
                ))}
              </Flex>
            </div>
          )}
          {rows.length > 0 && (
            <>
              <Flex gap={6} wrap style={{ marginBottom: 8 }}>
                {[...perRider.entries()].map(([name, minutes]) => (
                  <Tag key={name}>{name}: {formatDuration(minutes)}</Tag>
                ))}
              </Flex>
              <Table
                size="small"
                rowKey="key"
                pagination={rows.length > 8 ? { pageSize: 8, size: "small" } : false}
                loading={l1 || l2 || l3}
                dataSource={rows}
                columns={[
                  { title: t("Giorno"), dataIndex: "day", width: 120 },
                  { title: t("Orario"), dataIndex: "time", width: 130 },
                  { title: t("Rider"), dataIndex: "rider" },
                  { title: t("Ore"), dataIndex: "minutes", width: 90, align: "right", render: (m: number) => formatDuration(m) },
                ]}
              />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
