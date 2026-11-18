import { useEffect, useState } from "react";
import { useUpdatePassword } from "@refinedev/core";
import { Alert, Button, Form, Input, Spin } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { Link } from "react-router";
import { AuthShell } from "./AuthShell";
import { confirmPasswordRule, passwordRules } from "./validators";
import { supabase } from "../../lib/supabase";

/** Landing page of the "reset password" email link. */
export function UpdatePasswordPage() {
  const { mutate: updatePassword, isPending } = useUpdatePassword<{ password: string }>();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // supabase-js turns the link's token into a session asynchronously.
  useEffect(() => {
    let active = true;
    const check = () =>
      supabase.auth.getSession().then(({ data }) => {
        if (active) setHasSession(Boolean(data.session));
      });
    void check();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setTimeout(check, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthShell
      title="Nuova password"
      subtitle="Scegli una password sicura per il tuo account."
      footer={<Link to="/login">Torna all&apos;accesso</Link>}
    >
      {hasSession === null ? (
        <Spin />
      ) : !hasSession ? (
        <Alert
          type="error"
          showIcon
          title="Link non valido o scaduto"
          description={
            <>
              Richiedine uno nuovo dalla pagina <Link to="/forgot-password">Password dimenticata</Link>.
            </>
          }
        />
      ) : (
        <Form<{ password: string; confirmPassword: string }>
          layout="vertical"
          requiredMark={false}
          onFinish={({ password }) => updatePassword({ password })}
        >
          <Form.Item label="Nuova password" name="password" rules={passwordRules} hasFeedback>
            <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="Conferma password"
            name="confirmPassword"
            dependencies={["password"]}
            rules={[{ required: true, message: "Conferma la password" }, confirmPasswordRule()]}
            hasFeedback
          >
            <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={isPending}>
            Aggiorna password
          </Button>
        </Form>
      )}
    </AuthShell>
  );
}
