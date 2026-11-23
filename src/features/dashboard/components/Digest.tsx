import type { ReactNode } from "react";
import { Card, Flex, Typography } from "antd";
import { BulbOutlined, CheckCircleFilled, ExclamationCircleFilled, InfoCircleFilled } from "@ant-design/icons";
import type { Insight, Tone } from "../utils";

const ICON: Record<Tone, { icon: ReactNode; color: string; label: string }> = {
  warn: { icon: <ExclamationCircleFilled />, color: "#d97706", label: "Da guardare" },
  good: { icon: <CheckCircleFilled />, color: "#16a34a", label: "Va bene" },
  info: { icon: <InfoCircleFilled />, color: "#0284c7", label: "Da sapere" },
};

/** The findings in plain words: what changed and what to do about it. */
export function Digest({ insights }: { insights: Insight[] }) {
  return (
    <Card
      size="small"
      title={
        <span>
          <BulbOutlined /> In breve
        </span>
      }
    >
      {insights.length === 0 ? (
        <Typography.Text type="secondary">
          Servono più ordini nel periodo per dire qualcosa di affidabile.
        </Typography.Text>
      ) : (
        <Flex vertical gap={14}>
          {insights.map((i) => {
            const t = ICON[i.tone];
            return (
              <Flex key={i.key} gap={12} align="flex-start">
                <span style={{ color: t.color, fontSize: 18, lineHeight: "24px" }} role="img" aria-label={t.label}>
                  {t.icon}
                </span>
                <div>
                  <Typography.Text strong>{i.title}. </Typography.Text>
                  <Typography.Text>{i.text}</Typography.Text>
                </div>
              </Flex>
            );
          })}
        </Flex>
      )}
    </Card>
  );
}
