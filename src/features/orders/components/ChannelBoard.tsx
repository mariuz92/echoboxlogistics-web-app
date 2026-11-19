import { useEffect, useMemo, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Row,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useReadyUser } from "../../../providers/current-user";
import { getErrorMessage } from "../../../lib/errors";
import { dayjs, fmtDateTime, fmtTime, isoToWallClock, type Dayjs } from "../../../lib/dates";
import { StatusTag } from "../../../shared/components/StatusTag";
import {
  MAX_CHANNELS,
  channelCount,
  formatChannelList,
  parseChannelList,
  type ChannelUse,
} from "../../../types/domain";
import { updateTenant } from "../../settings/api";
import { queryKeys, useChannelBoard } from "../hooks";

interface ChannelBoardProps {
  open: boolean;
  onClose: () => void;
}

const COLORS = {
  free: { bg: "#dcfce7", border: "#86efac", fg: "#166534", label: "Libero" },
  busy: { bg: "#fef3c7", border: "#fcd34d", fg: "#92400e", label: "In uso" },
  disabled: { bg: "#fee2e2", border: "#fca5a5", fg: "#991b1b", label: "Disabilitato" },
} as const;

/** Channels drawn per page: small ranges fit on one page, big ones are browsed. */
const PAGE_SIZE = 100;
const ONE_PAGE_UP_TO = 120;

/** True when two of the orders hold the channel at the same time. */
const overlapping = (list: ChannelUse[]) =>
  list.some((a, i) =>
    list
      .slice(i + 1)
      .some((b) => Date.parse(a.delivery_at) < Date.parse(b.busy_until) && Date.parse(b.delivery_at) < Date.parse(a.busy_until)),
  );

const dayBounds = (day: Dayjs, tz: string) => {
  const from = dayjs.tz(day.format("YYYY-MM-DD"), tz);
  return { from: from.toISOString(), to: from.add(1, "day").toISOString() };
};

/**
 * Radio channel map and settings, for any equipment (1 to 10,000 channels).
 *
 * A channel is "in use" on a day when an open order holds it at some point of
 * that day: from delivery to pickup (or to the end of the delivery day when no
 * pickup is planned). That is derived from the orders by the database and cannot
 * be edited here. The settings are the channel range, whether a channel serves one
 * group at a time, and which channels are disabled (broken or reserved).
 */
export function ChannelBoard({ open, onClose }: ChannelBoardProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { tenant, timezone, refresh } = useReadyUser();

  const [min, setMin] = useState(tenant.channel_min);
  const [max, setMax] = useState(tenant.channel_max);
  const [exclusive, setExclusive] = useState(tenant.channels_exclusive);
  const [disabledText, setDisabledText] = useState(formatChannelList(tenant.disabled_channels));
  const [day, setDay] = useState<Dayjs>(() => isoToWallClock(new Date().toISOString(), timezone));
  const [page, setPage] = useState(1);
  const [focus, setFocus] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMin(tenant.channel_min);
    setMax(tenant.channel_max);
    setExclusive(tenant.channels_exclusive);
    setDisabledText(formatChannelList(tenant.disabled_channels));
    setPage(1);
    setFocus(null);
  }, [open, tenant]);

  const range = useMemo(() => dayBounds(day, timezone), [day, timezone]);
  const { data: uses = [], isFetching } = useChannelBoard(range, open);

  const count = max >= min ? channelCount({ channel_min: min, channel_max: max }) : 0;
  const rangeError =
    max < min ? "L'ultimo canale deve essere uguale o successivo al primo." : count > MAX_CHANNELS ? `Al massimo ${MAX_CHANNELS.toLocaleString("it-IT")} canali.` : null;

  const parsedDisabled = useMemo(() => parseChannelList(disabledText), [disabledText]);
  const disabled = useMemo(
    () => new Set((parsedDisabled ?? []).filter((c) => c >= min && c <= max)),
    [parsedDisabled, min, max],
  );

  const byChannel = useMemo(() => {
    const map = new Map<number, ChannelUse[]>();
    for (const u of uses) map.set(u.channel, [...(map.get(u.channel) ?? []), u]);
    return map;
  }, [uses]);

  const busyCount = [...byChannel.keys()].filter((c) => c >= min && c <= max).length;
  const counts = {
    free: Math.max(0, count - busyCount - [...disabled].filter((c) => !byChannel.has(c)).length),
    busy: busyCount,
    disabled: [...disabled].filter((c) => !byChannel.has(c)).length,
  };

  const pageSize = count <= ONE_PAGE_UP_TO ? Math.max(count, 1) : PAGE_SIZE;
  const firstOnPage = min + (page - 1) * pageSize;
  const visible = rangeError
    ? []
    : Array.from({ length: Math.max(0, Math.min(pageSize, max - firstOnPage + 1)) }, (_, i) => firstOnPage + i);

  const dirty =
    min !== tenant.channel_min ||
    max !== tenant.channel_max ||
    exclusive !== tenant.channels_exclusive ||
    formatChannelList([...disabled]) !== formatChannelList(tenant.disabled_channels);

  const toggle = (channel: number) => {
    if (byChannel.has(channel)) return;
    const next = new Set(disabled);
    if (next.has(channel)) next.delete(channel);
    else next.add(channel);
    setDisabledText(formatChannelList([...next]));
  };

  const goTo = (channel: number | null) => {
    setFocus(channel);
    if (channel === null || channel < min || channel > max) return;
    setPage(Math.floor((channel - min) / pageSize) + 1);
  };

  const save = async () => {
    if (rangeError || parsedDisabled === null) return;
    setSaving(true);
    try {
      await updateTenant(tenant.id, {
        channel_min: min,
        channel_max: max,
        channels_exclusive: exclusive,
        disabled_channels: [...disabled].sort((a, b) => a - b),
      });
      await refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
      void message.success("Canali aggiornati");
      onClose();
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const focusUses = focus !== null ? byChannel.get(focus) ?? [] : [];
  const focusState =
    focus === null
      ? null
      : focus < min || focus > max
        ? "fuori dall'intervallo"
        : disabled.has(focus)
          ? "disabilitato"
          : focusUses.length
            ? `in uso: ${focusUses.map((u) => `${u.guide_name} ${fmtTime(u.delivery_at, timezone)}–${fmtTime(u.busy_until, timezone)}`).join(", ")}`
            : "libero tutto il giorno";

  return (
    <Modal
      title="Canali radio"
      open={open}
      onCancel={onClose}
      width={1000}
      destroyOnHidden
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose}>Chiudi</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={save}
            loading={saving}
            disabled={!dirty || Boolean(rangeError) || parsedDisabled === null}
          >
            Salva
          </Button>
        </Flex>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={9}>
          <Card size="small" title="I tuoi canali">
            <Flex vertical gap={16}>
              <div>
                <Typography.Text strong>Numerazione</Typography.Text>
                <Flex align="center" gap={8} style={{ marginTop: 6 }}>
                  <span>dal</span>
                  <InputNumber
                    id="channel_min"
                    aria-label="Primo canale"
                    min={0}
                    max={99999}
                    precision={0}
                    value={min}
                    onChange={(v) => {
                      setMin(v ?? 0);
                      setPage(1);
                    }}
                    style={{ width: 96 }}
                  />
                  <span>al</span>
                  <InputNumber
                    id="channel_max"
                    aria-label="Ultimo canale"
                    min={0}
                    max={99999}
                    precision={0}
                    value={max}
                    onChange={(v) => {
                      setMax(v ?? 0);
                      setPage(1);
                    }}
                    style={{ width: 96 }}
                  />
                </Flex>
                <Typography.Text type={rangeError ? "danger" : "secondary"} style={{ display: "block", marginTop: 6 }}>
                  {rangeError ?? `${count.toLocaleString("it-IT")} ${count === 1 ? "canale" : "canali"}. Qualsiasi radioguida: da 1 a 10.000 canali.`}
                </Typography.Text>
              </div>

              <div>
                <Flex align="center" justify="space-between" gap={12}>
                  <Typography.Text strong>Un gruppo per canale</Typography.Text>
                  <Switch id="channels_exclusive" checked={exclusive} onChange={setExclusive} aria-label="Un gruppo per canale" />
                </Flex>
                <Typography.Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                  {exclusive
                    ? "Rondo non permette di dare lo stesso canale a due gruppi negli stessi orari."
                    : "Più gruppi possono usare lo stesso canale insieme: Rondo lo segnala ma non lo blocca."}
                </Typography.Text>
              </div>

              <div>
                <Typography.Text strong>Canali disabilitati</Typography.Text>
                <Input
                  id="disabled_channels"
                  aria-label="Canali disabilitati"
                  placeholder="Es. 13, 20-22"
                  value={disabledText}
                  onChange={(e) => setDisabledText(e.target.value)}
                  status={parsedDisabled === null ? "error" : undefined}
                  style={{ marginTop: 6 }}
                />
                <Typography.Text
                  type={parsedDisabled === null ? "danger" : "secondary"}
                  style={{ display: "block", marginTop: 6 }}
                >
                  {parsedDisabled === null
                    ? "Scrivi numeri o intervalli separati da virgole, per esempio 13, 20-22."
                    : "Canali guasti o riservati: non vengono mai proposti. Puoi anche cliccarli nella mappa."}
                </Typography.Text>
              </div>
            </Flex>
          </Card>
        </Col>

        <Col xs={24} md={15}>
          <Card
            size="small"
            title={
              <Flex align="center" gap={8} wrap>
                <span>Occupazione del</span>
                <DatePicker
                  aria-label="Giorno"
                  value={day}
                  onChange={(d) => d && setDay(d)}
                  format="DD/MM/YYYY"
                  allowClear={false}
                  size="small"
                />
              </Flex>
            }
            extra={
              <InputNumber
                aria-label="Vai al canale"
                placeholder="Vai al canale"
                min={0}
                max={99999}
                precision={0}
                size="small"
                value={focus}
                onChange={(v) => goTo(v)}
                style={{ width: 130 }}
              />
            }
          >
            <Flex vertical gap={12}>
              <Flex gap={8} wrap>
                <Tag color="green" variant="filled">Liberi: {counts.free.toLocaleString("it-IT")}</Tag>
                <Tag color="gold" variant="filled">Usati in giornata: {counts.busy.toLocaleString("it-IT")}</Tag>
                <Tag color="red" variant="filled">Disabilitati: {counts.disabled.toLocaleString("it-IT")}</Tag>
              </Flex>
              {focusState && (
                <Alert type={focusUses.length ? "warning" : "info"} showIcon title={`Canale ${focus}: ${focusState}`} />
              )}
              <Typography.Text type="secondary">
                Un canale è occupato dalla consegna al ritiro, o fino a fine giornata se il ritiro non è pianificato.
                Clicca un canale libero per disabilitarlo.
              </Typography.Text>

              <Flex wrap gap={6} style={{ opacity: isFetching ? 0.6 : 1 }}>
                {visible.map((channel) => {
                  const list = byChannel.get(channel) ?? [];
                  const state = list.length ? "busy" : disabled.has(channel) ? "disabled" : "free";
                  const c = COLORS[state];
                  const conflict = exclusive && overlapping(list);
                  return (
                    <Tooltip
                      key={channel}
                      title={
                        list.length ? (
                          <>
                            {list.map((u) => (
                              <div key={u.order_id}>
                                Canale {channel} · {u.guide_name} · {fmtDateTime(u.delivery_at, timezone)} –{" "}
                                {fmtTime(u.busy_until, timezone)}
                              </div>
                            ))}
                          </>
                        ) : (
                          `Canale ${channel} · ${c.label}`
                        )
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggle(channel)}
                        aria-label={`Canale ${channel}: ${c.label}`}
                        aria-pressed={state === "disabled"}
                        disabled={state === "busy"}
                        style={{
                          position: "relative",
                          minWidth: 46,
                          height: 36,
                          padding: "0 6px",
                          borderRadius: 8,
                          border: `1px solid ${conflict ? "#dc2626" : c.border}`,
                          outline: focus === channel ? "2px solid #1d5fa8" : undefined,
                          outlineOffset: 1,
                          background: c.bg,
                          color: c.fg,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          cursor: state === "busy" ? "not-allowed" : "pointer",
                        }}
                      >
                        {channel}
                        {list.length > 1 && (
                          <sup style={{ marginLeft: 2, fontSize: 10 }} aria-label={`${list.length} gruppi`}>
                            ×{list.length}
                          </sup>
                        )}
                      </button>
                    </Tooltip>
                  );
                })}
              </Flex>

              {count > pageSize && !rangeError && (
                <Pagination
                  size="small"
                  current={page}
                  pageSize={pageSize}
                  total={count}
                  onChange={setPage}
                  showSizeChanger={false}
                  showTotal={(_, [a, b]) => `Canali ${min + a - 1}–${min + b - 1}`}
                />
              )}

              <div>
                <Typography.Text strong>
                  In uso in questa giornata ({uses.length})
                </Typography.Text>
                <Table<ChannelUse>
                  size="small"
                  style={{ marginTop: 8 }}
                  rowKey={(u) => `${u.channel}-${u.order_id}`}
                  dataSource={uses}
                  loading={isFetching && uses.length === 0}
                  pagination={uses.length > 6 ? { pageSize: 6, size: "small", showSizeChanger: false } : false}
                  locale={{ emptyText: "Nessun canale in uso in questa giornata" }}
                  columns={[
                    { title: "Canale", dataIndex: "channel", width: 80 },
                    { title: "Guida", dataIndex: "guide_name", ellipsis: true },
                    {
                      title: "Occupato",
                      key: "when",
                      render: (_, u) =>
                        `${fmtDateTime(u.delivery_at, timezone)} – ${
                          dayjs(u.busy_until).tz(timezone).isSame(dayjs(u.delivery_at).tz(timezone), "day")
                            ? fmtTime(u.busy_until, timezone)
                            : fmtDateTime(u.busy_until, timezone)
                        }`,
                    },
                    { title: "Stato", dataIndex: "status", render: (s) => <StatusTag status={s} /> },
                  ]}
                />
              </div>
            </Flex>
          </Card>
        </Col>
      </Row>
    </Modal>
  );
}
