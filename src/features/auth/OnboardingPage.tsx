import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { App, Button, Form, Input, Typography } from "antd";
import { AuthShell } from "./AuthShell";
import { supabase } from "../../lib/supabase";
import { getErrorMessage } from "../../lib/errors";
import { loadCurrentUser, signOut } from "./session";
import { usePlatformSettings } from "../platform/runtime";
import { useCurrentUser } from "../../providers/current-user";
import { FullPageSpinner } from "../../shared/components/Screens";
import { t } from "../../i18n";

/**
 * Shown to a signed-in user who is not attached to a company yet
 * (typically the first Google sign-in). They register a company here.
 */
export function OnboardingPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { result, loading, refresh } = useCurrentUser();
  const { settings, isPending: settingsPending } = usePlatformSettings();
  const [saving, setSaving] = useState(false);

  if (loading) return <FullPageSpinner />;
  if (result?.kind === "ready") return <Navigate to="/" replace />;
  if (result?.kind === "pending_invite") return <Navigate to="/join" replace />;
  if (result?.kind !== "needs_company") return <Navigate to="/login" replace />;
  if (settingsPending) return <FullPageSpinner />;

  const signOutLink = (
    <Button type="link" onClick={() => void signOut().then(() => navigate("/login"))}>
      {t("Esci")}
    </Button>
  );
  if (settings.operator_only_companies) {
    return (
      <AuthShell title={t("Accesso su invito")} footer={signOutLink}>
        <Typography.Text type="secondary">
          {t("Per accedere alla tua azienda, apri il link di invito che hai ricevuto via email.")}
        </Typography.Text>
      </AuthShell>
    );
  }

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
      title={t("Ultimo passaggio")}
      subtitle={t("Il tuo account non è ancora collegato a un'azienda. Registra la tua azienda, oppure chiedi a un amministratore di invitarti.")}
      footer={signOutLink}
    >
      <Form<{ companyName: string }> layout="vertical" requiredMark={false} onFinish={onFinish}>
        <Form.Item
          label={t("Nome azienda")}
          name="companyName"
          rules={[
            { required: true, message: t("Inserisci il nome dell'azienda") },
            { min: 2, message: t("Almeno 2 caratteri") },
          ]}
        >
          <Input size="large" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={saving}>
          {t("Crea azienda")}
        </Button>
      </Form>
    </AuthShell>
  );
}
