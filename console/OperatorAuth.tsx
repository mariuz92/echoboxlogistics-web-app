import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Flex, Form, Input, Spin, Typography } from "antd";
import type { Session } from "@supabase/supabase-js";
import { AuthShell } from "../src/features/auth/AuthShell";
import { actionError, platformClient } from "../src/features/platform/api";

type OperatorState = "checking" | "signed_out" | "mfa_required" | "ready" | "denied" | "unavailable";
type Factor = { id: string; qr?: string; secret?: string };

export function OperatorAuth({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<OperatorState>("checking");
  const [verifiedToken, setVerifiedToken] = useState<string>();
  const [factor, setFactor] = useState<Factor | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let active = true;
    const { data } = platformClient.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setState("signed_out");
        setVerifiedToken(undefined);
        setFactor(null);
      }
    });
    void platformClient.auth.getSession().then(({ data: current, error }) => {
      if (!active) return;
      if (error) setState("unavailable");
      else { setSession(current.session); if (!current.session) setState("signed_out"); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void platformClient.rpc("platform_operator_status").then(({ data, error }) => {
      if (!active) return;
      setVerifiedToken(!error && data === "ready" ? session.access_token : undefined);
      setState(error ? "unavailable" : data === "ready" || data === "mfa_required" ? data : "denied");
    });
    return () => { active = false; };
  }, [session]);

  const signOut = async () => {
    const { error } = await platformClient.auth.signOut({ scope: "local" });
    if (error) { setFailure("Impossibile terminare la sessione. Riprova."); return; }
    setSession(null);
    setFactor(null);
    setFailure("");
    setState("signed_out");
  };

  async function signIn(values: { email: string; password: string }) {
    setBusy(true);
    setFailure("");
    try {
      const { error } = await platformClient.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
      if (error) setFailure("Accesso non riuscito. Controlla le credenziali e riprova.");
    } finally { setBusy(false); }
  }

  async function prepareFactor() {
    setBusy(true);
    setFailure("");
    try {
      const { data, error } = await platformClient.auth.mfa.listFactors();
      if (error) throw error;
      if (data.totp[0]) { setFactor({ id: data.totp[0].id }); return; }
      const incomplete = data.all.find((item) => item.factor_type === "totp" && item.status === "unverified");
      if (incomplete) {
        const { error: removeError } = await platformClient.auth.mfa.unenroll({ factorId: incomplete.id });
        if (removeError) throw removeError;
      }
      const enrollment = await platformClient.auth.mfa.enroll({ factorType: "totp", issuer: "EchoBox", friendlyName: "EchoBox Superadmin" });
      if (enrollment.error) throw enrollment.error;
      setFactor({ id: enrollment.data.id, qr: enrollment.data.totp.qr_code, secret: enrollment.data.totp.secret });
    } catch (error) { setFailure(actionError(error)); }
    finally { setBusy(false); }
  }

  async function verify({ code }: { code: string }) {
    if (!factor) return;
    setBusy(true);
    setFailure("");
    try {
      const { error } = await platformClient.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) { setFailure("Codice non valido. Inserisci il codice corrente dell’app di autenticazione."); return; }
      const { data } = await platformClient.auth.getSession();
      setSession(data.session);
      setFactor(null);
    } finally { setBusy(false); }
  }

  if (state === "ready" && session && verifiedToken === session.access_token) return children(session);

  return (
    <AuthShell title="Superadmin" subtitle="Accesso alla console EchoBox" footer={
      session && <Button type="text" style={{ color: "inherit" }} onClick={() => void signOut()}>Esci</Button>
    }>
      <Flex vertical gap={14}>
        {failure && <Alert title={failure} showIcon type="error" />}
        {(state === "checking" || state === "ready") && <Spin />}
        {state === "unavailable" && <Alert showIcon type="error" title="Console non raggiungibile. Controlla il servizio e riprova." />}
        {state === "denied" && <Alert showIcon type="warning" title="Questo account non ha accesso alla console." />}
        {state === "signed_out" && (
          <Form layout="vertical" onFinish={signIn} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
              <Input size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]}>
              <Input.Password size="large" autoComplete="current-password" />
            </Form.Item>
            <Button block type="primary" size="large" htmlType="submit" loading={busy}>Accedi</Button>
          </Form>
        )}
        {state === "mfa_required" && !factor && (
          <Button block type="primary" loading={busy} onClick={() => void prepareFactor()}>Verifica in due passaggi</Button>
        )}
        {state === "mfa_required" && factor && (
          <Form layout="vertical" onFinish={verify} requiredMark={false}>
            {factor.qr && (
              <Flex vertical align="center" gap={8} style={{ marginBottom: 16 }}>
                <Typography.Text>Scansiona il codice con la tua app di autenticazione.</Typography.Text>
                <img src={factor.qr} alt="Codice QR per configurare la verifica in due passaggi" width={180} height={180} />
                <Typography.Text code copyable>{factor.secret}</Typography.Text>
              </Flex>
            )}
            <Form.Item name="code" label="Codice di verifica" rules={[{ required: true, pattern: /^\d{6}$/ }]}>
              <Input autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={busy}>Verifica</Button>
          </Form>
        )}
      </Flex>
    </AuthShell>
  );
}
