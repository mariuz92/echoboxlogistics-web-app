import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { App, Alert, Button, Card, Col, Flex, Form, Input, Row, Select, Space, Switch, Tabs, Typography } from "antd";
import { AppstoreOutlined, CopyOutlined, LinkOutlined } from "@ant-design/icons";
import { getErrorMessage } from "../../lib/errors";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { ChannelSettings } from "../orders/components/ChannelBoard";
import { SubscriptionPanel } from "../billing/SubscriptionPanel";
import { updateTenant } from "./api";
import { channelCount } from "../../types/domain";
import { numberLocale, t, tn } from "../../i18n";

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

function CompanySettings() {
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
      void message.success(t("Impostazioni salvate"));
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      void message.success(t("Link copiato"));
    } catch {
      void message.info(bookingUrl);
    }
  };

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={t("Azienda")}>
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
                label={t("Nome azienda")}
                name="name"
                rules={[
                  { required: true, whitespace: true, message: t("Inserisci il nome") },
                  { min: 2, message: t("Almeno 2 caratteri") },
                ]}
              >
                <Input />
              </Form.Item>
              <Form.Item label={t("Descrizione")} name="description">
                <Input.TextArea rows={2} maxLength={300} showCount />
              </Form.Item>
              <Form.Item
                label={t("Fuso orario")}
                name="timezone"
                extra={t("Determina i confini dei giorni nelle liste, nel calendario e nelle statistiche.")}
                rules={[{ required: true }]}
              >
                <Select showSearch={{ optionFilterProp: "label" }} options={zones} />
              </Form.Item>

              <Form.Item label={t("Prenotazioni online")} name="public_booking_enabled" valuePropName="checked">
                <Switch checkedChildren={t("Attive")} unCheckedChildren={t("Disattivate")} />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={saving}>
                {t("Salva modifiche")}
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Flex vertical gap={16}>
            <Card title={t("Modulo di prenotazione per le guide")}>
              <Typography.Paragraph type="secondary">
                {t(
                  "Condividi questo link con le guide: potranno richiedere un servizio senza registrarsi. Le richieste arrivano negli ordini come \"Presa in carico\".",
                )}
              </Typography.Paragraph>
              <Space.Compact style={{ width: "100%" }}>
                <Input readOnly value={bookingUrl} prefix={<LinkOutlined />} aria-label={t("Link di prenotazione")} />
                <Button icon={<CopyOutlined />} onClick={() => void copy()} aria-label={t("Copia link")} />
              </Space.Compact>
              {!tenant.public_booking_enabled && (
                <Alert style={{ marginTop: 12 }} type="warning" showIcon title={t("Le prenotazioni online sono disattivate: il link mostra un avviso.")} />
              )}
            </Card>

            <Card title={t("Canali radio")}>
              <Typography.Paragraph type="secondary">
                {tn(channelCount(tenant), "{n} canale", "{n} canali", { n: channelCount(tenant).toLocaleString(numberLocale()) })} (
                {tenant.channel_min}–{tenant.channel_max}), {tenant.disabled_channels.length} {t("disabilitati.")}{" "}
                {tenant.channels_exclusive ? t("Un gruppo per canale.") : t("Canali condivisibili tra gruppi.")}
              </Typography.Paragraph>
              <Button icon={<AppstoreOutlined />} onClick={() => setChannelsOpen(true)}>
                {t("Gestisci canali")}
              </Button>
            </Card>
          </Flex>
        </Col>
      </Row>

      <ChannelSettings open={channelsOpen} onClose={() => setChannelsOpen(false)} />
    </>
  );
}

export function SettingsPage() {
  usePageTitle(t("Impostazioni"));
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "subscription" ? "subscription" : "company";

  return (
    <>
      <PageHeader title={t("Impostazioni")} subtitle={t("Dati dell'azienda, fuso orario, prenotazioni online e abbonamento.")} />
      <Tabs
        activeKey={tab}
        onChange={(key) => setParams(key === "subscription" ? { tab: key } : {}, { replace: true })}
        items={[
          { key: "company", label: t("Azienda"), children: <CompanySettings /> },
          { key: "subscription", label: t("Abbonamento"), children: <SubscriptionPanel /> },
        ]}
      />
    </>
  );
}

export default SettingsPage;
