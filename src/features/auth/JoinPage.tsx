import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, App, Button, Form, Input, Spin } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { AuthShell } from "./AuthShell";
import { confirmPasswordRule, passwordRules, phoneRules } from "./validators";
import { supabase } from "../../lib/supabase";
import { getErrorMessage } from "../../lib/errors";
import { loadCurrentUser } from "./session";
import { updateOwnProfile } from "../settings/api";
import { useCurrentUser } from "../../providers/current-user";

interface JoinValues {
  name: string;
  phone?: string;
  password: string;
  confirmPassword: string;
}

/**
 * Landing page of the invitation email.
 * The link signs the invitee in; here they choose a password and confirm their
 * details. The membership itself is created by public.bootstrap_profile(),
 * which matches the invitation on the (verified) email address.
 */
export function JoinPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { refresh } = useCurrentUser();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState<string>("");
  const [form] = Form.useForm<JoinValues>();

  useEffect(() => {
    let active = true;

    const verify = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        setState("invalid");
        return;
      }
      const current = await loadCurrentUser(true);
      if (!active) return;
      if (current.kind === "ready") {
        setCompanyName(current.tenant.name);
        form.setFieldsValue({
          name: current.profile.full_name,
          phone: current.profile.phone ?? "",
        });
        setState("ready");
      } else {
        setState("invalid");
      }
    };

    void verify();
    // The invite token is exchanged for a session shortly after load.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setTimeout(() => void verify(), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [form]);

  const onFinish = async (values: JoinValues) => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
        data: { full_name: values.name.trim(), phone: values.phone?.trim() || undefined },
      });
      if (error) throw error;

      const current = await loadCurrentUser(true);
      if (current.kind === "ready") {
        await updateOwnProfile(current.profile.id, {
          full_name: values.name.trim(),
          phone: values.phone?.trim() || null,
        });
      }
      await refresh();
      message.success("Benvenuto! Il tuo account è pronto.");
      navigate("/", { replace: true });
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      title="Completa la registrazione"
      subtitle={companyName ? `Sei stato invitato a unirti a ${companyName}.` : undefined}
    >
      {state === "checking" && <Spin />}

      {state === "invalid" && (
        <Alert
          type="error"
          showIcon
          title="Invito non valido o scaduto"
          description="Chiedi a un amministratore di inviarti un nuovo invito."
        />
      )}

      {state === "ready" && (
        <Form<JoinValues> form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
          <Form.Item
            label="Nome e cognome"
            name="name"
            rules={[{ required: true, message: "Inserisci il tuo nome" }]}
          >
            <Input size="large" autoComplete="name" />
          </Form.Item>
          <Form.Item label="Telefono" name="phone" rules={phoneRules}>
            <Input size="large" autoComplete="tel" />
          </Form.Item>
          <Form.Item label="Scegli una password" name="password" rules={passwordRules} hasFeedback>
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
          <Button type="primary" htmlType="submit" size="large" block loading={saving}>
            Entra
          </Button>
        </Form>
      )}
    </AuthShell>
  );
}
