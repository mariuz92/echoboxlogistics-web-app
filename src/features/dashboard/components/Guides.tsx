import { Col, Flex, Row, Statistic, Table, Typography } from "antd";
import { dayjs, fmtNumber } from "../../../lib/dates";
import type { DashboardInsights } from "../api";
import { fmtEuro, fmtShare, share } from "../utils";
import { BarList } from "./BarList";
import { Section } from "./Section";
import { withKeys } from "./withKeys";
import { t, tn } from "../../../i18n";

/** Who the revenue depends on, who is new, who has gone quiet, who loses radios. */
export function Guides({ data }: { data: DashboardInsights }) {
  const g = data.guides;
  const revenue = data.current.revenue;
  const top3 = g.top.slice(0, 3).reduce((acc, x) => acc + x.revenue, 0);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Section
          title={t("Chi porta l'incasso")}
          note={
            g.top.length >= 3 && revenue > 0 ? (
              <>
                {t("Le prime 3 guide valgono il")}{" "}<b>{fmtShare(share(top3, revenue))}</b> {t("dell'incasso del periodo.")}
              </>
            ) : undefined
          }
          empty={g.top.length === 0}
        >
          <BarList
            ariaLabel={t("Incasso per guida")}
            items={g.top.map((x) => ({
              label: x.name,
              value: x.revenue,
              text: `${fmtEuro(x.revenue)} · ${fmtShare(share(x.revenue, revenue))}`,
              hint: tn(x.orders, "{n} ordine", "{n} ordini"),
            }))}
          />
        </Section>
      </Col>
      <Col xs={24} lg={12}>
        <Flex vertical gap={16}>
          <Section title={t("Clienti del periodo")}>
            <Flex gap={32} wrap>
              <Statistic title={t("Guide attive")} value={fmtNumber(g.active)} />
              <Statistic
                title={t("Alla prima prenotazione")}
                value={fmtNumber(g.new)}
                suffix={g.new > 0 ? <Typography.Text type="secondary" style={{ fontSize: 13 }}>{fmtEuro(g.new_revenue)}</Typography.Text> : undefined}
              />
            </Flex>
          </Section>
          <Section
            title={t("Da riconquistare")}
            note={t("Hanno ordinato più volte ma non prenotano da oltre 45 giorni e non hanno ordini in programma.")}
          >
            <Table
              size="small"
              pagination={false}
              dataSource={withKeys(g.win_back)}
              locale={{ emptyText: t("Nessuna guida inattiva da recuperare") }}
              columns={[
                { title: t("Guida"), dataIndex: "name", ellipsis: true },
                {
                  title: t("Ultimo ordine"),
                  dataIndex: "last_order",
                  render: (v: string, r) => `${dayjs(v).format("D MMM")} (${r.days_since} g)`,
                },
                { title: t("Incasso storico"), dataIndex: "revenue", align: "right", render: (v: number) => fmtEuro(v) },
              ]}
            />
          </Section>
          {g.losses.length > 0 && (
            <Section title={t("Chi perde radio")} note={t("Per chi succede più spesso, valuta una cauzione.")}>
              <Table
                size="small"
                pagination={false}
                dataSource={withKeys(g.losses)}
                columns={[
                  { title: t("Guida"), dataIndex: "name", ellipsis: true },
                  { title: t("Perse"), dataIndex: "lost", align: "right", width: 80 },
                  { title: t("Consegnate"), dataIndex: "radios", align: "right", width: 110, render: (v: number) => fmtNumber(v) },
                ]}
              />
            </Section>
          )}
        </Flex>
      </Col>
    </Row>
  );
}
