import type { ReactNode } from "react";
import { Flex, Progress, Tag, Typography } from "antd";
import dayjs from "dayjs";
import type { Json } from "../src/types/database.types";
import type { AccessMode, Action, SubscriptionState } from "../src/features/platform/api";
import { limitLevel } from "../src/features/billing/types";

export type Values = Record<string, Json | undefined>;
export type Editor = {
  title: string;
  values?: Values;
  fields?: ReactNode;
  description?: string;
  dates?: string[];
  reasonLabel?: string;
} & ({ action: Action; send?: boolean } | { submit: (fields: Values) => Promise<void> });
export type OpenEditor = (editor: Editor) => void;

export const REQUIRED = [{ required: true }];
export const DATE = "YYYY-MM-DDTHH:mm";
export const date = (value: string | null) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—";
export const day = (value: string | null | undefined) => value ? dayjs(value).format("DD/MM/YYYY") : "—";
export const dateInput = (value: string | null | undefined) => value ? dayjs(value).format(DATE) : undefined;
export const label = (value: string) => value.replaceAll("_", " ");
export const money = (value: number, currency = "EUR") =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);

export const ACCESS: Record<AccessMode, [string, string]> = {
  full: ["Attiva", "green"],
  closeout: ["Chiusura incarichi", "gold"],
  read_only: ["Sola lettura", "orange"],
  suspended: ["Sospesa", "red"],
};
export const SUBSCRIPTION: Record<SubscriptionState, string> = {
  trial: "Prova", active: "Attivo", past_due: "Pagamento in ritardo", expired: "Scaduto", cancelled: "Annullato",
};
export function accessTag(mode: AccessMode) {
  return <Tag color={ACCESS[mode][1]}>{ACCESS[mode][0]}</Tag>;
}

const LEVEL_COLOR = { reached: "#ff4d4f", warning: "#faad14", ok: undefined, unlimited: undefined } as const;

/** Usage against an included amount: a bar that turns amber at 80 % and red at 100 %. */
export function UsageBar({ used, included }: { used: number; included: number | null }) {
  const { percent, level } = limitLevel(used, included);
  if (percent === null) {
    return <Flex gap={6} align="baseline"><Typography.Text>{used}</Typography.Text><Typography.Text type="secondary">illimitati</Typography.Text></Flex>;
  }
  return <Progress size="small" percent={Math.min(percent, 100)} strokeColor={LEVEL_COLOR[level]}
    status={level === "reached" ? "exception" : "normal"}
    format={() => `${used}/${included}`} style={{ minWidth: 120, marginBottom: 0 }} />;
}
