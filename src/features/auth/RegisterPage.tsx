import { useRegister } from "@refinedev/core";
import { Alert, Button, Checkbox, Col, Form, Input, Row } from "antd";
import { Link } from "react-router";
import { AuthShell } from "./AuthShell";
import { confirmPasswordRule, passwordRules, phoneRules } from "./validators";
import type { RegisterParams } from "../../providers/auth-provider";

interface RegisterValues extends RegisterParams {
  confirmPassword?: string;
  accept?: boolean;
}

export function RegisterPage() {
  const { mutate: register, isPending } = useRegister<RegisterParams>();

  return (
    <AuthShell
      title="Registra la tua azienda"
      subtitle="Crea l'account amministratore. Per unirti a un'azienda esistente usa il link di invito che hai ricevuto via email."
      width={560}
      footer={
        <>
          Hai già un account? <Link to="/login">Accedi</Link>
        </>
      }
    >
      <Form<RegisterValues>
        layout="vertical"
        requiredMark={false}
        onFinish={({ confirmPassword: _c, accept: _a, ...values }) => register(values)}
      >
        <Form.Item
          label="Nome azienda"
          name="companyName"
          rules={[
            { required: true, message: "Inserisci il nome dell'azienda" },
            { min: 2, message: "Almeno 2 caratteri" },
          ]}
        >
          <Input size="large" placeholder="Es. EchoBox Roma" autoComplete="organization" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Nome e cognome"
              name="name"
              rules={[{ required: true, message: "Inserisci il tuo nome" }]}
            >
              <Input size="large" autoComplete="name" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Telefono" name="phoneNumber" rules={phoneRules}>
              <Input size="large" placeholder="+39 333 1234567" autoComplete="tel" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: "Inserisci la tua email" },
            { type: "email", message: "Email non valida" },
          ]}
        >
          <Input size="large" autoComplete="email" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Password" name="password" rules={passwordRules} hasFeedback>
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Conferma password"
              name="confirmPassword"
              dependencies={["password"]}
              rules={[{ required: true, message: "Conferma la password" }, confirmPasswordRule()]}
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
                  : Promise.reject(new Error("Devi accettare termini e privacy")),
            },
          ]}
        >
          <Checkbox>
            Accetto i <Link to="/terms">Termini e condizioni</Link> e la{" "}
            <Link to="/privacy">Privacy policy</Link>
          </Checkbox>
        </Form.Item>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Ti invieremo un'email di conferma. Dovrai aprirla prima del primo accesso."
        />

        <Button type="primary" htmlType="submit" size="large" block loading={isPending}>
          Crea account
        </Button>
      </Form>
    </AuthShell>
  );
}
