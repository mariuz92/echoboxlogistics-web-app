import { useEffect, useMemo, useState } from "react";
import { Button, Card, Dropdown, Flex, InputNumber, Popconfirm, Typography } from "antd";
import { CopyOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { dayjs } from "../../../lib/dates";
import type { ShiftNeed } from "../api";
import { useShiftMutations } from "../hooks";
import { dayKeyOf, formatDuration, shiftInstants, slotMinutes, timeOf } from "../time";
import { TimeField } from "./TimeField";
import { t } from "../../../i18n";

interface NeedRowProps {
  need: ShiftNeed;
  day: string;
  tz: string;
}

function NeedRow({ need, day, tz }: NeedRowProps) {
  const { saveNeed, deleteNeed } = useShiftMutations();
  const initial = useMemo(
    () => ({ start: timeOf(need.start_at, tz), end: timeOf(need.end_at, tz), riders: need.riders_needed }),
    [need.start_at, need.end_at, need.riders_needed, tz],
  );
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [riders, setRiders] = useState<number>(initial.riders);
  useEffect(() => {
    setStart(initial.start);
    setEnd(initial.end);
    setRiders(initial.riders);
  }, [initial]);

  const dirty = start !== initial.start || end !== initial.end || riders !== initial.riders;
  const minutes = slotMinutes(day, start, end, tz);
  const valid = minutes > 0 && minutes <= 24 * 60 && riders >= 1 && riders <= 50;

  return (
    <Flex gap={8} wrap align="center" style={{ padding: "6px 0" }}>
      <TimeField value={start} onChange={setStart} label={t("Dalle")} />
      <span aria-hidden>–</span>
      <TimeField value={end} onChange={setEnd} label={t("Alle")} />
      <InputNumber min={1} max={50} value={riders} onChange={(v) => setRiders(v ?? 1)} style={{ width: 72 }} aria-label={t("Rider necessari")} />
      <Typography.Text type="secondary">{t("rider")}</Typography.Text>
      <Typography.Text type="secondary" style={{ minWidth: 56 }}>
        {valid ? formatDuration(minutes) : ""}
      </Typography.Text>
      <Button
        type="primary"
        disabled={!dirty || !valid}
        loading={saveNeed.isPending}
        onClick={() => {
          const { start: startAt, end: endAt } = shiftInstants(day, start, end, tz);
          saveNeed.mutate({ startAt, endAt, ridersNeeded: riders, needId: need.id });
        }}
      >
        {t("Salva")}
      </Button>
      <Popconfirm title={t("Eliminare il fabbisogno?")} okText={t("Elimina")} cancelText={t("Annulla")} okButtonProps={{ danger: true }} onConfirm={() => deleteNeed.mutate(need.id)}>
        <Button danger icon={<DeleteOutlined />} aria-label={t("Elimina fabbisogno")} />
      </Popconfirm>
    </Flex>
  );
}

interface NeedsEditorProps {
  day: string;
  weekStart: string;
  needs: ShiftNeed[];
  tz: string;
}

/** The riders needed in each block of the day, and a way to copy them to other days. */
export function NeedsEditor({ day, weekStart, needs, tz }: NeedsEditorProps) {
  const { saveNeed, copyNeeds } = useShiftMutations();
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [riders, setRiders] = useState<number>(2);
  const mine = needs.filter((n) => dayKeyOf(n.start_at, tz) === day);
  const minutes = slotMinutes(day, start, end, tz);
  const valid = minutes > 0 && minutes <= 24 * 60;
  const weekEnd = dayjs(weekStart).add(6, "day").format("YYYY-MM-DD");
  const daysLeft = dayjs(weekEnd).diff(dayjs(day), "day");

  const copyToRestOfWeek = async () => {
    for (let offset = 1; offset <= daysLeft; offset++) await copyNeeds.mutateAsync({ from: day, to: day, offsetDays: offset });
  };

  return (
    <Card
      size="small"
      title={t("Rider necessari")}
      extra={
        <Dropdown
          disabled={mine.length === 0 && needs.length === 0}
          menu={{
            items: [
              { key: "rest", label: t("Nei giorni successivi della settimana"), disabled: daysLeft < 1 || mine.length === 0 },
              { key: "next", label: t("Nello stesso giorno della prossima settimana"), disabled: mine.length === 0 },
              { key: "week", label: t("Tutta la settimana nella prossima") },
            ],
            onClick: ({ key }) => {
              if (key === "rest") void copyToRestOfWeek();
              if (key === "next") copyNeeds.mutate({ from: day, to: day, offsetDays: 7 });
              if (key === "week") copyNeeds.mutate({ from: weekStart, to: weekEnd, offsetDays: 7 });
            },
          }}
        >
          <Button icon={<CopyOutlined />} loading={copyNeeds.isPending}>
            {t("Copia in…")}
          </Button>
        </Dropdown>
      }
    >
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("Indica quanti rider servono in ogni fascia: la griglia mostra se sono coperti e il riempimento automatico usa questi numeri.")}
      </Typography.Text>
      {mine.length === 0 && <Typography.Text style={{ display: "block", margin: "4px 0 8px" }}>{t("Nessun fabbisogno per questo giorno.")}</Typography.Text>}
      {mine.map((n) => (
        <NeedRow key={n.id} need={n} day={day} tz={tz} />
      ))}
      <Flex gap={8} wrap align="center" style={{ paddingTop: 10, borderTop: mine.length ? "1px solid var(--ant-color-border-secondary)" : undefined }}>
        <TimeField value={start} onChange={setStart} label={t("Dalle")} />
        <span aria-hidden>–</span>
        <TimeField value={end} onChange={setEnd} label={t("Alle")} />
        <InputNumber min={1} max={50} value={riders} onChange={(v) => setRiders(v ?? 1)} style={{ width: 72 }} aria-label={t("Rider necessari")} />
        <Typography.Text type="secondary">{t("rider")}</Typography.Text>
        <Button
          icon={<PlusOutlined />}
          disabled={!valid}
          loading={saveNeed.isPending}
          onClick={() => {
            const { start: startAt, end: endAt } = shiftInstants(day, start, end, tz);
            saveNeed.mutate({ startAt, endAt, ridersNeeded: riders });
          }}
        >
          {t("Aggiungi")}
        </Button>
      </Flex>
    </Card>
  );
}
