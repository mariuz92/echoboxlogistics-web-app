import { useState, type ReactNode } from "react";
import { Avatar, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Tag, Tooltip, Typography, theme, type MenuProps } from "antd";
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { brand } from "../config/theme";
import { useThemeMode } from "../providers/theme-mode";
import { Brand } from "./Brand";
import { t } from "../i18n";

interface WorkspaceLayoutProps {
  title: string;
  items: MenuProps["items"];
  selectedKey: string;
  onNavigate: (key: string) => void;
  account: { name?: string; avatarUrl?: string; role: string; roleColor?: string; menu: MenuProps };
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkspaceLayout({ title, items, selectedKey, onNavigate, account, actions, children }: WorkspaceLayoutProps) {
  const { token } = theme.useToken();
  const mobile = !Grid.useBreakpoint().lg;
  const { mode, toggle } = useThemeMode();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigation = (compact: boolean) => <>
    <Flex align="center" justify={compact ? "center" : "flex-start"}
      style={{ height: 64, padding: compact ? 0 : "0 20px" }}>
      <Brand compact={compact} onDark />
    </Flex>
    <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={items}
      onClick={({ key }) => { onNavigate(key); setDrawerOpen(false); }}
      style={{ background: "transparent", borderInlineEnd: 0, paddingTop: 8 }} />
  </>;

  return <Layout style={{ minHeight: "100vh" }}>
    {mobile ? <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" size={260} closable={false}
      aria-label={t("Menu di navigazione")} styles={{ body: { padding: 0, background: brand.navy }, header: { display: "none" } }}>
      {navigation(false)}
    </Drawer> : <Layout.Sider width={236} collapsedWidth={72} collapsed={collapsed} trigger={null}
      style={{ position: "sticky", top: 0, height: "100vh", overflow: "auto", borderInlineEnd: `1px solid ${brand.navyLight}` }}>
      {navigation(collapsed)}
    </Layout.Sider>}
    <Layout style={{ minWidth: 0 }}>
      <Layout.Header style={{
        position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingInline: mobile ? 12 : 24,
      }}>
        <Flex align="center" gap={12}>
          <Button type="text" aria-label={t("Apri o chiudi il menu")} aria-expanded={mobile ? drawerOpen : !collapsed}
            icon={mobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => (mobile ? setDrawerOpen(true) : setCollapsed((value) => !value))} />
          {!mobile && <Typography.Text type="secondary" style={{ fontWeight: 500 }}>{title}</Typography.Text>}
        </Flex>
        <Flex align="center" gap={8}>
          {actions}
          <Tooltip title={mode === "dark" ? t("Tema chiaro") : t("Tema scuro")}>
            <Button type="text" aria-label={t("Cambia tema")} icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} />
          </Tooltip>
          <Dropdown menu={account.menu} trigger={["click"]} placement="bottomRight">
            <Button type="text" aria-label={[t("Menu account"), account.name, account.role].filter(Boolean).join(" · ")}
              style={{ height: 44, paddingInline: 8 }}>
              <Flex align="center" gap={10}>
                <Avatar size={30} src={account.avatarUrl} style={{ background: brand.primary }}>
                  {(account.name || "?").charAt(0).toUpperCase()}
                </Avatar>
                {!mobile && <Flex vertical align="flex-start" style={{ lineHeight: 1.15 }}>
                  <Typography.Text strong>{account.name}</Typography.Text>
                  <Tag variant="filled" color={account.roleColor ?? "default"} style={{ margin: 0, fontSize: 11, lineHeight: "16px" }}>
                    {account.role}
                  </Tag>
                </Flex>}
              </Flex>
            </Button>
          </Dropdown>
        </Flex>
      </Layout.Header>
      <Layout.Content style={{ padding: mobile ? 16 : 28 }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", minWidth: 0 }}>{children}</div>
      </Layout.Content>
    </Layout>
  </Layout>;
}
