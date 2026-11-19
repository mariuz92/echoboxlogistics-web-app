import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Form, InputNumber, Typography } from "antd";
import { useReadyUser } from "../../../providers/current-user";
import { fmtTime, wallClockToIso, type Dayjs } from "../../../lib/dates";
import { channelConflicts, channelWindowEnd } from "../../../types/domain";
import { useChannelBoard, useFreeChannels } from "../hooks";

interface ChannelPickerProps {
  /** The order being edited: its own channel counts as free. */
  orderId?: string;
  /** New orders get the first free channel until the user picks one. */
  autoFill: boolean;
}

/**
 * Radio channel of an order, for any equipment (1 to 10,000 channels).
 *
 * Shows the first channels free for the order's times, checks the typed channel
 * against the range, the disabled list and the other orders of those times, and
 * (for new orders) pre-fills the first free channel. The database enforces the
 * same rules, so this is guidance, not the source of truth.
 */
export function ChannelPicker({ orderId, autoFill }: ChannelPickerProps) {
  const form = Form.useFormInstance();
  const { tenant, timezone } = useReadyUser();
  const deliveryAt = Form.useWatch("delivery_at", form) as Dayjs | undefined;
  const pickupAt = Form.useWatch("pickup_at", form) as Dayjs | null | undefined;
  const channel = Form.useWatch("radio_channel", form) as number | null | undefined;

  const [touched, setTouched] = useState(false);
  const [autoValue, setAutoValue] = useState<number | null>(null);

  const slot = useMemo(() => {
    if (!deliveryAt) return null;
    const from = wallClockToIso(deliveryAt, timezone);
    const pickup = pickupAt ? wallClockToIso(pickupAt, timezone) : null;
    return { from, pickup, to: channelWindowEnd(from, pickup, timezone) };
  }, [deliveryAt, pickupAt, timezone]);

  const { data: free = [], isFetching: loadingFree } = useFreeChannels(
    slot ? { deliveryAt: slot.from, pickupAt: slot.pickup, excludeOrderId: orderId, limit: 8 } : null,
  );
  const { data: uses = [] } = useChannelBoard(slot ? { from: slot.from, to: slot.to } : null);

  // New orders: keep the first free channel in the field until the user chooses
  // one. If the times change and the automatic channel is no longer free, move on.
  useEffect(() => {
    if (!autoFill || touched || loadingFree || free.length === 0) return;
    const empty = channel === undefined || channel === null;
    if (empty || (channel === autoValue && !free.includes(channel))) {
      form.setFieldValue("radio_channel", free[0]);
      setAutoValue(free[0]);
    }
  }, [autoFill, touched, loadingFree, free, channel, autoValue, form]);

  const conflicts =
    slot && channel != null ? channelConflicts(uses, channel, slot.from, slot.to, orderId) : [];

  let status: { type: "success" | "warning" | "danger" | "secondary"; text: string; blocking: boolean };
  if (channel == null) {
    status = slot && !loadingFree && free.length === 0
      ? { type: "warning", text: "Nessun canale libero in questi orari: puoi salvare l'ordine senza canale.", blocking: false }
      : { type: "secondary", text: "Nessun canale assegnato.", blocking: false };
  } else if (channel < tenant.channel_min || channel > tenant.channel_max) {
    status = {
      type: "danger",
      text: `Il canale ${channel} non esiste: i tuoi canali vanno da ${tenant.channel_min} a ${tenant.channel_max}.`,
      blocking: true,
    };
  } else if (tenant.disabled_channels.includes(channel)) {
    status = { type: "danger", text: `Il canale ${channel} è disabilitato.`, blocking: true };
  } else if (!slot) {
    status = { type: "secondary", text: "Indica l'orario di consegna per controllare il canale.", blocking: false };
  } else if (conflicts.length) {
    const who = conflicts
      .map((c) => `${c.guide_name} (${fmtTime(c.delivery_at, timezone)}–${fmtTime(c.busy_until, timezone)})`)
      .join(", ");
    status = tenant.channels_exclusive
      ? { type: "danger", text: `Canale ${channel} già usato in questi orari da ${who}.`, blocking: true }
      : { type: "warning", text: `Canale ${channel} condiviso in questi orari con ${who}.`, blocking: false };
  } else {
    status = { type: "success", text: `Canale ${channel} libero in questi orari.`, blocking: false };
  }

  // The form validator reads the latest status without re-creating the rules.
  const problem = useRef<string | null>(null);
  problem.current = status.blocking ? status.text : null;

  const pick = (value: number | null) => {
    setTouched(true);
    form.setFieldValue("radio_channel", value);
    void form.validateFields(["radio_channel"]).catch(() => undefined);
  };

  return (
    <>
      <Form.Item
        label="Canale"
        name="radio_channel"
        rules={[
          {
            validator: () => (problem.current ? Promise.reject(new Error(problem.current)) : Promise.resolve()),
          },
        ]}
        validateTrigger={["onChange", "onBlur"]}
        help={<Typography.Text type={status.type === "secondary" ? "secondary" : status.type}>{status.text}</Typography.Text>}
        style={{ marginBottom: 12 }}
      >
        <InputNumber
          min={0}
          max={99999}
          precision={0}
          placeholder="Nessuno"
          style={{ width: 160 }}
          onChange={() => setTouched(true)}
        />
      </Form.Item>
      {slot && free.length > 0 && (
        <Flex align="center" gap={6} wrap style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">Liberi in questi orari:</Typography.Text>
          {free.map((c) => (
            <Button
              key={c}
              size="small"
              type={c === channel ? "primary" : "default"}
              onClick={() => pick(c)}
              aria-label={`Usa il canale ${c}`}
            >
              {c}
            </Button>
          ))}
          {channel != null && (
            <Button size="small" type="link" onClick={() => pick(null)}>
              Nessun canale
            </Button>
          )}
        </Flex>
      )}
    </>
  );
}
