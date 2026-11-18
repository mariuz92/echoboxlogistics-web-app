import { useEffect, useMemo, useState } from "react";
import { App, Alert, Button, Card, Col, Flex, InputNumber, Modal, Row, Tag, Tooltip, Typography } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useReadyUser } from "../../../providers/current-user";
import { getErrorMessage } from "../../../lib/errors";
import { fmtDateTime } from "../../../lib/dates";
import { updateTenant } from "../../settings/api";
import { queryKeys, useChannelStatus } from "../hooks";

interface ChannelBoardProps {
  open: boolean;
  onClose: () => void;
}

const COLORS = {
  free: { bg: "#dcfce7", border: "#86efac", fg: "#166534", label: "Libero" },
  busy: { bg: "#fef3c7", border: "#fcd34d", fg: "#92400e", label: "In uso" },
  disabled: { bg: "#fee2e2", border: "#fca5a5", fg: "#991b1b", label: "Disabilitato" },
} as const;

/**
 * Radio channel map.
 *
 * "In use" is derived from open orders by the database and cannot be edited
 * here (the old UI let admins toggle it by hand, which drifted out of sync
 * with real orders). The only manual setting is which channels are disabled
 * (e.g. broken or reserved frequencies) and how many channels exist.
 */
export function ChannelBoard({ open, onClose }: ChannelBoardProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { tenant, timezone, refresh } = useReadyUser();
  const { data: channels = [], isFetching } = useChannelStatus(open);

  const [total, setTotal] = useState(tenant.radio_channels_total);
  const [disabled, setDisabled] = useState<Set<number>>(new Set(tenant.disabled_channels));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTotal(tenant.radio_channels_total);
      setDisabled(new Set(tenant.disabled_channels));
    }
  }, [open, tenant]);

  const busy = useMemo(() => new Map(channels.filter((c) => c.state === "busy").map((c) => [c.channel, c])), [channels]);
  const highestBusy = useMemo(() => Math.max(-1, ...busy.keys()), [busy]);
  const list = useMemo(() => Array.from({ length: total + 1 }, (_, i) => i), [total]);

  const dirty =
    total !== tenant.radio_channels_total ||
    [...disabled].sort().join() !== [...tenant.disabled_channels].sort().join();

  const counts = {
    free: list.filter((c) => !busy.has(c) && !disabled.has(c)).length,
    busy: list.filter((c) => busy.has(c)).length,
    disabled: list.filter((c) => disabled.has(c) && !busy.has(c)).length,
  };

  const toggle = (channel: number) => {
    if (busy.has(channel)) return;
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  };

  const save = async () => {
    if (total < highestBusy) {
      void message.error(`Il canale ${highestBusy} è in uso: il totale non può essere inferiore.`);
      return;
    }
    setSaving(true);
    try {
      await updateTenant(tenant.id, {
        radio_channels_total: total,
        disabled_channels: [...disabled].filter((c) => c <= total).sort((a, b) => a - b),
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

  return (
    <Modal
      title="Canali radio"
      open={open}
      onCancel={onClose}
      width={860}
      destroyOnHidden
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose}>Chiudi</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} disabled={!dirty}>
            Salva
          </Button>
        </Flex>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card size="small" title="Impostazioni">
            <Typography.Text type="secondary">Numero totale di canali (da 0 a N)</Typography.Text>
            <InputNumber
              min={0}
              max={999}
              precision={0}
              value={total}
              onChange={(value) => setTotal(value ?? 0)}
              style={{ width: "100%", marginTop: 6, marginBottom: 16 }}
            />
            <Flex vertical gap={8}>
              <Tag color="green" variant="filled">Liberi: {counts.free}</Tag>
              <Tag color="gold" variant="filled">In uso: {counts.busy}</Tag>
              <Tag color="red" variant="filled">Disabilitati: {counts.disabled}</Tag>
            </Flex>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card size="small" title="Mappa canali" loading={isFetching && channels.length === 0}>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title="I canali in uso dipendono dagli ordini aperti. Clicca un canale libero per disabilitarlo (o riabilitarlo)."
            />
            <Flex wrap gap={8}>
              {list.map((channel) => {
                const info = busy.get(channel);
                const state = info ? "busy" : disabled.has(channel) ? "disabled" : "free";
                const c = COLORS[state];
                return (
                  <Tooltip
                    key={channel}
                    title={
                      info
                        ? `Canale ${channel} · ${info.guide_name} · ${fmtDateTime(info.delivery_at, timezone)}`
                        : `Canale ${channel} · ${c.label}`
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggle(channel)}
                      aria-label={`Canale ${channel}: ${c.label}`}
                      aria-pressed={state === "disabled"}
                      disabled={state === "busy"}
                      style={{
                        width: 44,
                        height: 38,
                        borderRadius: 8,
                        border: `1px solid ${c.border}`,
                        background: c.bg,
                        color: c.fg,
                        fontWeight: 600,
                        cursor: state === "busy" ? "not-allowed" : "pointer",
                      }}
                    >
                      {channel}
                    </button>
                  </Tooltip>
                );
              })}
            </Flex>
          </Card>
        </Col>
      </Row>
    </Modal>
  );
}
