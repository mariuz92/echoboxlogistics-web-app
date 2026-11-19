import { useMemo, useState } from "react";
import { App, Alert, Button, Card, Col, Flex, Form, Input, Row, Select, Space, Switch, Typography } from "antd";
import { AppstoreOutlined, CopyOutlined, LinkOutlined } from "@ant-design/icons";
import { getErrorMessage } from "../../lib/errors";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { ChannelBoard } from "../orders/components/ChannelBoard";
import { updateTenant } from "./api";
import { channelCount } from "../../types/domain";

interface CompanyForm {
  name: string;
  description?: string;
  timezone: string;
  public_booking_enabled: boolean;
}

const FALLBACK_ZONES = ["Europe/Rome", "Europe/London", "Europe/Paris", "Europe/Madrid", "Europe/Berlin", "Europe/Lisbon", "Europe/Athens"];

function timezones(): string[] {
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (zones?.length) return zones;
  } catch {
    /* older browsers */
  }
  return FALLBACK_ZONES;
}

export function SettingsPage() {
  usePageTitle("Impostazioni");
  const { message } = App.useApp();
  const { tenant, refresh } = useReadyUser();
  const [form] = Form.useForm<CompanyForm>();
  const [saving, setSaving] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);

  const zones = useMemo(() => timezones().map((z) => ({ value: z, label: z.replace(/_/g, " ") })), []);
  const bookingUrl = `${window.location.origin}/book/${tenant.slug}`;

  const save = async (values: CompanyForm) => {
    setSaving(true);
    try {
      await updateTenant(tenant.id, {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        timezone: values.timezone,
        public_booking_enabled: values.public_booking_enabled,
      });
      await refresh();
      void message.success("Impostazioni salvate");
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      void message.success("Link copiato");
    } catch {
      void message.info(bookingUrl);
    }
  };

  return (
    <>
      <PageHeader title="Impostazioni" subtitle="Dati dell'azienda, fuso orario e prenotazioni online." />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Azienda">
            <Form<CompanyForm>
              form={form}
              layout="vertical"
              requiredMark="optional"
              onFinish={save}
              initialValues={{
                name: tenant.name,
                description: tenant.description ?? "",
                timezone: tenant.timezone,
                public_booking_enabled: tenant.public_booking_enabled,
              }}
            >
              <Form.Item
                label="Nome azienda"
                name="name"
                rules={[
                  { required: true, whitespace: true, message: "Inserisci il nome" },
                  { min: 2, message: "Almeno 2 caratteri" },
                ]}
              >
                <Input />
              </Form.Item>
              <Form.Item label="Descrizione" name="description">
                <Input.TextArea rows={2} maxLength={300} showCount />
              </Form.Item>
              <Form.Item
                label="Fuso orario"
                name="timezone"
                extra="Determina i confini dei giorni nelle liste, nel calendario e nelle statistiche."
                rules={[{ required: true }]}
              >
                <Select showSearch={{ optionFilterProp: "label" }} options={zones} />
              </Form.Item>

              <Form.Item label="Prenotazioni online" name="public_booking_enabled" valuePropName="checked">
                <Switch checkedChildren="Attive" unCheckedChildren="Disattivate" />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={saving}>
                Salva modifiche
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Flex vertical gap={16}>
            <Card title="Modulo di prenotazione per le guide">
              <Typography.Paragraph type="secondary">
                Condividi questo link con le guide: potranno richiedere un servizio senza registrarsi. Le richieste
                arrivano negli ordini come &quot;Presa in carico&quot;.
              </Typography.Paragraph>
              <Space.Compact style={{ width: "100%" }}>
                <Input readOnly value={bookingUrl} prefix={<LinkOutlined />} aria-label="Link di prenotazione" />
                <Button icon={<CopyOutlined />} onClick={() => void copy()} aria-label="Copia link" />
              </Space.Compact>
              {!tenant.public_booking_enabled && (
                <Alert style={{ marginTop: 12 }} type="warning" showIcon title="Le prenotazioni online sono disattivate: il link mostra un avviso." />
              )}
            </Card>

            <Card title="Canali radio">
              <Typography.Paragraph type="secondary">
                {channelCount(tenant).toLocaleString("it-IT")} {channelCount(tenant) === 1 ? "canale" : "canali"} (
                {tenant.channel_min}–{tenant.channel_max}), {tenant.disabled_channels.length} disabilitati.{" "}
                {tenant.channels_exclusive ? "Un gruppo per canale." : "Canali condivisibili tra gruppi."}
              </Typography.Paragraph>
              <Button icon={<AppstoreOutlined />} onClick={() => setChannelsOpen(true)}>
                Gestisci canali
              </Button>
            </Card>
          </Flex>
        </Col>
      </Row>

      <ChannelBoard open={channelsOpen} onClose={() => setChannelsOpen(false)} />
    </>
  );
}

export default SettingsPage;
