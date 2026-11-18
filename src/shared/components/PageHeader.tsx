import type { ReactNode } from "react";
import { Flex, Typography } from "antd";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <Flex
      justify="space-between"
      align="flex-start"
      wrap
      gap={16}
      style={{ marginBottom: 20 }}
    >
      <div>
        <Typography.Title level={2} style={{ margin: 0, letterSpacing: "-0.02em" }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ display: "block", marginTop: 2 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {actions && (
        <Flex gap={8} wrap align="center">
          {actions}
        </Flex>
      )}
    </Flex>
  );
}
