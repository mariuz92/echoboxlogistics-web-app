import { Alert, Flex } from "antd";
import { Link } from "react-router";
import { fmtNumber } from "../../../lib/dates";
import type { DashboardInsights } from "../api";
import { t, tn } from "../../../i18n";

/** The lines of the "needs attention" panel: empty when everything is in order. */
export function alertItems(alerts: DashboardInsights["alerts"]): { key: string; text: string }[] {
  const items: { key: string; text: string }[] = [];
  const o = alerts.overdue_pickups;
  if (o.orders > 0) {
    items.push({
      key: "overdue",
      text: tn(o.orders, "{n} ritiro in ritardo", "{n} ritiri in ritardo") + ": " + t("{radios} radio ancora fuori", { radios: fmtNumber(o.radios) }) + (o.oldest_days >= 1 ? ", " + tn(o.oldest_days, "la più vecchia da {n} giorno", "la più vecchia da {n} giorni") : "") + ".",
    });
  }
  if (alerts.unassigned_deliveries > 0) {
    items.push({
      key: "deliveries",
      text: tn(alerts.unassigned_deliveries, "{n} consegna nelle prossime 48 ore senza rider.", "{n} consegne nelle prossime 48 ore senza rider."),
    });
  }
  if (alerts.unassigned_pickups > 0) {
    items.push({
      key: "pickups",
      text: tn(alerts.unassigned_pickups, "{n} ritiro nelle prossime 24 ore senza rider.", "{n} ritiri nelle prossime 24 ore senza rider."),
    });
  }
  return items;
}

/** What needs a decision today. Can be closed; the toggle above the page brings it back. */
export function Alerts({ alerts, onClose }: { alerts: DashboardInsights["alerts"]; onClose: () => void }) {
  const items = alertItems(alerts);
  if (items.length === 0) return null;

  return (
    <Alert
      type="warning"
      showIcon
      closable={{ onClose, "aria-label": t("Nascondi Da gestire ora") }}
      title={t("Da gestire ora")}
      description={
        <Flex vertical gap={2}>
          {items.map((i) => (
            <span key={i.key}>{i.text}</span>
          ))}
          <Link to="/">{t("Apri gli ordini")}</Link>
        </Flex>
      }
    />
  );
}
