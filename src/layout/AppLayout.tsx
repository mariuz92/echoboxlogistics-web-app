import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useLogout } from "@refinedev/core";
import {
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Flex,
  Grid,
  Layout,
  Menu,
  Tag,
  Tooltip,
  Typography,
  theme as antdTheme,
  type MenuProps,
} from "antd";
import {
  BarChartOutlined,
  CalendarOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  ProfileOutlined,
  SettingOutlined,
  SolutionOutlined,
  SunOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { CONFIG } from "../config/configuration";
import { brand } from "../config/theme";
import { useCurrentUser } from "../providers/current-user";
import { useThemeMode } from "../providers/theme-mode";
import { Brand } from "./Brand";
import { t } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";

const { Sider, Header, Content } = Layout;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  admin?: boolean;
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
  const { token } = antdTheme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: logout } = useLogout();
  const { profile, tenant, isAdmin } = useCurrentUser();
  const { mode, toggle } = useThemeMode();

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = isAdmin ? ADMIN_NAV : RIDER_NAV;
  const current = selectedKey(location.pathname, nav);

  const menuItems = useMemo<MenuProps["items"]>(
    () => nav.map(({ key, label, icon }) => ({ key, label, icon })),
    [nav],
  );

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
    setDrawerOpen(false);
  };

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

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[current]}
      items={menuItems}
      onClick={onMenuClick}
      style={{ background: "transparent", borderInlineEnd: 0, paddingTop: 8 }}
    />
  );

  const siderHeader = (compact: boolean) => (
    <Flex
      align="center"
      justify={compact ? "center" : "flex-start"}
      style={{ height: 64, padding: compact ? 0 : "0 20px" }}
    >
      <Brand compact={compact} onDark />
    </Flex>
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {!isMobile && (
        <Sider
          width={236}
          collapsedWidth={72}
          collapsed={collapsed}
          trigger={null}
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            overflow: "auto",
            borderInlineEnd: `1px solid ${brand.navyLight}`,
          }}
        >
          {siderHeader(collapsed)}
          {menu}
        </Sider>
      )}

      {isMobile && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          size={260}
          closable={false}
          styles={{ body: { padding: 0, background: brand.navy }, header: { display: "none" } }}
        >
          {siderHeader(false)}
          {menu}
        </Drawer>
      )}

      <Layout>
        <Header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Flex align="center" gap={12}>
            <Button
              type="text"
              aria-label={t("Apri o chiudi il menu")}
              icon={
                isMobile ? (
                  <MenuOutlined />
                ) : collapsed ? (
                  <MenuUnfoldOutlined />
                ) : (
                  <MenuFoldOutlined />
                )
              }
              onClick={() => (isMobile ? setDrawerOpen(true) : setCollapsed((c) => !c))}
            />
            {!isMobile && (
              <Typography.Text type="secondary" style={{ fontWeight: 500 }}>
                {tenant?.name ?? CONFIG.appName}
              </Typography.Text>
            )}
          </Flex>

          <Flex align="center" gap={8}>
            <LanguageSwitch />
            <Tooltip title={mode === "dark" ? t("Tema chiaro") : t("Tema scuro")}>
              <Button
                type="text"
                aria-label={t("Cambia tema")}
                icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggle}
              />
            </Tooltip>
            <Dropdown menu={userMenu} trigger={["click"]} placement="bottomRight">
              <Button type="text" style={{ height: 44, paddingInline: 8 }}>
                <Flex align="center" gap={10}>
                  <Avatar
                    size={30}
                    src={profile?.avatar_url ?? undefined}
                    style={{ background: brand.primary }}
                  >
                    {(profile?.full_name || profile?.email || "?").charAt(0).toUpperCase()}
                  </Avatar>
                  {!isMobile && (
                    <Flex vertical align="flex-start" style={{ lineHeight: 1.15 }}>
                      <Typography.Text strong>
                        {profile?.full_name || profile?.email}
                      </Typography.Text>
                      <Tag
                        variant="filled"
                        color={isAdmin ? "blue" : "default"}
                        style={{ margin: 0, fontSize: 11, lineHeight: "16px" }}
                      >
                        {isAdmin ? t("Amministratore") : t("Rider")}
                      </Tag>
                    </Flex>
                  )}
                </Flex>
              </Button>
            </Dropdown>
          </Flex>
        </Header>

        <Content style={{ padding: isMobile ? 16 : 28 }}>
          <div style={{ maxWidth: 1480, margin: "0 auto" }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
