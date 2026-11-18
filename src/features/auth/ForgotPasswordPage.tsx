import { useForgotPassword } from "@refinedev/core";
import { Button, Form, Input } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { Link } from "react-router";
import { AuthShell } from "./AuthShell";

export function ForgotPasswordPage() {
  const { mutate: forgotPassword, isPending } = useForgotPassword<{ email: string }>();

  return (
    <AuthShell
      title="Password dimenticata"
      subtitle="Inserisci la tua email: ti invieremo un link per scegliere una nuova password."
      footer={<Link to="/login">Torna all&apos;accesso</Link>}
    >
      <Form<{ email: string }>
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => forgotPassword(values)}
      >
        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: "Inserisci la tua email" },
            { type: "email", message: "Email non valida" },
          ]}
        >
          <Input size="large" prefix={<MailOutlined />} autoComplete="email" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={isPending}>
          Invia link
        </Button>
      </Form>
    </AuthShell>
  );
}
