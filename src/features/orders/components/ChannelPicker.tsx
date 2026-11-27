import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, Flex, Form, Input, Typography } from "antd";
import { useReadyUser } from "../../../providers/current-user";
import { fmtDateTime, fmtTime, wallClockToIso, type Dayjs } from "../../../lib/dates";
import { channelConflicts, channelHoldEnd } from "../../../types/domain";
import { useChannelBoard } from "../hooks";
import { OccupiedChannels } from "./ChannelBoard";
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
  const [occupiedOpen, setOccupiedOpen] = useState(false);
  const { channel_min: min, channel_max: max } = tenant;

  const slot = useMemo(() => {
    if (!deliveryAt) return null;
    const from = wallClockToIso(deliveryAt, timezone);
    const pickup = pickupAt ? wallClockToIso(pickupAt, timezone) : null;
    if (pickup && Date.parse(pickup) < Date.parse(from)) return null;
    return { from, to: channelHoldEnd(from, pickup, timezone) };
  }, [deliveryAt, pickupAt, timezone]);

  const inRange = channel != null && Number.isInteger(channel) && channel >= min && channel <= max;
  const { data, isError, isPlaceholderData } = useChannelBoard(
    slot, inRange && !tenant.disabled_channels.includes(channel),
  );
  const uses = isPlaceholderData ? [] : data ?? [];
  const conflicts = slot && channel != null ? channelConflicts(uses, channel, slot.from, slot.to, orderId) : [];

  let status: { type: "success" | "warning" | "danger" | "secondary"; text: string; blocking: boolean };
  if (channel == null) {
    status = {
      type: "secondary",
      text: t("Facoltativo. I tuoi canali vanno da {min} a {max}.", { min, max }),
      blocking: false,
    };
  } else if (!inRange) {
    status = {
      type: "danger",
      text: t("Inserisci un numero intero da {min} a {max}.", { min, max }),
      blocking: true,
    };
  } else if (tenant.disabled_channels.includes(channel)) {
    status = { type: "danger", text: t("Il canale {channel} è disabilitato.", { channel }), blocking: true };
  } else if (!slot) {
    status = { type: "secondary", text: t("Indica gli orari dell’ordine per controllare il canale."), blocking: false };
  } else if (isError) {
    status = { type: "warning", text: t("Disponibilità non verificata. EchoBox controllerà il canale al salvataggio."), blocking: false };
  } else if (!data || isPlaceholderData) {
    status = { type: "secondary", text: t("Verifica disponibilità del canale…"), blocking: false };
  } else if (conflicts.length) {
    const who = conflicts
      .map((c) => c.busy_until === null
        ? t("{guide} (dalle {from}, in attesa di ritiro)", { guide: c.guide_name, from: fmtDateTime(c.delivery_at, timezone) })
        : `${c.guide_name} (${fmtTime(c.delivery_at, timezone)}–${fmtTime(c.busy_until, timezone)})`)
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
    <>
      <Form.Item
        label={t("Canale")}
        htmlFor="radio_channel"
        help={
          <Flex id="radio_channel_status" vertical gap={2} style={{ paddingBottom: 12 }}>
            <Typography.Text type={status.type}>{status.text}</Typography.Text>
            {!slot && channel == null && (
              <Typography.Text type="secondary">{t("Indica gli orari dell’ordine per vedere i canali occupati.")}</Typography.Text>
            )}
          </Flex>
        }
      >
        <Flex align="center" gap={8} wrap>
          <Form.Item
            name="radio_channel"
            noStyle
            getValueFromEvent={({ target }: ChangeEvent<HTMLInputElement>) =>
              target.value === "" ? null : target.valueAsNumber
            }
            rules={[{ validator: () => (problem.current ? Promise.reject(new Error(problem.current)) : Promise.resolve()) }]}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              placeholder={t("Numero")}
              aria-describedby="radio_channel_status"
              style={{ width: 144, maxWidth: "100%" }}
            />
          </Form.Item>
          <Button onClick={() => setOccupiedOpen(true)} disabled={!slot}>
            {t("Canali occupati")}
          </Button>
        </Flex>
      </Form.Item>
      {slot && (
        <OccupiedChannels
          open={occupiedOpen}
          onClose={() => setOccupiedOpen(false)}
          period={slot}
          excludeOrderId={orderId}
        />
      )}
    </>
  );
}
