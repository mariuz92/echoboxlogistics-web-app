import { Table } from "antd";
import type { DashboardInsights } from "../api";
import { fmtEuro, fmtShare, share } from "../utils";
import { Section } from "./Section";
import { withKeys } from "./withKeys";
import { t } from "../../../i18n";

/** Where the work is: clusters worth a dedicated route or a rider stationed nearby. */
export function Locations({ data }: { data: DashboardInsights }) {
  const total = data.current.orders;
  return (
    <Section
      title={t("Dove si consegna")}
      note={t("I luoghi con più ordini: se due sono vicini, un solo giro li copre.")}
      empty={data.locations.length === 0}
    >
      <Table
        size="small"
        pagination={false}
        dataSource={withKeys(data.locations)}
        columns={[
          { title: t("Luogo"), dataIndex: "location", ellipsis: true },
          { title: t("Ordini"), dataIndex: "orders", align: "right", width: 80 },
          { title: t("Quota"), align: "right", width: 80, render: (_, r) => fmtShare(share(r.orders, total)) },
          { title: t("Incasso"), dataIndex: "revenue", align: "right", width: 110, render: (v: number) => fmtEuro(v) },
        ]}
      />
    </Section>
  );
}
