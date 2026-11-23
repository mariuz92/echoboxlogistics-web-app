import { Table } from "antd";
import type { DashboardInsights } from "../api";
import { fmtEuro, fmtShare, share } from "../utils";
import { Section } from "./Section";

/** Where the work is: clusters worth a dedicated route or a rider stationed nearby. */
export function Locations({ data }: { data: DashboardInsights }) {
  const total = data.current.orders;
  return (
    <Section
      title="Dove si consegna"
      note="I luoghi con più ordini: se due sono vicini, un solo giro li copre."
      empty={data.locations.length === 0}
    >
      <Table
        size="small"
        rowKey="location"
        pagination={false}
        dataSource={data.locations}
        columns={[
          { title: "Luogo", dataIndex: "location", ellipsis: true },
          { title: "Ordini", dataIndex: "orders", align: "right", width: 80 },
          { title: "Quota", align: "right", width: 80, render: (_, r) => fmtShare(share(r.orders, total)) },
          { title: "Incasso", dataIndex: "revenue", align: "right", width: 110, render: (v: number) => fmtEuro(v) },
        ]}
      />
    </Section>
  );
}
