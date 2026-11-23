import { useForgotPassword } from "@refinedev/core";
import { Button, Form, Input } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { Link } from "react-router";
import { AuthShell } from "./AuthShell";
import { t } from "../../i18n";

export function ForgotPasswordPage() {
  const { mutate: forgotPassword, isPending } = useForgotPassword<{ email: string }>();

  return (
    <AuthShell
      title={t("Password dimenticata")}
      subtitle={t("Inserisci la tua email: ti invieremo un link per scegliere una nuova password.")}
      footer={<Link to="/login">{t("Torna all'accesso")}</Link>}
    >
      <Form<{ email: string }>
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => forgotPassword(values)}
      >
        <Form.Item
          label={t("Email")}
          name="email"
          rules={[
            { required: true, message: t("Inserisci la tua email") },
            { type: "email", message: t("Email non valida") },
          ]}
        >
          <Input size="large" prefix={<MailOutlined />} autoComplete="email" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={isPending}>
          {t("Invia link")}
        </Button>
      </Form>
    </AuthShell>
  );
}
