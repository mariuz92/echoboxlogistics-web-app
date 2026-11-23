import { Col, Flex, Row, Statistic, Table, Typography } from "antd";
import { dayjs, fmtNumber } from "../../../lib/dates";
import type { DashboardInsights } from "../api";
import { fmtEuro, fmtShare, share } from "../utils";
import { BarList } from "./BarList";
import { Section } from "./Section";
import { withKeys } from "./withKeys";

/** Who the revenue depends on, who is new, who has gone quiet, who loses radios. */
export function Guides({ data }: { data: DashboardInsights }) {
  const g = data.guides;
  const revenue = data.current.revenue;
  const top3 = g.top.slice(0, 3).reduce((acc, x) => acc + x.revenue, 0);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Section
          title="Chi porta l'incasso"
          note={
            g.top.length >= 3 && revenue > 0 ? (
              <>
                Le prime 3 guide valgono il <b>{fmtShare(share(top3, revenue))}</b> dell'incasso del periodo.
              </>
            ) : undefined
          }
          empty={g.top.length === 0}
        >
          <BarList
            ariaLabel="Incasso per guida"
            items={g.top.map((x) => ({
              label: x.name,
              value: x.revenue,
              text: `${fmtEuro(x.revenue)} · ${fmtShare(share(x.revenue, revenue))}`,
              hint: `${x.orders} ordini`,
            }))}
          />
        </Section>
      </Col>
      <Col xs={24} lg={12}>
        <Flex vertical gap={16}>
          <Section title="Clienti del periodo">
            <Flex gap={32} wrap>
              <Statistic title="Guide attive" value={fmtNumber(g.active)} />
              <Statistic
                title="Alla prima prenotazione"
                value={fmtNumber(g.new)}
                suffix={g.new > 0 ? <Typography.Text type="secondary" style={{ fontSize: 13 }}>{fmtEuro(g.new_revenue)}</Typography.Text> : undefined}
              />
            </Flex>
          </Section>
          <Section
            title="Da riconquistare"
            note="Hanno ordinato più volte ma non prenotano da oltre 45 giorni e non hanno ordini in programma."
          >
            <Table
              size="small"
              pagination={false}
              dataSource={withKeys(g.win_back)}
              locale={{ emptyText: "Nessuna guida inattiva da recuperare" }}
              columns={[
                { title: "Guida", dataIndex: "name", ellipsis: true },
                {
                  title: "Ultimo ordine",
                  dataIndex: "last_order",
                  render: (v: string, r) => `${dayjs(v).format("D MMM")} (${r.days_since} g)`,
                },
                { title: "Incasso storico", dataIndex: "revenue", align: "right", render: (v: number) => fmtEuro(v) },
              ]}
            />
          </Section>
          {g.losses.length > 0 && (
            <Section title="Chi perde radio" note="Per chi succede più spesso, valuta una cauzione.">
              <Table
                size="small"
                pagination={false}
                dataSource={withKeys(g.losses)}
                columns={[
                  { title: "Guida", dataIndex: "name", ellipsis: true },
                  { title: "Perse", dataIndex: "lost", align: "right", width: 80 },
                  { title: "Consegnate", dataIndex: "radios", align: "right", width: 110, render: (v: number) => fmtNumber(v) },
                ]}
              />
            </Section>
          )}
        </Flex>
      </Col>
    </Row>
  );
}
