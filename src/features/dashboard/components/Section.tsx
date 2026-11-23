import type { ReactNode } from "react";
import { Card, Empty, Typography } from "antd";

/** A titled block of the dashboard: the title says what question the figure answers. */
export function Section({
  title,
  note,
  extra,
  children,
  empty,
  height,
}: {
  title: string;
  /** one line under the title: how to read it */
  note?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  empty?: boolean;
  /** fixed height of the content area (charts) */
  height?: number;
}) {
  return (
    <Card title={title} extra={extra} size="small" style={{ height: "100%" }}>
      {note && (
        <Typography.Paragraph type="secondary" style={{ marginTop: -4, marginBottom: 12, fontSize: 13 }}>
          {note}
        </Typography.Paragraph>
      )}
      <div style={height ? { width: "100%", height } : undefined}>
        {empty ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nessun dato nel periodo" /> : children}
      </div>
    </Card>
  );
}

export function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <Typography.Title level={4} style={{ margin: "12px 0 -4px", letterSpacing: "-0.01em" }}>
      {children}
    </Typography.Title>
  );
}
