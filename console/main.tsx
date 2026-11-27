import { useEffect, useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, matchPath, useLocation, useNavigate, useSearchParams } from "react-router";
import { Alert, App, Button, Card, ConfigProvider, Tooltip } from "antd";
import itIT from "antd/locale/it_IT";
import {
  AlertOutlined, AuditOutlined, BarChartOutlined, CreditCardOutlined, DollarOutlined, LogoutOutlined, MailOutlined,
  ReloadOutlined, SettingOutlined, TeamOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import "@fontsource-variable/inter";
import "../src/styles/global.css";
import { getTheme } from "../src/config/theme";
import { isSupabaseConfigured } from "../src/config/env";
import { WorkspaceLayout } from "../src/layout/WorkspaceLayout";
import { PageHeader } from "../src/shared/components/PageHeader";
import { NotFoundPage, SectionSpinner } from "../src/shared/components/Screens";
import { usePageTitle } from "../src/shared/hooks/usePageTitle";
import { ThemeModeProvider, useThemeMode } from "../src/providers/theme-mode";
import { AuthShell } from "../src/features/auth/AuthShell";
import { actionError, getBillingOverview, getSnapshot, platformClient } from "../src/features/platform/api";
import { OperatorAuth } from "./OperatorAuth";
import { ActionEditor, AuditTable, Companies, Contacts, Operators, Overview, PlatformSettings } from "./ConsolePages";
import { Billing, Plans } from "./BillingPages";
import { IssueDrawer, IssueQueue, OrderHistory } from "./ConsoleSupport";

const menuItems = [
  { key: "/", label: "Panoramica", icon: <BarChartOutlined /> },
  { key: "/companies", label: "Aziende", icon: <TeamOutlined /> },
  { key: "/billing", label: "Fatturazione", icon: <DollarOutlined /> },
  { key: "/plans", label: "Piani", icon: <CreditCardOutlined /> },
  { key: "/issues", label: "Problemi", icon: <AlertOutlined /> },
  { key: "/contacts", label: "Messaggi", icon: <MailOutlined /> },
  { key: "/settings", label: "Configurazione", icon: <SettingOutlined /> },
  { key: "/operators", label: "Operatori", icon: <SafetyCertificateOutlined /> },
  { key: "/audit", label: "Audit", icon: <AuditOutlined /> },
];

const companyTabs = ["people", "billing", "operations", "issues", "audit"];
const recordId = (value?: string | null) =>
  value && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value) ? value.toLowerCase() : undefined;

function ConsoleWorkspace({ userId, email }: { userId: string; email?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<ComponentProps<typeof ActionEditor>["editor"]>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const companyRoute = matchPath("/companies/:tenantId/:tab?", location.pathname);
  const page = menuItems.find((item) => item.key === (companyRoute ? "/companies" : location.pathname.replace(/\/$/, "") || "/"));
  const scope = recordId(companyRoute?.params.tenantId);
  const tab = companyRoute?.params.tab ?? "people";
  const validPage = !!page && (!companyRoute || (scope !== undefined && companyTabs.includes(tab)));
  const filter = page?.key === "/companies" && !scope ? params.get("q")?.trim().slice(0, 120) || undefined : undefined;
  const issueId = recordId(params.get("issue"));
  const orderId = scope && tab === "operations" && !issueId ? recordId(params.get("order")) : undefined;
  const result = useQuery({
    queryKey: ["platform", userId, "snapshot", scope, filter],
    queryFn: () => getSnapshot(scope, filter),
    enabled: validPage,
    refetchInterval: 60_000,
    retry: false,
  });
  // Billing data is separate so that an older database (without the billing migration) only
  // loses the billing pages, never the rest of the console.
  const billing = useQuery({
    queryKey: ["platform", userId, "billing"],
    queryFn: getBillingOverview,
    enabled: validPage,
    refetchInterval: 60_000,
    retry: false,
  });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["platform", userId] }); };
  const snapshot = result.data;
  const company = scope ? snapshot?.companies[0] : undefined;
  usePageTitle(company?.name ?? page?.label ?? "Superadmin");
  useEffect(() => setEditor(undefined), [location.key]);

  function openCompany(id?: string, nextTab = "people") {
    navigate(id ? `/companies/${id}/${nextTab}` : "/companies");
  }

  function searchCompanies(value: string) {
    const search = value.trim();
    setParams(search ? { q: search } : {}, { replace: true });
  }

  function openDetail(key: "issue" | "order", id: string) {
    const next = new URLSearchParams(params);
    next.set(key, id);
    setParams(next, { state: { openedDetail: true } });
  }

  function closeDetail(key: "issue" | "order") {
    if (location.state?.openedDetail) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete(key);
      setParams(next, { replace: true });
    }
  }

  async function logout() {
    const { error } = await platformClient.auth.signOut({ scope: "local" });
    if (error) { void message.error("Impossibile terminare la sessione."); return; }
    queryClient.removeQueries({ queryKey: ["platform", userId] });
  }

  const openIssue = (id: string) => openDetail("issue", id);

  return <WorkspaceLayout title="Superadmin" items={menuItems} selectedKey={page?.key ?? ""} onNavigate={navigate}
    account={{ name: email, role: "Operatore", roleColor: "blue", menu: {
      items: [{ key: "logout", label: "Esci", danger: true, icon: <LogoutOutlined /> }],
      onClick: () => void logout(),
    } }}
    actions={<Tooltip title="Aggiorna"><Button type="text" aria-label="Aggiorna" loading={result.isFetching} icon={<ReloadOutlined />} onClick={refresh} /></Tooltip>}>
    {!validPage ? <NotFoundPage returnLabel="Torna alla panoramica" /> :
      result.isError ? <Alert showIcon type="error" title={actionError(result.error)}
        action={<Button onClick={refresh}>Riprova</Button>} /> : !snapshot ? <SectionSpinner /> : <>
        {page?.key === "/" && <Overview snapshot={snapshot} overview={billing.data} openIssue={openIssue}
          openQueue={() => navigate("/issues")} openBilling={() => navigate("/billing")} />}
        {page?.key === "/companies" && <Companies userId={userId} snapshot={snapshot} company={company}
          onCompany={openCompany} search={filter} onSearch={searchCompanies} openEditor={setEditor} refresh={refresh} tab={tab}
          overview={billing.data} overviewFailed={billing.isError}
          onTab={(nextTab) => openCompany(scope, nextTab)} openIssue={openIssue} openOrderHistory={(id) => openDetail("order", id)} />}
        {page?.key === "/billing" && (billing.data
          ? <Billing overview={billing.data} snapshot={snapshot} edit={setEditor} openCompany={openCompany} />
          : billing.isError ? <Alert showIcon type="error" title={actionError(billing.error)}
            action={<Button onClick={refresh}>Riprova</Button>} /> : <SectionSpinner />)}
        {page?.key === "/plans" && <Plans snapshot={snapshot} overview={billing.data} edit={setEditor} />}
        {page?.key === "/issues" && <>
          <PageHeader title="Problemi" subtitle="Segnalazioni raggruppate per origine, azienda e versione." />
          <IssueQueue userId={userId} openIssue={openIssue} />
        </>}
        {page?.key === "/contacts" && <Contacts snapshot={snapshot} edit={setEditor} />}
        {page?.key === "/settings" && <PlatformSettings snapshot={snapshot} edit={setEditor} />}
        {page?.key === "/operators" && <Operators snapshot={snapshot} userId={userId} edit={setEditor} />}
        {page?.key === "/audit" && <>
          <PageHeader title="Audit" subtitle="Modifiche eseguite dagli operatori e accettazione degli inviti." />
          <Card><AuditTable snapshot={snapshot} /></Card>
        </>}
        {issueId && <IssueDrawer userId={userId} issueId={issueId} operators={snapshot.operators}
          close={() => closeDetail("issue")} edit={setEditor} openCompany={(id) => openCompany(id, "operations")} />}
        {company && orderId && <OrderHistory userId={userId} tenantId={company.id} timezone={company.timezone}
          orderId={orderId} close={() => closeDetail("order")} />}
      </>}
    {editor && <ActionEditor editor={editor} close={() => setEditor(undefined)} refresh={refresh} />}
  </WorkspaceLayout>;
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
