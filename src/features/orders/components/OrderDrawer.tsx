import { useMemo } from "react";
import {
  App,
  Alert,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Timeline,
  Typography,
} from "antd";
import { EditOutlined, EnvironmentOutlined, PhoneOutlined } from "@ant-design/icons";
import {
  fmtDateTime,
  fmtMoney,
  isoToWallClock,
  wallClockToIso,
  type Dayjs,
} from "../../../lib/dates";
import { useReadyUser } from "../../../providers/current-user";
import { AddressInput } from "../../../shared/components/AddressInput";
import { StatusTag } from "../../../shared/components/StatusTag";
import {
  ORDER_STATUS_META,
  type Order,
  type OrderEvent,
  type OrderStatus,
} from "../../../types/domain";
import { useGuides, useMembers, useOrderEvents, useOrderMutations } from "../hooks";
import { ChannelPicker } from "./ChannelPicker";
import type { NewOrderInput, OrderPatch } from "../api";
import { t } from "../../../i18n";

export type DrawerMode = "create" | "view" | "edit";

interface OrderDrawerProps {
  open: boolean;
  mode: DrawerMode;
  order?: Order;
  /** Pre-fills the delivery date when creating an order. */
  defaultDate?: Dayjs;
  onClose: () => void;
  onModeChange: (mode: DrawerMode) => void;
}

interface FormValues {
  guide_id?: string | null;
  guide_name: string;
  guide_phone?: string;
  guide_email?: string;
  radio_channel?: number | null;
  radios_count?: number;
  extra_radios?: number;
  lost_radios?: number;
  balance?: number;
  invoice_required?: boolean;
  delivery_at?: Dayjs;
  delivery_address?: string;
  pickup_at?: Dayjs | null;
  pickup_address?: string;
  notes?: string;
}

export function OrderDrawer({ open, mode, order, defaultDate, onClose, onModeChange }: OrderDrawerProps) {
  const screens = Grid.useBreakpoint();
  const title =
    mode === "create" ? t("Nuovo ordine") : mode === "edit" ? t("Modifica ordine") : t("Dettagli ordine");

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      size={screens.md ? 760 : "100%"}
      destroyOnHidden
      extra={order && mode === "view" ? <StatusTag status={order.status} /> : null}
    >
      {open &&
        (mode === "view" && order ? (
          <OrderDetails order={order} onEdit={() => onModeChange("edit")} onClose={onClose} />
        ) : (
          <OrderFormBody
            mode={mode === "edit" ? "edit" : "create"}
            order={order}
            defaultDate={defaultDate}
            onCancel={() => (mode === "edit" && order ? onModeChange("view") : onClose())}
            onSaved={onClose}
          />
        ))}
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

function OrderFormBody({
  mode,
  order,
  defaultDate,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  order?: Order;
  defaultDate?: Dayjs;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const { tenant, timezone } = useReadyUser();
  const [form] = Form.useForm<FormValues>();
  const { data: guides = [] } = useGuides();
  const { create, update } = useOrderMutations();
  const saving = create.isPending || update.isPending;

  const initialValues = useMemo<FormValues>(() => {
    if (mode === "edit" && order) {
      return {
        guide_id: order.guide_id,
        guide_name: order.guide_name,
        guide_phone: order.guide_phone ?? undefined,
        guide_email: order.guide_email ?? undefined,
        radio_channel: order.radio_channel,
        radios_count: order.radios_count,
        extra_radios: order.extra_radios,
        lost_radios: order.lost_radios,
        balance: Number(order.balance),
        invoice_required: order.invoice_required,
        delivery_at: isoToWallClock(order.delivery_at, timezone),
        delivery_address: order.delivery_address,
        pickup_at: order.pickup_at ? isoToWallClock(order.pickup_at, timezone) : null,
        pickup_address: order.pickup_address ?? undefined,
        notes: order.notes ?? undefined,
      };
    }
    return {
      guide_name: "",
      radios_count: undefined,
      extra_radios: 0,
      balance: 0,
      invoice_required: false,
      delivery_at: defaultDate?.hour(9).minute(0).second(0),
    };
  }, [mode, order, timezone, defaultDate]);

  const onGuideSelect = (guideId?: string) => {
    const guide = guides.find((g) => g.id === guideId);
    form.setFieldsValue({
      guide_id: guideId ?? null,
      ...(guide
        ? {
            guide_name: guide.full_name,
            guide_phone: guide.phone ?? undefined,
            guide_email: guide.email ?? undefined,
          }
        : {}),
    });
  };

  const onFinish = async (values: FormValues) => {
    const payload = {
      guide_id: values.guide_id ?? null,
      guide_name: values.guide_name.trim(),
      guide_phone: values.guide_phone?.trim() || null,
      guide_email: values.guide_email?.trim().toLowerCase() || null,
      radio_channel: values.radio_channel ?? null,
      radios_count: values.radios_count ?? 0,
      extra_radios: values.extra_radios ?? 0,
      balance: values.balance ?? 0,
      invoice_required: values.invoice_required ?? false,
      delivery_at: wallClockToIso(values.delivery_at!, timezone),
      delivery_address: values.delivery_address!.trim(),
      pickup_at: values.pickup_at ? wallClockToIso(values.pickup_at, timezone) : null,
      pickup_address: values.pickup_address?.trim() || null,
      notes: values.notes?.trim() || null,
    };

    if (mode === "create") {
      await create.mutateAsync({ tenantId: tenant.id, input: payload as NewOrderInput });
      void message.success(t("Ordine creato"));
    } else if (order) {
      const patch: OrderPatch = { ...payload, lost_radios: values.lost_radios ?? 0 };
      await update.mutateAsync({ id: order.id, patch });
      void message.success(t("Ordine aggiornato"));
    }
    onSaved();
  };

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      requiredMark="optional"
      initialValues={initialValues}
      onFinish={(values) => void onFinish(values).catch(() => undefined)}
      scrollToFirstError
    >
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t("Guida")}
      </Typography.Title>

      {mode === "create" && (
        <Form.Item label={t("Scegli dalla rubrica")} name="guide_id">
          <Select
            allowClear
            showSearch={{ optionFilterProp: "label" }}
            placeholder={t("Cerca una guida…")}
            options={guides.map((g) => ({
              value: g.id,
              label: `${g.full_name}${g.phone ? ` · ${g.phone}` : ""}`,
            }))}
            onChange={(value) => onGuideSelect(value)}
            notFoundContent={t("Nessuna guida in rubrica: inserisci i dati qui sotto.")}
          />
        </Form.Item>
      )}

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            label={t("Nome guida o gruppo")}
            name="guide_name"
            rules={[
              { required: true, message: t("Inserisci il nome della guida") },
              { min: 2, message: t("Almeno 2 caratteri") },
            ]}
          >
            <Input placeholder={t("Mario Rossi")} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label={t("Telefono")}
            name="guide_phone"
            rules={[{ pattern: /^[0-9+\s()-]{6,20}$/, message: t("Numero non valido") }]}
          >
            <Input placeholder="+39 333 1234567" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        label={t("Email")}
        name="guide_email"
        rules={[{ type: "email", message: t("Email non valida") }]}
      >
        <Input placeholder={t("guida@esempio.it")} />
      </Form.Item>
      {/* In create mode the address-book Select above owns guide_id; registering a second
          Form.Item for the same field produced two inputs with the same DOM id. */}
      {mode === "edit" && (
        <Form.Item name="guide_id" hidden>
          <Input />
        </Form.Item>
      )}

      <Divider />
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t("Radioguide")}
      </Typography.Title>

      <Row gutter={16}>
        <Col xs={12} sm={6}>
          <Form.Item
            label={t("Radioguide")}
            name="radios_count"
            rules={[{ required: true, message: t("Obbligatorio") }]}
          >
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={12} sm={6}>
          <Form.Item label={t("Extra")} name="extra_radios">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        {mode === "edit" && (
          <Col xs={12} sm={6}>
            <Form.Item label={t("Perse")} name="lost_radios">
              <InputNumber min={0} precision={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        )}
      </Row>
      <Row gutter={16}>
        <Col xs={12} sm={6}>
          <Form.Item label={t("Saldo (€)")} name="balance">
            <InputNumber min={0} step={10} precision={2} decimalSeparator="," style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={12} sm={6}>
          <Form.Item label={t("Fattura richiesta")} name="invoice_required" valuePropName="checked">
            <Switch checkedChildren={t("Sì")} unCheckedChildren={t("No")} />
          </Form.Item>
        </Col>
      </Row>

      <Divider />
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t("Consegna")}
      </Typography.Title>
      <Row gutter={16}>
        <Col xs={24} sm={10}>
          <Form.Item
            label={t("Data e ora")}
            name="delivery_at"
            rules={[{ required: true, message: t("Obbligatorio") }]}
          >
            <DatePicker showTime={{ format: "HH:mm", minuteStep: 5 }} format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={14}>
          <Form.Item
            label={t("Luogo")}
            name="delivery_address"
            rules={[{ required: true, whitespace: true, message: t("Inserisci il luogo di consegna") }]}
          >
            <AddressInput placeholder={t("Indirizzo di consegna")} />
          </Form.Item>
        </Col>
      </Row>

      <Divider />
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t("Ritiro")}{" "}<Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>{t("(facoltativo)")}</Typography.Text>
      </Typography.Title>
      <Row gutter={16}>
        <Col xs={24} sm={10}>
          <Form.Item
            label={t("Data e ora")}
            name="pickup_at"
            dependencies={["delivery_at", "pickup_address"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value: Dayjs | null) {
                  const delivery = getFieldValue("delivery_at") as Dayjs | undefined;
                  if (!value) {
                    return getFieldValue("pickup_address")
                      ? Promise.reject(new Error(t("Indica anche data e ora del ritiro")))
                      : Promise.resolve();
                  }
                  if (delivery && value.isBefore(delivery)) {
                    return Promise.reject(new Error(t("Il ritiro non può precedere la consegna")));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <DatePicker showTime={{ format: "HH:mm", minuteStep: 5 }} format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={14}>
          <Form.Item
            label={t("Luogo")}
            name="pickup_address"
            dependencies={["pickup_at"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value?: string) {
                  return getFieldValue("pickup_at") && !value?.trim()
                    ? Promise.reject(new Error(t("Indica il luogo del ritiro")))
                    : Promise.resolve();
                },
              }),
            ]}
          >
            <AddressInput placeholder={t("Indirizzo di ritiro")} />
          </Form.Item>
        </Col>
      </Row>

      <Divider />
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t("Canale radio")}
      </Typography.Title>
      <ChannelPicker orderId={order?.id} />

      <Form.Item label={t("Note")} name="notes">
        <Input.TextArea rows={3} maxLength={1000} showCount />
      </Form.Item>

      <Flex justify="flex-end" gap={8} style={{ marginTop: 8 }}>
        <Button onClick={onCancel} disabled={saving}>
          {t("Annulla")}
        </Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          {mode === "create" ? t("Crea ordine") : t("Salva modifiche")}
        </Button>
      </Flex>
    </Form>
  );
}

/* -------------------------------------------------------------------------- */
/* Details                                                                    */
/* -------------------------------------------------------------------------- */

function OrderDetails({
  order,
  onEdit,
  onClose,
}: {
  order: Order;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { timezone } = useReadyUser();
  const canEdit = true; // the drawer is only reachable by admins

  return (
    <>
      {order.source === "public_form" && order.status === "received" && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={t("Richiesta ricevuta dal modulo pubblico")}
          description={t("Verifica i dati, scegli un canale radio e assegna un rider.")}
        />
      )}

      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2 }}
        items={[
          { key: "guide", label: t("Guida"), children: order.guide_name },
          {
            key: "phone",
            label: t("Telefono"),
            children: order.guide_phone ? (
              <a href={`tel:${order.guide_phone.replace(/\s/g, "")}`}>
                <PhoneOutlined /> {order.guide_phone}
              </a>
            ) : (
              "—"
            ),
          },
          { key: "email", label: t("Email"), children: order.guide_email ?? "—", span: 2 },
          { key: "radios", label: t("Radioguide"), children: order.radios_count },
          { key: "extra", label: t("Extra"), children: order.extra_radios },
          { key: "channel", label: t("Canale"), children: order.radio_channel ?? "—" },
          { key: "lost", label: t("Perse"), children: order.lost_radios },
          { key: "balance", label: t("Saldo"), children: fmtMoney(Number(order.balance)) },
          { key: "invoice", label: t("Fattura"), children: order.invoice_required ? t("Richiesta") : t("No") },
          {
            key: "delivery",
            label: t("Consegna"),
            span: 2,
            children: (
              <Flex vertical gap={2} align="flex-start">
                <div>{fmtDateTime(order.delivery_at, timezone)}</div>
                <AddressLine address={order.delivery_address} />
                <Typography.Text type="secondary">
                  {t("Rider:")}{" "}{order.delivery_rider?.full_name ?? t("non assegnato")}
                </Typography.Text>
              </Flex>
            ),
          },
          {
            key: "pickup",
            label: t("Ritiro"),
            span: 2,
            children: order.pickup_at || order.pickup_address ? (
              <Flex vertical gap={2} align="flex-start">
                <div>{fmtDateTime(order.pickup_at, timezone)}</div>
                {order.pickup_address && <AddressLine address={order.pickup_address} />}
                <Typography.Text type="secondary">
                  {t("Rider:")}{" "}{order.pickup_rider?.full_name ?? t("non assegnato")}
                </Typography.Text>
              </Flex>
            ) : (
              <Typography.Text type="secondary">{t("Non pianificato")}</Typography.Text>
            ),
          },
          { key: "notes", label: t("Note"), span: 2, children: order.notes || "—" },
        ]}
      />

      <Divider titlePlacement="start">{t("Cronologia")}</Divider>
      <EventTimeline orderId={order.id} />

      <Flex justify="flex-end" gap={8} style={{ marginTop: 24 }}>
        <Button onClick={onClose}>{t("Chiudi")}</Button>
        {canEdit && (
          <Button type="primary" icon={<EditOutlined />} onClick={onEdit}>
            {t("Modifica")}
          </Button>
        )}
      </Flex>
    </>
  );
}

function AddressLine({ address }: { address: string }) {
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
      target="_blank"
      rel="noreferrer"
    >
      <EnvironmentOutlined /> {address}
    </a>
  );
}

const FIELD_LABELS: Record<string, string> = {
  guide_name: t("nome guida"),
  guide_phone: t("telefono"),
  guide_email: t("email"),
  radio_channel: t("canale"),
  radios_count: t("radioguide"),
  extra_radios: t("extra"),
  lost_radios: t("perse"),
  balance: t("saldo"),
  invoice_required: t("fattura"),
  delivery_at: t("orario consegna"),
  delivery_address: t("luogo consegna"),
  pickup_at: t("orario ritiro"),
  pickup_address: t("luogo ritiro"),
  notes: t("note"),
  guide_id: t("guida"),
};

function EventTimeline({ orderId }: { orderId: string }) {
  const { timezone } = useReadyUser();
  const { data: events = [], isLoading } = useOrderEvents(orderId);
  const { data: members = [] } = useMembers();

  const nameOf = (id?: string | null) => members.find((m) => m.id === id)?.full_name ?? "—";

  const describe = (event: OrderEvent): string => {
    const payload = (event.payload ?? {}) as {
      changes?: Record<string, { from: unknown; to: unknown }>;
      source?: string;
    };
    switch (event.event_type) {
      case "created":
        return payload.source === "public_form"
          ? "Ordine ricevuto dal modulo pubblico"
          : t("Ordine creato");
      case "status_changed": {
        const from = event.from_status ? ORDER_STATUS_META[event.from_status as OrderStatus].label : "";
        const to = event.to_status ? ORDER_STATUS_META[event.to_status as OrderStatus].label : "";
        return t("Stato: {from} → {to}", { from, to });
      }
      case "assigned": {
        const c = payload.changes ?? {};
        if (c.delivery_rider_id) {
          return c.delivery_rider_id.to
            ? t("Consegna assegnata a {name}", { name: nameOf(c.delivery_rider_id.to as string) })
            : "Assegnazione consegna rimossa";
        }
        if (c.pickup_rider_id) {
          return c.pickup_rider_id.to
            ? t("Ritiro assegnato a {name}", { name: nameOf(c.pickup_rider_id.to as string) })
            : "Assegnazione ritiro rimossa";
        }
        return "Rider aggiornato";
      }
      case "updated": {
        const fields = Object.keys(payload.changes ?? {}).map((k) => FIELD_LABELS[k] ?? k);
        return t("Modificato: {fields}", { fields: fields.join(", ") });
      }
      case "deleted":
        return "Ordine eliminato";
      default:
        return event.event_type;
    }
  };

  if (isLoading) return <Spin size="small" />;

  return (
    <Timeline
      items={events.map((event) => ({
        key: String(event.id),
        title: fmtDateTime(event.created_at, timezone),
        content: (
          <Space orientation="vertical" size={0}>
            <Typography.Text>{describe(event)}</Typography.Text>
            {event.actor_id && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {nameOf(event.actor_id)}
              </Typography.Text>
            )}
          </Space>
        ),
      }))}
    />
  );
}
