import { useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import {
  Alert, App, Button, Card, ConfigProvider, Drawer, Flex, Grid, Layout, Menu, Spin, Typography, theme,
} from "antd";
import itIT from "antd/locale/it_IT";
import {
  AlertOutlined, AuditOutlined, BarChartOutlined, CreditCardOutlined, LogoutOutlined, MailOutlined,
  MenuOutlined, MoonOutlined, ReloadOutlined, SettingOutlined, SunOutlined, TeamOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import "@fontsource-variable/inter";
import "../src/styles/global.css";
import { brand, getTheme } from "../src/config/theme";
import { isSupabaseConfigured } from "../src/config/env";
import { Brand } from "../src/layout/Brand";
import { PageHeader } from "../src/shared/components/PageHeader";
import { ThemeModeProvider, useThemeMode } from "../src/providers/theme-mode";
import { AuthShell } from "../src/features/auth/AuthShell";
import { actionError, getSnapshot, platformClient } from "../src/features/platform/api";
import { OperatorAuth } from "./OperatorAuth";
import { ActionEditor, AuditTable, Companies, Contacts, IssueTable, Operators, Overview, Plans, PlatformSettings } from "./ConsolePages";

const menuItems = [
  { key: "overview", label: "Panoramica", icon: <BarChartOutlined /> },
  { key: "companies", label: "Aziende", icon: <TeamOutlined /> },
  { key: "plans", label: "Piani", icon: <CreditCardOutlined /> },
  { key: "issues", label: "Problemi", icon: <AlertOutlined /> },
  { key: "contacts", label: "Messaggi", icon: <MailOutlined /> },
  { key: "settings", label: "Configurazione", icon: <SettingOutlined /> },
  { key: "operators", label: "Operatori", icon: <SafetyCertificateOutlined /> },
  { key: "audit", label: "Audit", icon: <AuditOutlined /> },
];

function ConsoleWorkspace({ userId, email }: { userId: string; email?: string }) {
  const [page, setPage] = useState("overview");
  const [tenantId, setTenantId] = useState<string>();
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [editor, setEditor] = useState<ComponentProps<typeof ActionEditor>["editor"]>();
  const { mode, toggle } = useThemeMode();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const mobile = !Grid.useBreakpoint().lg;
  const queryClient = useQueryClient();
  const scope = page === "companies" ? tenantId : undefined;
  const filter = page === "companies" && !scope ? search : undefined;
  const result = useQuery({
    queryKey: ["platform", userId, scope, filter],
    queryFn: () => getSnapshot(scope, filter),
    refetchInterval: 60_000,
    retry: false,
  });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["platform", userId] }); };
  const snapshot = result.data;

  async function logout() {
    const { error } = await platformClient.auth.signOut({ scope: "local" });
    if (error) { void message.error("Impossibile terminare la sessione."); return; }
    queryClient.removeQueries({ queryKey: ["platform", userId] });
  }

  const navigation = <>
    <Flex align="center" style={{ height: 64, paddingInline: 20 }}><Brand to={false} onDark /></Flex>
    <Menu
      mode="inline" theme="dark" selectedKeys={[page]} items={menuItems}
      onClick={({ key }) => { setPage(key); setDrawer(false); }}
      style={{ background: "transparent", borderInlineEnd: 0, paddingTop: 8 }}
    />
  </>;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {mobile ? <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" size={260} closable={false}
        styles={{ body: { padding: 0, background: brand.navy }, header: { display: "none" } }} aria-label="Menu Superadmin">
        {navigation}
      </Drawer> : <Layout.Sider width={236} style={{ position: "sticky", top: 0, height: "100vh", overflow: "auto" }}>
        {navigation}
      </Layout.Sider>}
      <Layout style={{ minWidth: 0 }}>
        <Layout.Header style={{
          position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingInline: mobile ? 12 : 24,
        }}>
          <Flex align="center" gap={8}>
            {mobile && <Button type="text" aria-label="Apri menu" icon={<MenuOutlined />} onClick={() => setDrawer(true)} />}
            <Typography.Text strong>Superadmin</Typography.Text>
          </Flex>
          <Flex align="center" gap={4}>
            {!mobile && <Typography.Text type="secondary" style={{ marginRight: 8 }}>{email}</Typography.Text>}
            <Button type="text" aria-label="Aggiorna" loading={result.isFetching} icon={<ReloadOutlined />} onClick={refresh} />
            <Button type="text" aria-label="Cambia tema" icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} />
            <Button type="text" aria-label="Esci" icon={<LogoutOutlined />} onClick={() => void logout()} />
          </Flex>
        </Layout.Header>
        <Layout.Content style={{ padding: mobile ? 16 : 24, minWidth: 0 }}>
          {result.isError ? <Alert showIcon type="error" title={actionError(result.error)}
            action={<Button onClick={refresh}>Riprova</Button>} /> :
          !snapshot ? <Spin /> : <>
            {page === "overview" && <Overview snapshot={snapshot} />}
            {page === "companies" && <Companies snapshot={snapshot} company={scope ? snapshot.companies[0] : undefined}
              onCompany={setTenantId} onSearch={setSearch} openEditor={setEditor} refresh={refresh} />}
            {page === "plans" && <Plans snapshot={snapshot} edit={setEditor} />}
            {page === "issues" && <>
              <PageHeader title="Problemi" subtitle="Segnalazioni raggruppate per origine, azienda e versione." />
              <Card><IssueTable snapshot={snapshot} edit={setEditor} /></Card>
            </>}
            {page === "contacts" && <Contacts snapshot={snapshot} edit={setEditor} />}
            {page === "settings" && <PlatformSettings snapshot={snapshot} edit={setEditor} />}
            {page === "operators" && <Operators snapshot={snapshot} userId={userId} edit={setEditor} />}
            {page === "audit" && <>
              <PageHeader title="Audit" subtitle="Modifiche eseguite dagli operatori e accettazione degli inviti." />
              <Card><AuditTable snapshot={snapshot} /></Card>
            </>}
          </>}
        </Layout.Content>
      </Layout>
      {editor && <ActionEditor editor={editor} close={() => setEditor(undefined)} refresh={refresh} />}
    </Layout>
  );
}

const queryClient = new QueryClient();

function ConsoleRoot() {
  const { mode } = useThemeMode();
  return (
    <ConfigProvider theme={getTheme(mode)} locale={itIT}>
      <App>
        {isSupabaseConfigured ? <OperatorAuth>{(session) =>
          <ConsoleWorkspace key={session.user.id} userId={session.user.id} email={session.user.email} />
        }</OperatorAuth> : <AuthShell title="Superadmin">
          <Alert showIcon type="error" title="Configura l’indirizzo e la chiave pubblica di Supabase per continuare." />
        </AuthShell>}
      </App>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeModeProvider>
      <QueryClientProvider client={queryClient}><ConsoleRoot /></QueryClientProvider>
    </ThemeModeProvider>
  </BrowserRouter>,
);
