import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Button } from "antd";
import { t } from "../../i18n";
import { billingAlerts } from "./alerts";
import { useCompanyBilling } from "./useBilling";

const STORAGE_KEY = "echobox-billing-dismissed";

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

/** Trial, payment and limit notices for company admins. Each can be closed until the situation changes. */
export function BillingAlerts() {
  const navigate = useNavigate();
  const { data } = useCompanyBilling();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const alerts = useMemo(() => (data ? billingAlerts(data) : []).filter((a) => !dismissed.includes(a.id)), [data, dismissed]);

  function dismiss(id: string) {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the notice just comes back next time */
    }
  }

  return (
    <>
      {alerts.map((alert) => (
        <Alert key={alert.id} type={alert.level} showIcon closable style={{ marginBottom: 16 }} title={alert.message}
          onClose={() => dismiss(alert.id)}
          action={<Button size="small" onClick={() => navigate("/settings?tab=subscription")}>{t("Vedi abbonamento")}</Button>} />
      ))}
    </>
  );
}
