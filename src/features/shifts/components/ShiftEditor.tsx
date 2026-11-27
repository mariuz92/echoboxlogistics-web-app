import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Divider, Empty, Flex, Input, List, Modal, Popconfirm, Space, Tag, Typography } from "antd";
import { DeleteOutlined, HistoryOutlined, PlusOutlined } from "@ant-design/icons";
import { dayjs, fmtDateTime } from "../../../lib/dates";
import { useReadyUser } from "../../../providers/current-user";
import { useMembers } from "../../orders/hooks";
import type { RiderAvailability, RiderShift } from "../api";
import { useShiftEvents, useShiftMutations } from "../hooks";
import {
  MAX_SLOT_MINUTES,
  adjustmentMinutes,
  formatDuration,
  isAdjusted,
  isCovered,
  minutesBetween,
  shiftInstants,
  slotMinutes,
  timeOf,
  timeRange,
  uncovered,
} from "../time";
import { TimeField } from "./TimeField";
import { t } from "../../../i18n";

interface ShiftEditorProps {
  open: boolean;
  onClose: () => void;
  riderId: string;
  riderName: string;
  /** The day being edited, "YYYY-MM-DD" (company time zone). */
  day: string;
  availability: RiderAvailability[];
  shifts: RiderShift[];
}

/** Why a typed shift cannot be saved yet, or null. */
function problemOf(day: string, start: string, end: string, tz: string): string | null {
  const minutes = slotMinutes(day, start, end, tz);
  if (minutes <= 0) return t("La fine deve essere dopo l’inizio.");
  if (minutes > MAX_SLOT_MINUTES) return t("Un turno può durare al massimo 16 ore.");
  return null;
}

function signedDuration(minutes: number): string {
  return `${minutes > 0 ? "+" : "−"}${formatDuration(Math.abs(minutes))}`;
}

function ShiftHistory({ shiftId, tz }: { shiftId: string; tz: string }) {
  const { data: events = [], isLoading } = useShiftEvents(shiftId);
  const { data: members = [] } = useMembers();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.full_name || t("Un amministratore");
  const range = (a: string | null, b: string | null) => (a && b ? timeRange(a, b, tz) : "");

  if (isLoading) return null;
  return (
    <List
      size="small"
      dataSource={events}
      locale={{ emptyText: t("Nessuna modifica registrata.") }}
      renderItem={(e) => (
        <List.Item>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {fmtDateTime(e.created_at, tz)} · {nameOf(e.actor_id)} ·{" "}
            {e.event_type === "created"
              ? t("ha creato il turno {range}", { range: range(e.new_start_at, e.new_end_at) })
              : e.event_type === "changed"
                ? t("ha cambiato gli orari da {from} a {to}", {
                    from: range(e.old_start_at, e.old_end_at),
                    to: range(e.new_start_at, e.new_end_at),
                  })
                : t("ha eliminato il turno {range}", { range: range(e.old_start_at, e.old_end_at) })}
          </Typography.Text>
        </List.Item>
      )}
    />
  );
}

interface ShiftRowProps {
  shift: RiderShift;
  day: string;
  tz: string;
  covered: boolean;
}

function ShiftRow({ shift, day, tz, covered }: ShiftRowProps) {
  const { saveShift, deleteShift } = useShiftMutations();
  const initial = useMemo(
    () => ({ start: timeOf(shift.start_at, tz), end: timeOf(shift.end_at, tz), note: shift.note }),
    [shift.start_at, shift.end_at, shift.note, tz],
  );
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [note, setNote] = useState(initial.note);
  const [history, setHistory] = useState(false);

  // someone else changed the shift: show the new times
  useEffect(() => {
    setStart(initial.start);
    setEnd(initial.end);
    setNote(initial.note);
  }, [initial]);

  const dirty = start !== initial.start || end !== initial.end || note !== initial.note;
  const problem = problemOf(day, start, end, tz);
  const minutes = problem ? 0 : slotMinutes(day, start, end, tz);
  const delta = adjustmentMinutes(shift);

  const save = () => {
    const { start: startAt, end: endAt } = shiftInstants(day, start, end, tz);
    saveShift.mutate({ riderId: shift.rider_id, startAt, endAt, note: note.trim(), shiftId: shift.id });
  };

  return (
    <div style={{ padding: "12px 0" }}>
      <Flex gap={8} wrap align="center">
        <TimeField value={start} onChange={setStart} label={t("Inizio turno")} />
        <span aria-hidden>–</span>
        <TimeField value={end} onChange={setEnd} label={t("Fine turno")} />
        <Typography.Text strong style={{ minWidth: 64 }}>
          {problem ? "" : formatDuration(minutes)}
        </Typography.Text>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("Nota (facoltativa)")}
          maxLength={200}
          style={{ flex: "1 1 160px", minWidth: 140 }}
          aria-label={t("Nota")}
        />
        <Button type="primary" disabled={!dirty || Boolean(problem)} loading={saveShift.isPending} onClick={save}>
          {t("Salva")}
        </Button>
        <Popconfirm
          title={t("Eliminare il turno?")}
          description={t("Le ore di questo turno non saranno più conteggiate.")}
          okText={t("Elimina")}
          cancelText={t("Annulla")}
          okButtonProps={{ danger: true }}
          onConfirm={() => deleteShift.mutate(shift.id)}
        >
          <Button danger icon={<DeleteOutlined />} aria-label={t("Elimina turno")} loading={deleteShift.isPending} />
        </Popconfirm>
        <Button icon={<HistoryOutlined />} type={history ? "default" : "text"} onClick={() => setHistory((v) => !v)} aria-label={t("Storico modifiche")} />
      </Flex>
      {problem && dirty && (
        <Typography.Text type="danger" style={{ display: "block", marginTop: 6 }}>
          {problem}
        </Typography.Text>
      )}
      <Flex gap={6} wrap style={{ marginTop: 6 }}>
        {isAdjusted(shift) && (
          <Tag color="gold">
            {t("Pianificato {range}", { range: timeRange(shift.planned_start_at, shift.planned_end_at, tz) })}
            {delta !== 0 && ` · ${signedDuration(delta)}`}
          </Tag>
        )}
        {!covered && <Tag color="orange">{t("Fuori dalla disponibilità indicata")}</Tag>}
      </Flex>
      {history && <ShiftHistory shiftId={shift.id} tz={tz} />}
    </div>
  );
}

/** Plan and change the shifts of one rider on one day, starting from what the rider is available for. */
export function ShiftEditor({ open, onClose, riderId, riderName, day, availability, shifts }: ShiftEditorProps) {
  const { timezone: tz } = useReadyUser();
  const { saveShift } = useShiftMutations();
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [note, setNote] = useState("");

  const free = useMemo(() => uncovered(availability, shifts), [availability, shifts]);
  const problem = problemOf(day, start, end, tz);
  const total = shifts.reduce((sum, s) => sum + minutesBetween(s.start_at, s.end_at), 0);

  const dayText = dayjs(day).format("dddd D MMMM");
  const title = `${riderName} · ${dayText.charAt(0).toUpperCase()}${dayText.slice(1)}`;
  const add = () => {
    const { start: startAt, end: endAt } = shiftInstants(day, start, end, tz);
    saveShift.mutate({ riderId, startAt, endAt, note: note.trim() }, { onSuccess: () => setNote("") });
  };
  const assign = (a: RiderAvailability) =>
    saveShift.mutate({ riderId, startAt: a.start_at, endAt: a.end_at });

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={title} width={720} destroyOnHidden>
      <Typography.Text type="secondary">{t("Disponibilità indicata dal rider")}</Typography.Text>
      {availability.length === 0 ? (
        <Alert type="info" showIcon style={{ marginTop: 8 }} title={t("Il rider non ha indicato disponibilità per questo giorno.")} />
      ) : (
        <Flex gap={8} wrap style={{ margin: "8px 0 0" }}>
          {availability.map((a) => {
            const taken = !free.includes(a);
            return (
              <Space key={a.id} size={4}>
                <Tag color="green" variant="outlined" style={{ margin: 0, fontSize: 14 }}>
                  {timeRange(a.start_at, a.end_at, tz)}
                </Tag>
                {!taken && (
                  <Button size="small" onClick={() => assign(a)} loading={saveShift.isPending}>
                    {t("Assegna")}
                  </Button>
                )}
              </Space>
            );
          })}
        </Flex>
      )}

      <Divider style={{ margin: "16px 0 4px" }} />
      <Flex justify="space-between" align="baseline">
        <Typography.Text type="secondary">{t("Turni")}</Typography.Text>
        {shifts.length > 0 && <Typography.Text strong>{t("Totale del giorno: {hours}", { hours: formatDuration(total) })}</Typography.Text>}
      </Flex>
      {shifts.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("Nessun turno in questo giorno")} />
      ) : (
        <div>
          {shifts.map((s) => (
            <ShiftRow
              key={s.id}
              shift={s}
              day={day}
              tz={tz}
              covered={isCovered(s, availability)}
            />
          ))}
        </div>
      )}

      <Divider style={{ margin: "8px 0 12px" }} />
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("Aggiungi un turno")}
      </Typography.Text>
      <Flex gap={8} wrap align="center">
        <TimeField value={start} onChange={setStart} label={t("Inizio turno")} />
        <span aria-hidden>–</span>
        <TimeField value={end} onChange={setEnd} label={t("Fine turno")} />
        <Typography.Text strong style={{ minWidth: 64 }}>
          {problem ? "" : formatDuration(slotMinutes(day, start, end, tz))}
        </Typography.Text>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("Nota (facoltativa)")}
          maxLength={200}
          style={{ flex: "1 1 160px", minWidth: 140 }}
          aria-label={t("Nota")}
        />
        <Button type="primary" icon={<PlusOutlined />} disabled={Boolean(problem)} loading={saveShift.isPending} onClick={add}>
          {t("Aggiungi")}
        </Button>
      </Flex>
      <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
        {t("Se la fine non è dopo l’inizio, il turno finisce il giorno dopo (turno di notte). Puoi cambiare gli orari anche dopo: le ore previste restano registrate per confronto.")}
      </Typography.Text>
    </Modal>
  );
}

