import { Button, Card, Flex, Result, Spin, Typography } from "antd";
import { Link } from "react-router";

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
      title="Pagina non trovata"
      subTitle="La pagina che cerchi non esiste o è stata spostata."
      extra={
        <Link to="/">
          <Button type="primary">Torna agli ordini</Button>
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
          title="Configurazione mancante"
          subTitle={
            <>
              Imposta <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (file{" "}
              <code>.env.local</code> in sviluppo, variabili d&apos;ambiente nel container Docker)
              e riavvia l&apos;applicazione. Vedi <code>.env.example</code>.
            </>
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
      title="Accesso non consentito"
      subTitle={message ?? "Non hai i permessi per vedere questa pagina."}
      extra={
        <Link to="/">
          <Button type="primary">Torna alla home</Button>
        </Link>
      }
    />
  );
}
