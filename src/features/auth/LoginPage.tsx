import { useLogin } from "@refinedev/core";
import { Button, Divider, Flex, Form, Input } from "antd";
import { GoogleOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { Link } from "react-router";
import { AuthShell } from "./AuthShell";
import { env } from "../../config/env";
import type { LoginParams } from "../../providers/auth-provider";

export function LoginPage() {
  const { mutate: login, isPending } = useLogin<LoginParams>();

  return (
    <AuthShell
      title="Accedi"
      subtitle="Gestisci ordini, rider e canali radio."
      footer={
        <>
          Non hai un account? <Link to="/register">Registra la tua azienda</Link>
        </>
      }
    >
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
