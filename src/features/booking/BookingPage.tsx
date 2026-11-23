import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import { AudioOutlined, CheckCircleFilled, SendOutlined } from "@ant-design/icons";
import { env } from "../../config/env";
import { brand } from "../../config/theme";
import { dayjs, wallClockToIso, type Dayjs } from "../../lib/dates";
import { getErrorMessage } from "../../lib/errors";
import { CONFIG } from "../../config/configuration";
import { Brand } from "../../layout/Brand";
import { LanguageSwitch } from "../../i18n/LanguageSwitch";
import { AddressInput } from "../../shared/components/AddressInput";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { createPublicBooking, getPublicTenant } from "./api";
import { t } from "../../i18n";

const COUNTRY_CODES = [
  { code: "+39", label: t("IT +39") },
  { code: "+44", label: t("GB +44") },
  { code: "+33", label: t("FR +33") },
  { code: "+49", label: t("DE +49") },
  { code: "+34", label: t("ES +34") },
  { code: "+41", label: t("CH +41") },
  { code: "+43", label: t("AT +43") },
  { code: "+1", label: t("US +1") },
  { code: "+351", label: t("PT +351") },
  { code: "+31", label: t("NL +31") },
  { code: "+48", label: t("PL +48") },
];

interface BookingValues {
  guideName: string;
  prefix: string;
  phone: string;
  email: string;
  radiosCount: number;
  deliveryAt: Dayjs;
  deliveryAddress: string;
  pickupAt?: Dayjs | null;
  pickupAddress?: string;
  notes?: string;
  website?: string; // honeypot
}

/**
 * Public booking form (no login). Guides request a service for a given
 * company: /book/<slug>. The legacy /OrdineGuida URL serves the company set in
 * VITE_PUBLIC_BOOKING_SLUG.
 */
export function BookingPage({ legacy = false }: { legacy?: boolean }) {
  const params = useParams();
  const slug = legacy ? env.publicBookingSlug : params.slug;
  usePageTitle(t("Prenota il servizio"));

  const [form] = Form.useForm<BookingValues>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["public-tenant", slug],
    queryFn: () => getPublicTenant(slug!),
    enabled: Boolean(slug),
    retry: false,
  });

  const shell = (children: React.ReactNode) => (
    <Flex
      vertical
      align="center"
      gap={20}
      style={{ minHeight: "100vh", padding: "24px 16px 40px", background: `linear-gradient(180deg, ${brand.navy} 0, ${brand.navy} 220px, transparent 220px)` }}
    >
      <div style={{ alignSelf: "flex-end" }}>
        <LanguageSwitch />
      </div>
      <Brand to={false} onDark />
      <div style={{ width: "100%", maxWidth: 760 }}>{children}</div>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        © {new Date().getFullYear()} {tenant?.name ?? CONFIG.appName}
        {env.marketingUrl && (
          <>
            {" "}
            · <a href={env.marketingUrl}>{t("Torna al sito")}</a>
          </>
        )}
      </Typography.Text>
    </Flex>
  );

  if (!slug || (!isLoading && (!tenant || !tenant.accepting_bookings))) {
    return shell(
      <Card>
        <Result
          status="info"
          title={t("Prenotazioni non disponibili")}
          subTitle={
            !slug || !tenant
              ? t("Il link che hai usato non è valido. Chiedi il link corretto a chi ti ha fornito il servizio.")
              : t("Questa azienda non accetta prenotazioni online al momento. Contattala direttamente.")
          }
        />
      </Card>,
    );
  }

  if (isLoading || !tenant) {
    return shell(
      <Flex justify="center" style={{ padding: 80 }}>
        <Spin size="large" />
      </Flex>,
    );
  }

  if (done) {
    return shell(
      <Card>
        <Result
          icon={<CheckCircleFilled style={{ color: "#16a34a" }} />}
          title={t("Richiesta inviata!")}
          subTitle={t("{company} ha ricevuto la tua richiesta e ti contatterà a breve per confermare i dettagli.", { company: tenant.name })}
          extra={
            <Button
              type="primary"
              onClick={() => {
                form.resetFields();
                setDone(false);
              }}
            >
              {t("Nuova richiesta")}
            </Button>
          }
        />
      </Card>,
    );
  }

  const onFinish = async (values: BookingValues) => {
    // Honeypot: real users never see this field.
    if (values.website) {
      setDone(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createPublicBooking({
        slug: slug!,
        guideName: values.guideName.trim(),
        guidePhone: `${values.prefix} ${values.phone.trim()}`,
        guideEmail: values.email.trim(),
        radiosCount: values.radiosCount,
        deliveryAt: wallClockToIso(values.deliveryAt, tenant.timezone),
        deliveryAddress: values.deliveryAddress.trim(),
        pickupAt: values.pickupAt ? wallClockToIso(values.pickupAt, tenant.timezone) : null,
        pickupAddress: values.pickupAddress?.trim() || null,
        notes: values.notes?.trim() || null,
      });
      setDone(true);
    } catch (e) {
      setError(getErrorMessage(e, t("Non è stato possibile inviare la richiesta. Riprova.")));
    } finally {
      setSubmitting(false);
    }
  };

  return shell(
    <Card styles={{ body: { padding: 28 } }}>
      <Flex align="center" gap={14} style={{ marginBottom: 20 }}>
        <Flex
          align="center"
          justify="center"
          style={{ width: 48, height: 48, borderRadius: 12, background: brand.primary, color: "#fff", fontSize: 22 }}
        >
          <AudioOutlined />
        </Flex>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t("Prenota il servizio radioguide")}
          </Typography.Title>
          <Typography.Text type="secondary">{tenant.name}</Typography.Text>
        </div>
      </Flex>

      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />}

      <Form<BookingValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        initialValues={{ prefix: "+39" }}
        onFinish={onFinish}
        scrollToFirstError
      >
        <Typography.Title level={5}>{t("I tuoi dati")}</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("Nome guida o gruppo")}
              name="guideName"
              rules={[
                { required: true, whitespace: true, message: t("Inserisci il nome") },
                { min: 2, message: t("Almeno 2 caratteri") },
              ]}
            >
              <Input size="large" placeholder={t("Mario Rossi / Gruppo Roma")} autoComplete="name" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t("Telefono")} required>
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item name="prefix" noStyle>
                  <Select size="large" style={{ width: 110 }} options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.label }))} />
                </Form.Item>
                <Form.Item
                  name="phone"
                  noStyle
                  rules={[
                    { required: true, message: t("Inserisci il numero") },
                    { pattern: /^[0-9\s]{5,15}$/, message: t("Solo cifre (5-15)") },
                  ]}
                >
                  <Input size="large" placeholder="333 1234567" inputMode="tel" autoComplete="tel-national" />
                </Form.Item>
              </Space.Compact>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("Email")}
              name="email"
              rules={[
                { required: true, message: t("Inserisci la tua email") },
                { type: "email", message: t("Email non valida") },
              ]}
            >
              <Input size="large" placeholder={t("nome@esempio.it")} autoComplete="email" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("Numero di radioguide")}
              name="radiosCount"
              rules={[{ required: true, message: t("Indica quante radioguide servono") }]}
            >
              <InputNumber size="large" min={1} max={500} precision={0} placeholder={t("Es. 25")} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Typography.Title level={5} style={{ marginTop: 8 }}>
          {t("Consegna")}
        </Typography.Title>
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item
              label={t("Data e ora")}
              name="deliveryAt"
              rules={[
                { required: true, message: t("Seleziona data e ora") },
                {
                  validator: (_, value: Dayjs | undefined) =>
                    value && value.isBefore(dayjs().subtract(1, "hour"))
                      ? Promise.reject(new Error(t("La data non può essere nel passato")))
                      : Promise.resolve(),
                },
              ]}
            >
              <DatePicker size="large" showTime={{ format: "HH:mm", minuteStep: 5 }} format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={14}>
            <Form.Item
              label={t("Luogo")}
              name="deliveryAddress"
              rules={[{ required: true, whitespace: true, message: t("Inserisci il luogo di consegna") }]}
            >
              <AddressInput size="large" placeholder={t("Indirizzo di consegna")} />
            </Form.Item>
          </Col>
        </Row>

        <Typography.Title level={5} style={{ marginTop: 8 }}>
          {t("Ritiro")}{" "}<Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>{t("(facoltativo)")}</Typography.Text>
        </Typography.Title>
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item
              label={t("Data e ora")}
              name="pickupAt"
              dependencies={["deliveryAt", "pickupAddress"]}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value: Dayjs | null | undefined) {
                    const delivery = getFieldValue("deliveryAt") as Dayjs | undefined;
                    if (!value) {
                      return getFieldValue("pickupAddress")
                        ? Promise.reject(new Error(t("Indica anche data e ora")))
                        : Promise.resolve();
                    }
                    return delivery && value.isBefore(delivery)
                      ? Promise.reject(new Error(t("Il ritiro non può precedere la consegna")))
                      : Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker size="large" showTime={{ format: "HH:mm", minuteStep: 5 }} format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={14}>
            <Form.Item
              label={t("Luogo")}
              name="pickupAddress"
              dependencies={["pickupAt"]}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, value?: string) =>
                    getFieldValue("pickupAt") && !value?.trim()
                      ? Promise.reject(new Error(t("Indica il luogo del ritiro")))
                      : Promise.resolve(),
                }),
              ]}
            >
              <AddressInput size="large" placeholder={t("Indirizzo di ritiro")} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label={t("Note")} name="notes">
          <Input.TextArea rows={3} maxLength={500} showCount placeholder={t("Richieste particolari, accessi, referenti sul posto…")} />
        </Form.Item>

        {/* Honeypot (hidden from people, tempting for bots) */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
          <Form.Item name="website" label={t("Website")}>
            <Input tabIndex={-1} autoComplete="off" />
          </Form.Item>
        </div>

        <Button type="primary" htmlType="submit" size="large" block icon={<SendOutlined />} loading={submitting}>
          {t("Invia richiesta")}
        </Button>
      </Form>
    </Card>,
  );
}

export default BookingPage;
