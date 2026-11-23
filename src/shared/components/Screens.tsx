import { Button, Card, Flex, Result, Spin, Typography } from "antd";
import { Link } from "react-router";
import { t } from "../../i18n";

export function FullPageSpinner({ label = "Caricamento…" }: { label?: string }) {
  return (
    <Flex align="center" justify="center" vertical gap={12} style={{ minHeight: "100vh" }}>
      <Spin size="large" />
      <Typography.Text type="secondary">{label}</Typography.Text>
    </Flex>
  );
}

export function SectionSpinner() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: 240 }}>
      <Spin />
    </Flex>
  );
}

export function NotFoundPage() {
  return (
    <Result
      status="404"
      title={t("Pagina non trovata")}
      subTitle={t("La pagina che cerchi non esiste o è stata spostata.")}
      extra={
        <Link to="/">
          <Button type="primary">{t("Torna agli ordini")}</Button>
        </Link>
      }
    />
  );
}

export function ConfigurationError() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: "100vh", padding: 24 }}>
      <Card style={{ maxWidth: 560 }}>
        <Result
          status="warning"
          title={t("Configurazione mancante")}
          subTitle={
            t(
              "Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (file .env.local in sviluppo, variabili d'ambiente nel container Docker) e riavvia l'applicazione. Vedi .env.example.",
            )
          }
        />
      </Card>
    </Flex>
  );
}

export function AccessDenied({ message }: { message?: string }) {
  return (
    <Result
      status="403"
      title={t("Accesso non consentito")}
      subTitle={message ?? t("Non hai i permessi per vedere questa pagina.")}
      extra={
        <Link to="/">
          <Button type="primary">{t("Torna alla home")}</Button>
        </Link>
      }
    />
  );
}
