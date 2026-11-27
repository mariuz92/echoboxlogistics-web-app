import dayjs, { type Dayjs } from "dayjs";
import { numberLocale, t } from "../../i18n";
import { limitLevel, type CompanyBilling } from "./types";

export interface BillingAlert {
  /** Stable per situation and period: a dismissed alert stays dismissed until the situation changes. */
  id: string;
  level: "info" | "warning";
  message: string;
}

export const money = (value: number, currency = "EUR") =>
  new Intl.NumberFormat(numberLocale(), { style: "currency", currency }).format(value);

/** Notices shown at the top of the app to company admins: trial, payment, limits reached. */
export function billingAlerts(billing: CompanyBilling, now: Dayjs = dayjs()): BillingAlert[] {
  const { subscription: sub, plan, usage } = billing;
  if (!sub) return [];
  const alerts: BillingAlert[] = [];
  const endsAt = sub.ends_at ? dayjs(sub.ends_at) : null;

  if (sub.state === "trial" && endsAt) {
    const days = Math.ceil(endsAt.diff(now, "day", true));
    if (days <= 0) {
      alerts.push({
        id: `trial_over:${endsAt.format("YYYY-MM-DD")}`, level: "warning",
        message: t("La prova è terminata: scegli un piano dalle Impostazioni per continuare a lavorare."),
      });
    } else if (days <= 7) {
      alerts.push({
        id: `trial:${endsAt.format("YYYY-MM-DD")}`, level: "info",
        message: t("La prova termina il {date}. Scegli un piano per non interrompere il servizio.", { date: endsAt.format("DD/MM/YYYY") }),
      });
    }
  }
  if (sub.state === "past_due") {
    alerts.push({
      id: "past_due", level: "warning",
      message: sub.grace_until
        ? t("Il pagamento dell’abbonamento è in ritardo. Regolarizzalo entro il {date} per evitare la sola lettura.", { date: dayjs(sub.grace_until).format("DD/MM/YYYY") })
        : t("Il pagamento dell’abbonamento è in ritardo. Controlla le fatture nelle Impostazioni."),
    });
  }
  if (sub.state === "expired" || sub.state === "cancelled") {
    alerts.push({ id: `inactive:${sub.state}`, level: "warning", message: t("L’abbonamento non è attivo. Scegli un piano dalle Impostazioni.") });
  }

  const currency = plan?.currency ?? "EUR";
  const orders = limitLevel(usage.orders, plan?.included_orders ?? null);
  if (plan && orders.level === "reached") {
    alerts.push({
      id: `orders_100:${usage.period_start}`, level: "info",
      message: t("Hai raggiunto gli ordini inclusi nel piano ({used} su {included}). Puoi continuare: gli ordini in più costano {price} ogni {block}.", {
        used: usage.orders, included: plan.included_orders ?? 0, price: money(plan.extra_orders_price, currency), block: plan.orders_block,
      }),
    });
  } else if (plan && orders.level === "warning") {
    alerts.push({
      id: `orders_80:${usage.period_start}`, level: "info",
      message: t("Hai usato {used} ordini su {included} inclusi nel piano questo mese.", { used: usage.orders, included: plan.included_orders ?? 0 }),
    });
  }
  const riders = limitLevel(usage.riders, plan?.included_riders ?? null);
  if (plan && riders.level === "reached") {
    alerts.push({
      id: `riders_100:${usage.period_start}`, level: "info",
      message: t("Hai {used} rider attivi e il piano ne include {included}. Ogni rider in più costa {price} al mese.", {
        used: usage.riders, included: plan.included_riders ?? 0, price: money(plan.extra_rider_price, currency),
      }),
    });
  }
  return alerts;
}
