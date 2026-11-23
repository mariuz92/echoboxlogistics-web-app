import type { ReactNode } from "react";
import { Button, Card, Flex, Typography } from "antd";
import { BulbOutlined, CheckCircleFilled, CloseOutlined, ExclamationCircleFilled, InfoCircleFilled } from "@ant-design/icons";
import type { Insight, Tone } from "../utils";
import { t } from "../../../i18n";

const ICON: Record<Tone, { icon: ReactNode; color: string; label: string }> = {
  warn: { icon: <ExclamationCircleFilled />, color: "#d97706", label: t("Da guardare") },
  good: { icon: <CheckCircleFilled />, color: "#16a34a", label: t("Va bene") },
  info: { icon: <InfoCircleFilled />, color: "#0284c7", label: t("Da sapere") },
};

/** The findings in plain words: what changed and what to do about it. */
export function Digest({ insights, onClose }: { insights: Insight[]; onClose: () => void }) {
  return (
    <Card
      size="small"
      title={
        <span>
          <BulbOutlined /> {t("In breve")}
        </span>
      }
      extra={<Button type="text" size="small" icon={<CloseOutlined />} aria-label={t("Nascondi In breve")} onClick={onClose} />}
    >
      {insights.length === 0 ? (
        <Typography.Text type="secondary">
          {t("Servono più ordini nel periodo per dire qualcosa di affidabile.")}
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
