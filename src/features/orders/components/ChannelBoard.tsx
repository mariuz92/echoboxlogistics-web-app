import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, DatePicker, Flex, Input, InputNumber, Modal, Popconfirm, Switch, Table, Tag, Typography } from "antd";
import { ExportOutlined, SaveOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useReadyUser } from "../../../providers/current-user";
import { getErrorMessage } from "../../../lib/errors";
import { dayjs, fmtDateTime, fmtTime, getPeriodRange, isoToWallClock, type DateRange, type Dayjs } from "../../../lib/dates";
import { StatusTag } from "../../../shared/components/StatusTag";
import { MAX_CHANNELS, channelCount, formatChannelList, parseChannelList, type ChannelUse } from "../../../types/domain";
import { updateTenant } from "../../settings/api";
import { queryKeys, useChannelBoard, useOrderMutations } from "../hooks";
import { getChannelFreeActions } from "../orderActions";
import { numberLocale, t, tn } from "../../../i18n";

interface ChannelBoardProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Radio channel settings, for any equipment (1 to 10,000 channels). Channels are
 * typed on each order (the order form says whether a channel is free); there is
 * deliberately no map of every channel. Occupied channels: <OccupiedChannels />.
 */
export function ChannelSettings({ open, onClose }: ChannelBoardProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { tenant, refresh } = useReadyUser();

  const [min, setMin] = useState(tenant.channel_min);
  const [max, setMax] = useState(tenant.channel_max);
  const [exclusive, setExclusive] = useState(tenant.channels_exclusive);
  const [disabledText, setDisabledText] = useState(formatChannelList(tenant.disabled_channels));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMin(tenant.channel_min);
    setMax(tenant.channel_max);
    setExclusive(tenant.channels_exclusive);
    setDisabledText(formatChannelList(tenant.disabled_channels));
  }, [open, tenant]);

  const count = max >= min ? channelCount({ channel_min: min, channel_max: max }) : 0;
  const rangeError =
    max < min
      ? t("L'ultimo canale deve essere uguale o successivo al primo.")
      : count > MAX_CHANNELS
        ? t("Al massimo {n} canali.", { n: MAX_CHANNELS.toLocaleString(numberLocale()) })
        : null;

  const parsedDisabled = useMemo(() => parseChannelList(disabledText), [disabledText]);
  const disabled = useMemo(
    () => (parsedDisabled ?? []).filter((c) => c >= min && c <= max),
    [parsedDisabled, min, max],
  );

  const dirty =
    min !== tenant.channel_min ||
    max !== tenant.channel_max ||
    exclusive !== tenant.channels_exclusive ||
    formatChannelList(disabled) !== formatChannelList(tenant.disabled_channels);

  const save = async () => {
    if (rangeError || parsedDisabled === null) return;
    setSaving(true);
    try {
      await updateTenant(tenant.id, {
        channel_min: min,
        channel_max: max,
        channels_exclusive: exclusive,
        disabled_channels: disabled,
      });
      await refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
      void message.success(t("Canali aggiornati"));
      onClose();
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("Canali radio")}
      open={open}
      onCancel={onClose}
      width={460}
      destroyOnHidden
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose}>{t("Chiudi")}</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={save}
            loading={saving}
            disabled={!dirty || Boolean(rangeError) || parsedDisabled === null}
          >
            {t("Salva")}
          </Button>
        </Flex>
      }
    >
            <Flex vertical gap={20}>
              <div>
                <Typography.Text strong>{t("Numerazione")}</Typography.Text>
                <Flex align="center" gap={8} style={{ marginTop: 6 }}>
                  <span>{t("dal")}</span>
                  <InputNumber
                    id="channel_min"
                    aria-label={t("Primo canale")}
                    min={0}
                    max={99999}
                    precision={0}
                    value={min}
                    onChange={(v) => setMin(v ?? 0)}
                    style={{ width: 96 }}
                  />
                  <span>{t("al")}</span>
                  <InputNumber
                    id="channel_max"
                    aria-label={t("Ultimo canale")}
                    min={0}
                    max={99999}
                    precision={0}
                    value={max}
                    onChange={(v) => setMax(v ?? 0)}
                    style={{ width: 96 }}
                  />
                </Flex>
                <Typography.Text type={rangeError ? "danger" : "secondary"} style={{ display: "block", marginTop: 6 }}>
                  {rangeError ??
                    tn(count, "{n} canale. Qualsiasi radioguida: da 1 a 10.000 canali.", "{n} canali. Qualsiasi radioguida: da 1 a 10.000 canali.", { n: count.toLocaleString(numberLocale()) })}
                </Typography.Text>
              </div>

              <div>
                <Flex align="center" justify="space-between" gap={12}>
                  <Typography.Text strong>{t("Un gruppo per canale")}</Typography.Text>
                  <Switch id="channels_exclusive" checked={exclusive} onChange={setExclusive} aria-label={t("Un gruppo per canale")} />
                </Flex>
                <Typography.Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                  {exclusive
                    ? t("Un canale occupato da un gruppo non può essere dato a un altro gruppo negli stessi orari.")
                    : t("Più gruppi possono usare lo stesso canale insieme: l'ordine lo segnala ma non lo blocca.")}
                </Typography.Text>
              </div>

              <div>
                <Typography.Text strong>{t("Canali disabilitati")}</Typography.Text>
                <Input
                  id="disabled_channels"
                  aria-label={t("Canali disabilitati")}
                  placeholder={t("Es. 13, 20-22")}
                  value={disabledText}
                  onChange={(e) => setDisabledText(e.target.value)}
                  status={parsedDisabled === null ? "error" : undefined}
                  style={{ marginTop: 6 }}
                />
                <Typography.Text type={parsedDisabled === null ? "danger" : "secondary"} style={{ display: "block", marginTop: 6 }}>
                  {parsedDisabled === null
                    ? t("Scrivi numeri o intervalli separati da virgole, per esempio 13, 20-22.")
                    : t("Canali guasti o riservati: non possono essere usati negli ordini.")}
                </Typography.Text>
              </div>
            </Flex>
    </Modal>
  );
}

/** What the table shows for one occupied channel: the period, or "until pickup" when it has no end. */
function occupiedText(u: ChannelUse, timezone: string): string {
  if (u.busy_until === null) {
    return t("Dal {from} fino al ritiro", { from: fmtDateTime(u.delivery_at, timezone) });
  }
  return `${fmtDateTime(u.delivery_at, timezone)} – ${
    dayjs(u.busy_until).tz(timezone).isSame(dayjs(u.delivery_at).tz(timezone), "day")
      ? fmtTime(u.busy_until, timezone)
      : fmtDateTime(u.busy_until, timezone)
  }`;
}

/**
 * The occupied channels as a table. Overdue ones (pickup not done) are marked and listed first.
 * With `onFree` each row can give the channel back (radios returned, or cancel the order); with
 * `onOpen` it can jump to the order.
 */
export function ChannelUseTable({ uses, timezone, loading = false, emptyText, onFree, onOpen, busyOrderId }: {
  uses: ChannelUse[];
  timezone: string;
  loading?: boolean;
  emptyText: string;
  onFree?: (use: ChannelUse, status: "picked_up" | "cancelled") => void;
  onOpen?: (use: ChannelUse) => void;
  busyOrderId?: string;
}) {
  const rows = [...uses].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.channel - b.channel);
  return (
    <Table<ChannelUse>
      size="small"
      rowKey={(u) => `${u.channel}-${u.order_id}`}
      dataSource={rows}
      loading={loading}
      pagination={rows.length > 10 ? { pageSize: 10, size: "small", showSizeChanger: false } : false}
      locale={{ emptyText }}
      scroll={{ x: onFree || onOpen ? 760 : 520 }}
      columns={[
        { title: t("Canale"), dataIndex: "channel", width: 80 },
        { title: t("Guida"), dataIndex: "guide_name", ellipsis: true },
        {
          title: t("Occupato"),
          key: "when",
          render: (_, u) => (
            <Flex vertical gap={2}>
              <span>{occupiedText(u, timezone)}</span>
              {u.overdue && <Tag color="red" style={{ width: "fit-content", margin: 0 }}>{t("Ritiro in ritardo")}</Tag>}
            </Flex>
          ),
        },
        { title: t("Stato"), dataIndex: "status", render: (s) => <StatusTag status={s} /> },
        ...(onFree || onOpen ? [{
          title: "",
          key: "actions",
          render: (_: unknown, u: ChannelUse) => {
            const { returned, cancel } = getChannelFreeActions(u);
            const busy = busyOrderId === u.order_id;
            return (
              <Flex gap={4} wrap>
                {onOpen && (
                  <Button size="small" icon={<ExportOutlined />} disabled={busy} onClick={() => onOpen(u)}>
                    {t("Apri ordine")}
                  </Button>
                )}
                {onFree && returned && (
                  <Popconfirm
                    title={t("Le radio sono state restituite?")}
                    description={t("L'ordine passa a «Ritirato» e il canale {channel} torna libero.", { channel: u.channel })}
                    okText={t("Libera canale")}
                    cancelText={t("No")}
                    onConfirm={() => onFree(u, "picked_up")}
                  >
                    <Button size="small" type="primary" loading={busy}>{t("Libera")}</Button>
                  </Popconfirm>
                )}
                {onFree && cancel && (
                  <Popconfirm
                    title={t("Annullare l'ordine?")}
                    description={cancel.confirm}
                    okText={t("Conferma")}
                    cancelText={t("No")}
                    onConfirm={() => onFree(u, "cancelled")}
                  >
                    <Button size="small" danger disabled={busy}>{t("Annulla ordine")}</Button>
                  </Popconfirm>
                )}
              </Flex>
            );
          },
        }] : []),
      ]}
    />
  );
}

/**
 * Lists channel use for a selected day or for the schedule in the order form. A channel stays
 * occupied from the delivery until the radios are picked up, so one that was not returned shows on
 * every following day. The list updates by itself (see useChannelBoard): no search or refresh needed.
 */
export function OccupiedChannels({ open, onClose, period, excludeOrderId, onOpenOrder }: ChannelBoardProps & {
  period?: DateRange;
  excludeOrderId?: string;
  /** Jump to an order (the screen that owns the order drawer provides it). */
  onOpenOrder?: (orderId: string) => void;
}) {
  const { message } = App.useApp();
  const { timezone } = useReadyUser();
  const { setStatus } = useOrderMutations();
  const [day, setDay] = useState<Dayjs>(() => isoToWallClock(new Date().toISOString(), timezone));

  const range = useMemo(() => period ?? getPeriodRange(day, "day", timezone), [period, day, timezone]);
  const { data, isPlaceholderData, isFetching, isError, refetch } = useChannelBoard(range, open);
  const uses = isPlaceholderData ? [] : (data ?? []).filter((use) => use.order_id !== excludeOrderId);
  const channels = new Set(uses.map((u) => u.channel)).size;

  // Giving a channel back records the return of the radios (or cancels the order): the same
  // change as in the order menu, so it also shows in the order's history. The list refreshes itself.
  const free = (use: ChannelUse, status: "picked_up" | "cancelled") =>
    setStatus.mutate({ orderId: use.order_id, status }, {
      onSuccess: () => void message.success(t("Canale {channel} liberato", { channel: use.channel })),
    });

  return (
    <Modal
      title={t("Canali occupati")}
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnHidden
      footer={<Button onClick={onClose}>{t("Chiudi")}</Button>}
    >
      <Flex vertical gap={12}>
        <Flex align="center" gap={8} wrap>
          {period ? (
            <Typography.Text strong>
              {fmtDateTime(range.from, timezone)} – {fmtDateTime(range.to, timezone)}
            </Typography.Text>
          ) : (
            <DatePicker
              aria-label={t("Giorno")}
              value={day}
              onChange={(d) => d && setDay(d)}
              format="DD/MM/YYYY"
              allowClear={false}
            />
          )}
          {data && !isPlaceholderData && !isError && (
            <Typography.Text type="secondary">
              {period
                ? tn(channels, "{n} canale occupato in questi orari", "{n} canali occupati in questi orari")
                : tn(channels, "{n} canale occupato in questa giornata", "{n} canali occupati in questa giornata")}
            </Typography.Text>
          )}
        </Flex>
        <Typography.Text type="secondary">
          {t("Un canale è occupato dalla consegna fino al ritiro. Se il ritiro non è stato registrato, resta occupato anche nei giorni successivi, finché l'ordine non è ritirato o annullato. L'elenco si aggiorna da solo.")}
        </Typography.Text>
        {isError ? (
          <Alert
            type="warning"
            showIcon
            title={t("Impossibile caricare i canali occupati.")}
            action={<Button size="small" onClick={() => void refetch()}>{t("Riprova")}</Button>}
          />
        ) : (
          <ChannelUseTable
            uses={uses}
            timezone={timezone}
            loading={isFetching && uses.length === 0}
            emptyText={period ? t("Nessun canale occupato in questi orari") : t("Nessun canale occupato in questa giornata")}
            onFree={free}
            onOpen={onOpenOrder ? (u) => onOpenOrder(u.order_id) : undefined}
            busyOrderId={setStatus.isPending ? setStatus.variables?.orderId : undefined}
          />
        )}
      </Flex>
    </Modal>
  );
}
