import { useMemo, useRef } from "react";
import { Form, InputNumber, Typography } from "antd";
import { useReadyUser } from "../../../providers/current-user";
import { fmtTime, wallClockToIso, type Dayjs } from "../../../lib/dates";
import { channelConflicts, channelWindowEnd } from "../../../types/domain";
import { useChannelBoard } from "../hooks";
import { t } from "../../../i18n";

interface ChannelPickerProps {
  /** The order being edited: it does not occupy its own channel. */
  orderId?: string;
}

/**
 * Radio channel of an order. The office types the number; underneath, EchoBox says
 * whether that channel is free at the order's times or which group occupies it.
 * The database enforces the same rules, so this is guidance, not the source of truth.
 */
export function ChannelPicker({ orderId }: ChannelPickerProps) {
  const form = Form.useFormInstance();
  const { tenant, timezone } = useReadyUser();
  const deliveryAt = Form.useWatch("delivery_at", form) as Dayjs | undefined;
  const pickupAt = Form.useWatch("pickup_at", form) as Dayjs | null | undefined;
  const channel = Form.useWatch("radio_channel", form) as number | null | undefined;

  const slot = useMemo(() => {
    if (!deliveryAt) return null;
    const from = wallClockToIso(deliveryAt, timezone);
    const pickup = pickupAt ? wallClockToIso(pickupAt, timezone) : null;
    return { from, to: channelWindowEnd(from, pickup, timezone) };
  }, [deliveryAt, pickupAt, timezone]);

  // Only asked for when a channel is typed: the orders holding a channel at these times.
  const { data: uses = [] } = useChannelBoard(slot, channel != null);
  const conflicts = slot && channel != null ? channelConflicts(uses, channel, slot.from, slot.to, orderId) : [];

  let status: { type: "success" | "warning" | "danger" | "secondary"; text: string; blocking: boolean };
  if (channel == null) {
    status = {
      type: "secondary",
      text: t("Facoltativo. I tuoi canali vanno da {min} a {max}.", { min: tenant.channel_min, max: tenant.channel_max }),
      blocking: false,
    };
  } else if (channel < tenant.channel_min || channel > tenant.channel_max) {
    status = {
      type: "danger",
      text: t("Il canale {channel} non esiste: i tuoi canali vanno da {min} a {max}.", { channel, min: tenant.channel_min, max: tenant.channel_max }),
      blocking: true,
    };
  } else if (tenant.disabled_channels.includes(channel)) {
    status = { type: "danger", text: t("Il canale {channel} è disabilitato.", { channel }), blocking: true };
  } else if (!slot) {
    status = { type: "secondary", text: t("Indica l'orario di consegna per controllare il canale."), blocking: false };
  } else if (conflicts.length) {
    const who = conflicts
      .map((c) => `${c.guide_name} (${fmtTime(c.delivery_at, timezone)}–${fmtTime(c.busy_until, timezone)})`)
      .join(", ");
    status = tenant.channels_exclusive
      ? { type: "danger", text: t("Canale {channel} occupato da {who}.", { channel, who }), blocking: true }
      : { type: "warning", text: t("Canale {channel} già usato in questi orari da {who}.", { channel, who }), blocking: false };
  } else {
    status = { type: "success", text: t("Canale {channel} libero in questi orari.", { channel }), blocking: false };
  }

  // The form validator reads the latest status without re-creating the rules.
  const problem = useRef<string | null>(null);
  problem.current = status.blocking ? status.text : null;

  return (
    <Form.Item
      label={t("Canale")}
      name="radio_channel"
      rules={[{ validator: () => (problem.current ? Promise.reject(new Error(problem.current)) : Promise.resolve()) }]}
      help={<Typography.Text type={status.type === "secondary" ? "secondary" : status.type}>{status.text}</Typography.Text>}
    >
      <InputNumber min={0} max={99999} precision={0} placeholder={t("Numero")} style={{ width: 160 }} />
    </Form.Item>
  );
}
