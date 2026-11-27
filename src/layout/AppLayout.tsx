import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useLogout } from "@refinedev/core";
import { Alert, type MenuProps } from "antd";
import {
  BarChartOutlined, CalendarOutlined, LogoutOutlined, ProfileOutlined,
  SettingOutlined, SolutionOutlined, TeamOutlined, UserOutlined,
} from "@ant-design/icons";
import { CONFIG } from "../config/configuration";
import { useCurrentUser } from "../providers/current-user";
import { usePlatformSettings } from "../features/platform/runtime";
import { BillingAlerts } from "../features/billing/BillingAlerts";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { t } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const ADMIN_NAV: NavItem[] = [
  { key: "/", label: t("Ordini"), icon: <ProfileOutlined /> },
  { key: "/calendar", label: t("Calendario"), icon: <CalendarOutlined /> },
  { key: "/dashboard", label: t("Dashboard"), icon: <BarChartOutlined /> },
  { key: "/riders", label: t("Team e rider"), icon: <TeamOutlined /> },
  { key: "/guides", label: t("Guide"), icon: <SolutionOutlined /> },
  { key: "/settings", label: t("Impostazioni"), icon: <SettingOutlined /> },
];

const RIDER_NAV: NavItem[] = [
  { key: "/", label: t("Le mie consegne"), icon: <ProfileOutlined /> },
];

function selectedKey(pathname: string, items: NavItem[]): string {
  const match = items
    .filter((i) => (i.key === "/" ? pathname === "/" : pathname.toLowerCase().startsWith(i.key)))
    .sort((a, b) => b.key.length - a.key.length)[0];
  return match?.key ?? "";
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: logout } = useLogout();
  const { profile, tenant, isAdmin, result } = useCurrentUser();
  const { settings } = usePlatformSettings();
  const access = result?.kind === "ready" ? result.accessMode : undefined;

  const nav = isAdmin ? ADMIN_NAV : RIDER_NAV;
  const current = selectedKey(location.pathname, nav);

  const menuItems = useMemo<MenuProps["items"]>(
    () => nav.map(({ key, label, icon }) => ({ key, label, icon })),
    [nav],
  );

  const userMenu: MenuProps = {
    items: [
      { key: "profile", icon: <UserOutlined />, label: t("Il mio profilo") },
      { type: "divider" },
      { key: "logout", icon: <LogoutOutlined />, label: t("Esci"), danger: true },
    ],
    onClick: ({ key }) => {
      if (key === "profile") navigate("/profile");
      if (key === "logout") logout();
    },
  };

  return (
    <WorkspaceLayout title={tenant?.name ?? CONFIG.appName} items={menuItems} selectedKey={current}
      onNavigate={navigate} actions={<LanguageSwitch />} account={{
        name: profile?.full_name || profile?.email,
        avatarUrl: profile?.avatar_url ?? undefined,
        role: isAdmin ? t("Amministratore") : t("Rider"),
        roleColor: isAdmin ? "blue" : undefined,
        menu: userMenu,
      }}>
      {settings.notice && <Alert type="info" showIcon title={settings.notice} style={{ marginBottom: 16 }} />}
      {isAdmin && <BillingAlerts />}
      {access === "read_only" && <Alert type="warning" showIcon title={t("L’azienda ha accesso in sola lettura.")} style={{ marginBottom: 16 }} />}
      {access === "closeout" && <Alert type="warning" showIcon title={t("Puoi completare gli incarichi già in corso.")} style={{ marginBottom: 16 }} />}
      <Outlet />
    </WorkspaceLayout>
  );
}
