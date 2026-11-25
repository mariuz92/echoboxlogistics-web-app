import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, DatePicker, Flex, Input, InputNumber, Modal, Switch, Table, Typography } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useReadyUser } from "../../../providers/current-user";
import { getErrorMessage } from "../../../lib/errors";
import { dayjs, fmtDateTime, fmtTime, getPeriodRange, isoToWallClock, type DateRange, type Dayjs } from "../../../lib/dates";
import { StatusTag } from "../../../shared/components/StatusTag";
import { MAX_CHANNELS, channelCount, formatChannelList, parseChannelList, type ChannelUse } from "../../../types/domain";
import { updateTenant } from "../../settings/api";
import { queryKeys, useChannelBoard } from "../hooks";
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

/**
 * Lists channel use for a selected day or for the schedule in the order form.
 */
export function OccupiedChannels({ open, onClose, period, excludeOrderId }: ChannelBoardProps & {
  period?: DateRange;
  excludeOrderId?: string;
}) {
  const { timezone } = useReadyUser();
  const [day, setDay] = useState<Dayjs>(() => isoToWallClock(new Date().toISOString(), timezone));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const range = useMemo(() => period ?? getPeriodRange(day, "day", timezone), [period, day, timezone]);
  const { data, isPlaceholderData, isFetching, isError, refetch } = useChannelBoard(range, open);
  const uses = isPlaceholderData ? [] : (data ?? []).filter((use) => use.order_id !== excludeOrderId);

  const q = search.trim().toLowerCase();
  const rows = q
    ? uses.filter((u) => String(u.channel) === q || u.guide_name.toLowerCase().includes(q))
    : uses;
  const channels = new Set(uses.map((u) => u.channel)).size;

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
          <Input.Search
            aria-label={t("Cerca canale o guida")}
            placeholder={t("Canale o guida")}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          {data && !isPlaceholderData && !isError && (
            <Typography.Text type="secondary">
              {period
                ? tn(channels, "{n} canale occupato in questi orari", "{n} canali occupati in questi orari")
                : tn(channels, "{n} canale occupato in questa giornata", "{n} canali occupati in questa giornata")}
            </Typography.Text>
          )}
        </Flex>
        <Typography.Text type="secondary">
          {t("Un canale è occupato dalla consegna al ritiro, o fino a fine giornata se il ritiro non è pianificato.")}
        </Typography.Text>
        {isError ? (
          <Alert
            type="warning"
            showIcon
            title={t("Impossibile caricare i canali occupati.")}
            action={<Button size="small" onClick={() => void refetch()}>{t("Riprova")}</Button>}
          />
        ) : <Table<ChannelUse>
          size="small"
          rowKey={(u) => `${u.channel}-${u.order_id}`}
          dataSource={rows}
          loading={isFetching && uses.length === 0}
          pagination={rows.length > 10 ? { pageSize: 10, size: "small", showSizeChanger: false } : false}
          locale={{ emptyText: q
            ? t("Nessun canale occupato corrisponde alla ricerca")
            : period ? t("Nessun canale occupato in questi orari") : t("Nessun canale occupato in questa giornata")
          }}
          scroll={{ x: 520 }}
          columns={[
            { title: t("Canale"), dataIndex: "channel", width: 80 },
            { title: t("Guida"), dataIndex: "guide_name", ellipsis: true },
            {
              title: t("Occupato"),
              key: "when",
              render: (_, u) =>
                `${fmtDateTime(u.delivery_at, timezone)} – ${
                  dayjs(u.busy_until).tz(timezone).isSame(dayjs(u.delivery_at).tz(timezone), "day")
                    ? fmtTime(u.busy_until, timezone)
                    : fmtDateTime(u.busy_until, timezone)
                }`,
            },
            { title: t("Stato"), dataIndex: "status", render: (s) => <StatusTag status={s} /> },
          ]}
        />}
      </Flex>
    </Modal>
  );
}
