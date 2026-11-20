import { useLogin } from "@refinedev/core";
import { Alert, Button, Divider, Flex, Form, Input } from "antd";
import { GoogleOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthShell } from "./AuthShell";
import { usePlatformSettings } from "../platform/runtime";
import { env } from "../../config/env";
import type { LoginParams } from "../../providers/auth-provider";
import { getErrorMessage } from "../../lib/errors";
import { takeLoginNotice } from "./session";

const REASON_MESSAGES: Record<string, string> = {
  disabled: "Il tuo account è stato disabilitato. Contatta un amministratore.",
};

export function LoginPage() {
  const settings = usePlatformSettings();
  const { mutate: login, isPending } = useLogin<LoginParams>();
  // Set when a signed-in session could not be used (e.g. company name already taken):
  // either passed in the URL or left as a one-shot notice by the auth check.
  const urlReason = useSearchParams()[0].get("reason");
  const [reason] = useState(() => urlReason ?? takeLoginNotice());

  return (
    <AuthShell
      title="Accedi"
      subtitle="Gestisci ordini, rider e canali radio."
      footer={
        settings.operator_only_companies ? undefined : <>
          Non hai un account? <Link to="/register">Registra la tua azienda</Link>
        </>
      }
    >
      {reason && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={REASON_MESSAGES[reason] ?? getErrorMessage(reason)}
        />
      )}

      <Form<LoginParams>
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => login(values)}
        autoComplete="on"
      >
        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: "Inserisci la tua email" },
            { type: "email", message: "Email non valida" },
          ]}
        >
          <Input
            size="large"
            prefix={<MailOutlined />}
            placeholder="nome@azienda.it"
            autoComplete="email"
          />
        </Form.Item>

        <Form.Item
          label="Password"
          name="password"
          rules={[{ required: true, message: "Inserisci la password" }]}
          extra={
            <Flex justify="flex-end" style={{ marginTop: 6 }}>
              <Link to="/forgot-password">Password dimenticata?</Link>
            </Flex>
          }
        >
          <Input.Password
            size="large"
            prefix={<LockOutlined />}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={isPending}>
          Accedi
        </Button>
      </Form>

      {env.enableGoogleAuth && (
        <>
          <Divider plain>oppure</Divider>
          <Button
            size="large"
            block
            icon={<GoogleOutlined />}
            onClick={() => login({ providerName: "google" })}
          >
            Continua con Google
          </Button>
        </>
      )}
    </AuthShell>
  );
}
