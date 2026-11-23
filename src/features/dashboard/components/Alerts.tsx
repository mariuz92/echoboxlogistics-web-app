import { Alert, Flex } from "antd";
import { Link } from "react-router";
import { fmtNumber } from "../../../lib/dates";
import type { DashboardInsights } from "../api";

/** What needs a decision today. Renders nothing when everything is in order. */
export function Alerts({ alerts }: { alerts: DashboardInsights["alerts"] }) {
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
      text: `${alerts.unassigned_deliveries} ${alerts.unassigned_deliveries === 1 ? "consegna" : "consegne"} dei prossimi 7 giorni senza rider.`,
    });
  }
  if (alerts.unassigned_pickups > 0) {
    items.push({
      key: "pickups",
      text: `${alerts.unassigned_pickups} ${alerts.unassigned_pickups === 1 ? "ritiro" : "ritiri"} dei prossimi 7 giorni senza rider.`,
    });
  }
  if (items.length === 0) return null;

  return (
    <Alert
      type="warning"
      showIcon
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
