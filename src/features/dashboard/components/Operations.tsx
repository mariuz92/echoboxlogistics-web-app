import { Col, Flex, Row, Statistic, Table, Typography } from "antd";
import { fmtNumber } from "../../../lib/dates";
import type { DashboardInsights } from "../api";
import { fmtEuro, fmtShare, share } from "../utils";
import { BarList } from "./BarList";
import { Section } from "./Section";

const SOURCE_LABEL = { public_form: "Dal modulo online", dashboard: "Inseriti dall'ufficio" } as const;

/** How orders arrive and how the team handles them. */
export function Operations({ data }: { data: DashboardInsights }) {
  const { lead_time: lt, sources, avg_days_out, riders } = data.operations;
  const total = lt.same_day + lt.days_1_2 + lt.days_3_7 + lt.days_8_30 + lt.over_30;
  const buckets = [
    { label: "Meno di 24 ore", value: lt.same_day },
    { label: "1-2 giorni", value: lt.days_1_2 },
    { label: "3-7 giorni", value: lt.days_3_7 },
    { label: "8-30 giorni", value: lt.days_8_30 },
    { label: "Oltre 30 giorni", value: lt.over_30 },
  ];
  const sourceOrders = sources.reduce((acc, s) => acc + s.orders, 0);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <Section
          title="Con quanto anticipo prenotano"
          note="Dalla prenotazione alla consegna. Gli ordini last minute sono quelli che mettono in crisi i rider."
          empty={total === 0}
        >
          <BarList
            ariaLabel="Anticipo delle prenotazioni"
            items={buckets.map((b) => ({ label: b.label, value: b.value, text: `${fmtNumber(b.value)} · ${fmtShare(share(b.value, total))}` }))}
          />
        </Section>
      </Col>
      <Col xs={24} lg={8}>
        <Flex vertical gap={16}>
          <Section title="Da dove arrivano gli ordini" empty={sources.length === 0}>
            <Flex vertical gap={14}>
              {sources.map((s) => (
                <div key={s.source}>
                  <Flex justify="space-between" gap={8}>
                    <Typography.Text strong>{SOURCE_LABEL[s.source]}</Typography.Text>
                    <Typography.Text>
                      {fmtNumber(s.orders)} ordini · {fmtShare(share(s.orders, sourceOrders))}
                    </Typography.Text>
                  </Flex>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {fmtEuro(s.revenue)} · annullati {fmtShare(share(s.cancelled, s.orders + s.cancelled))}
                  </Typography.Text>
                </div>
              ))}
            </Flex>
          </Section>
          <Section title="Quanto restano fuori le radio">
            <Statistic
              value={avg_days_out === null ? "n/d" : avg_days_out < 1 ? String(Math.round(avg_days_out * 24)) : String(avg_days_out).replace(".", ",")}
              suffix={avg_days_out === null ? undefined : avg_days_out < 1 ? "ore" : "giorni"}
            />
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Dalla consegna al ritiro, in media
            </Typography.Text>
          </Section>
        </Flex>
      </Col>
      <Col xs={24} lg={8}>
        <Section title="Carico e puntualità dei rider" note="Spostamenti = consegne + ritiri del periodo." empty={riders.length === 0}>
          <Table
            size="small"
            rowKey="name"
            pagination={false}
            dataSource={riders}
            columns={[
              { title: "Rider", dataIndex: "name", ellipsis: true },
              { title: "Spostamenti", dataIndex: "stops", align: "right", width: 110 },
              {
                title: "Puntuali",
                align: "right",
                width: 90,
                render: (_, r) => fmtShare(share(r.on_time, r.delivered)),
              },
            ]}
          />
        </Section>
      </Col>
    </Row>
  );
}
