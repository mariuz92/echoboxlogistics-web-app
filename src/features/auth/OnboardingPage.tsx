import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { App, Button, Form, Input } from "antd";
import { AuthShell } from "./AuthShell";
import { supabase } from "../../lib/supabase";
import { getErrorMessage } from "../../lib/errors";
import { loadCurrentUser, signOut } from "./session";
import { useCurrentUser } from "../../providers/current-user";
import { FullPageSpinner } from "../../shared/components/Screens";

/**
 * Shown to a signed-in user who is not attached to a company yet
 * (typically the first Google sign-in). They register a company here.
 */
export function OnboardingPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { result, loading, refresh } = useCurrentUser();
  const [saving, setSaving] = useState(false);

  if (loading) return <FullPageSpinner />;
  if (result?.kind === "ready") return <Navigate to="/" replace />;
  if (result?.kind !== "needs_company") return <Navigate to="/login" replace />;

  const onFinish = async ({ companyName }: { companyName: string }) => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { company_name: companyName.trim() },
      });
      if (error) throw error;

      const current = await loadCurrentUser(true);
      if (current.kind === "ready") {
        await refresh();
        navigate("/", { replace: true });
      } else if (current.kind === "blocked") {
        message.error(current.message);
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      title="Ultimo passaggio"
      subtitle="Il tuo account non è ancora collegato a un'azienda. Registra la tua azienda, oppure chiedi a un amministratore di invitarti."
      footer={
        <Button type="link" onClick={() => void signOut().then(() => navigate("/login"))}>
          Esci
        </Button>
      }
    >
      <Form<{ companyName: string }> layout="vertical" requiredMark={false} onFinish={onFinish}>
        <Form.Item
          label="Nome azienda"
          name="companyName"
          rules={[
            { required: true, message: "Inserisci il nome dell'azienda" },
            { min: 2, message: "Almeno 2 caratteri" },
          ]}
        >
          <Input size="large" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={saving}>
          Crea azienda
        </Button>
      </Form>
    </AuthShell>
  );
}
