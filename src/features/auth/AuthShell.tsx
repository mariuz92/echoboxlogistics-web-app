import type { ReactNode } from "react";
import { Card, Flex, Typography, theme as antdTheme } from "antd";
import { Brand } from "../../layout/Brand";
import { brand } from "../../config/theme";

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** Centered card on a branded background, shared by every signed-out screen. */
export function AuthShell({ title, subtitle, children, footer, width = 440 }: AuthShellProps) {
  const { token } = antdTheme.useToken();

  return (
    <Flex
      align="center"
      justify="center"
      vertical
      gap={20}
      style={{
        minHeight: "100vh",
        padding: "32px 16px",
        background: `radial-gradient(1200px 500px at 50% -10%, ${brand.navyLight} 0%, ${brand.navy} 60%)`,
      }}
    >
      <Brand to={false} onDark />

      <Card
        variant="borderless"
        style={{
          width: "100%",
          maxWidth: width,
          boxShadow: "0 20px 50px rgba(0,0,0,.35)",
          borderRadius: token.borderRadiusLG + 4,
        }}
        styles={{ body: { padding: 32 } }}
      >
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
            {subtitle}
          </Typography.Paragraph>
        )}
        {children}
      </Card>

      {footer && (
        <Typography.Text style={{ color: "rgba(255,255,255,.7)", textAlign: "center" }}>
          {footer}
        </Typography.Text>
      )}
    </Flex>
  );
}
