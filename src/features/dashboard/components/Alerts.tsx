import { Alert, Flex } from "antd";
import { Link } from "react-router";
import { fmtNumber } from "../../../lib/dates";
import type { DashboardInsights } from "../api";

/** The lines of the "needs attention" panel: empty when everything is in order. */
export function alertItems(alerts: DashboardInsights["alerts"]): { key: string; text: string }[] {
  const items: { key: string; text: string }[] = [];
  const o = alerts.overdue_pickups;
  if (o.orders > 0) {
    items.push({
      key: "overdue",
      text: `${o.orders} ${o.orders === 1 ? "ritiro in ritardo" : "ritiri in ritardo"}: ${fmtNumber(o.radios)} radio ancora fuori${
        o.oldest_days >= 1 ? `, la più vecchia da ${o.oldest_days} ${o.oldest_days === 1 ? "giorno" : "giorni"}` : ""
      }.`,
    });
  }
  if (alerts.unassigned_deliveries > 0) {
    items.push({
      key: "deliveries",
      text: `${alerts.unassigned_deliveries} ${alerts.unassigned_deliveries === 1 ? "consegna" : "consegne"} nelle prossime 48 ore senza rider.`,
    });
  }
  if (alerts.unassigned_pickups > 0) {
    items.push({
      key: "pickups",
      text: `${alerts.unassigned_pickups} ${alerts.unassigned_pickups === 1 ? "ritiro" : "ritiri"} nelle prossime 24 ore senza rider.`,
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
      closable={{ onClose, "aria-label": "Nascondi Da gestire ora" }}
      title="Da gestire ora"
      description={
        <Flex vertical gap={2}>
          {items.map((i) => (
            <span key={i.key}>{i.text}</span>
          ))}
          <Link to="/">Apri gli ordini</Link>
        </Flex>
      }
    />
  );
}
