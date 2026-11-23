import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Col, Flex, Progress, Row, Typography } from "antd";
import { dayjs, fmtNumber } from "../../../lib/dates";
import type { CapacityDay, DashboardInsights } from "../api";
import { Section } from "./Section";
import { useChartStyle } from "./chartStyle";
import { fmtShare } from "../utils";
import { t } from "../../../i18n";

function DayBars({
  days,
  label,
  highlight,
  tickEvery,
}: {
  days: CapacityDay[];
  label: (d: CapacityDay) => string;
  highlight: string | null;
  tickEvery: number;
}) {
  const s = useChartStyle();
  const rows = days.map((d) => ({ ...d, label: label(d), full: dayjs(d.date).format("dddd D MMMM") }));
  return (
    <ResponsiveContainer>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={s.grid} vertical={false} />
        <XAxis dataKey="label" interval={tickEvery - 1} {...s.axis} />
        <YAxis allowDecimals={false} width={44} {...s.axis} />
        <Tooltip
          cursor={{ fill: s.token.colorFillTertiary }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as (typeof rows)[number];
            return (
              <div style={{ ...s.tooltip, padding: "8px 12px" }}>
                <Typography.Text strong style={{ textTransform: "capitalize" }}>
                  {r.full}
                </Typography.Text>
                <div>{t("Radio fuori insieme: {n}", { n: fmtNumber(r.radios) })}</div>
                <div>{t("Gruppi insieme: {n}", { n: fmtNumber(r.groups) })}</div>
                <div>
                  {t("Consegne {deliveries} · ritiri {pickups}", { deliveries: r.deliveries, pickups: r.pickups })}
                </div>
              </div>
            );
          }}
        />
        <Bar isAnimationActive={false} dataKey="radios" name="Radio" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {rows.map((r) => (
            <Cell key={r.date} fill={r.date === highlight ? s.main : s.quiet} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** How much equipment is out at once: the number that decides how many radios and channels you need. */
export function Capacity({ data }: { data: DashboardInsights }) {
  const { days, upcoming, channels, exclusive } = data.capacity;
  const peak = [...days].sort((a, b) => b.radios - a.radios || b.groups - a.groups)[0];
  const peakUpcoming = [...upcoming].sort((a, b) => b.radios - a.radios)[0];
  const occupancy = channels > 0 && peak ? (peak.groups / channels) * 100 : null;
  const tight = exclusive && occupancy !== null && occupancy >= 80;
  const empty = days.every((d) => d.radios === 0);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Section
          title={t("Radio fuori nello stesso momento")}
          note={
            peak && peak.radios > 0 ? (
              t("Il massimo di ogni giorno. Picco del mese: {radios} radio e {groups} gruppi insieme, {day}.", {
                radios: fmtNumber(peak.radios),
                groups: peak.groups,
                day: dayjs(peak.date).format("dddd D"),
              })
            ) : undefined
          }
          height={250}
          empty={empty}
        >
          <DayBars days={days} label={(d) => dayjs(d.date).format("D")} highlight={peak?.date ?? null} tickEvery={2} />
        </Section>
      </Col>
      <Col xs={24} lg={10}>
        <Section
          title={t("Prossimi 14 giorni")}
          note={
            peakUpcoming && peakUpcoming.radios > 0 ? (
              t("Già prenotato. Il giorno più carico è {day}: {radios} radio.", {
                day: dayjs(peakUpcoming.date).format("dddd D"),
                radios: fmtNumber(peakUpcoming.radios),
              })
            ) : undefined
          }
          height={250}
          empty={upcoming.every((d) => d.radios === 0)}
        >
          <DayBars
            days={upcoming}
            label={(d) => dayjs(d.date).format("dd D")}
            highlight={peakUpcoming?.date ?? null}
            tickEvery={2}
          />
        </Section>
      </Col>
      {exclusive && channels > 0 && peak && peak.groups > 0 && (
        <Col xs={24}>
          <Flex align="center" gap={16} wrap>
            <Typography.Text strong>{t("Canali nel giorno di punta")}</Typography.Text>
            <Progress
              style={{ flex: 1, minWidth: 220, margin: 0 }}
              percent={Math.min(100, Math.round(occupancy ?? 0))}
              strokeColor={tight ? "#d97706" : undefined}
              format={() => fmtShare(occupancy)}
            />
            <Typography.Text type="secondary">
              {t("{groups} gruppi su {channels} canali disponibili", { groups: peak.groups, channels: fmtNumber(channels) })}
            </Typography.Text>
          </Flex>
        </Col>
      )}
    </Row>
  );
}
