import { useRegister } from "@refinedev/core";
import { Alert, Button, Checkbox, Col, Form, Input, Row, Typography } from "antd";
import { Link } from "react-router";
import { AuthShell } from "./AuthShell";
import { confirmPasswordRule, passwordRules, phoneRules } from "./validators";
import { usePlatformSettings } from "../platform/runtime";
import { FullPageSpinner } from "../../shared/components/Screens";
import type { RegisterParams } from "../../providers/auth-provider";
import { t } from "../../i18n";

interface RegisterValues extends RegisterParams {
  confirmPassword?: string;
  accept?: boolean;
}

export function RegisterPage() {
  const { mutate: register, isPending } = useRegister<RegisterParams>();
  const { settings, isPending: settingsPending } = usePlatformSettings();

  if (settingsPending) return <FullPageSpinner />;
  if (settings.operator_only_companies) {
    return (
      <AuthShell title={t("Accesso su invito")} footer={<Link to="/login">{t("Torna all’accesso")}</Link>}>
        <Typography.Text type="secondary">
          {t("Per accedere alla tua azienda, apri il link di invito che hai ricevuto via email.")}
        </Typography.Text>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("Registra la tua azienda")}
      subtitle={t("Crea l'account amministratore. Per unirti a un'azienda esistente usa il link di invito che hai ricevuto via email.")}
      width={560}
      footer={
        <>
          {t("Hai già un account?")}{" "}<Link to="/login">{t("Accedi")}</Link>
        </>
      }
    >
      <Form<RegisterValues>
        layout="vertical"
        requiredMark={false}
        onFinish={({ confirmPassword: _c, accept: _a, ...values }) => register(values)}
      >
        <Form.Item
          label={t("Nome azienda")}
          name="companyName"
          rules={[
            { required: true, message: t("Inserisci il nome dell'azienda") },
            { min: 2, message: t("Almeno 2 caratteri") },
          ]}
        >
          <Input size="large" placeholder={t("Es. Audioguide Roma")} autoComplete="organization" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label={t("Nome e cognome")}
              name="name"
              rules={[{ required: true, message: t("Inserisci il tuo nome") }]}
            >
              <Input size="large" autoComplete="name" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label={t("Telefono")} name="phoneNumber" rules={phoneRules}>
              <Input size="large" placeholder="+39 333 1234567" autoComplete="tel" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label={t("Email")}
          name="email"
          rules={[
            { required: true, message: t("Inserisci la tua email") },
            { type: "email", message: t("Email non valida") },
          ]}
        >
          <Input size="large" autoComplete="email" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label={t("Password")} name="password" rules={passwordRules} hasFeedback>
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label={t("Conferma password")}
              name="confirmPassword"
              dependencies={["password"]}
              rules={[{ required: true, message: t("Conferma la password") }, confirmPasswordRule()]}
              hasFeedback
            >
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="accept"
          valuePropName="checked"
          rules={[
            {
              validator: (_, checked) =>
                checked
                  ? Promise.resolve()
                  : Promise.reject(new Error(t("Devi accettare termini e privacy"))),
            },
          ]}
        >
          <Checkbox>
            {t("Accetto i")}{" "}<Link to="/terms">{t("Termini e condizioni")}</Link> {t("e la")}{" "}
            <Link to="/privacy">{t("Privacy policy")}</Link>
          </Checkbox>
        </Form.Item>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={t("Ti invieremo un'email di conferma. Dovrai aprirla prima del primo accesso.")}
        />

        <Button type="primary" htmlType="submit" size="large" block loading={isPending}>
          {t("Crea account")}
        </Button>
      </Form>
    </AuthShell>
  );
}
