import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, DatePicker, Empty, Flex, Row, Statistic, Table, Typography, theme as antdTheme } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dayjs, fmtMoney, fmtNumber, type Dayjs } from "../../lib/dates";
import { getErrorMessage } from "../../lib/errors";
import { brand } from "../../config/theme";
import { PageHeader } from "../../shared/components/PageHeader";
import { SectionSpinner } from "../../shared/components/Screens";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { ORDER_STATUS_META } from "../../types/domain";
import { getDashboardStats, type DashboardStats } from "./api";
import { WEEKDAYS, formatPct, lossRate, pctChange } from "./utils";

function Kpi({
  title,
  value,
  delta,
  hint,
  tone,
}: {
  title: string;
  value: string;
  delta?: number | null;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card size="small" style={{ height: "100%" }}>
      <Statistic
        title={title}
        value={value}
        styles={{ content: { color: tone === "bad" ? "#dc2626" : tone === "good" ? "#16a34a" : undefined } }}
      />
      {delta !== undefined && (
        <Typography.Text
          style={{ fontSize: 13, color: delta === null ? undefined : delta >= 0 ? "#16a34a" : "#dc2626" }}
          type={delta === null ? "secondary" : undefined}
        >
          {delta !== null && (delta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />)} {formatPct(delta)}{" "}
          <Typography.Text type="secondary">vs mese precedente</Typography.Text>
        </Typography.Text>
      )}
      {hint && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {hint}
        </Typography.Text>
      )}
    </Card>
  );
}

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card title={title} size="small" style={{ height: "100%" }}>
      <div style={{ width: "100%", height: 280 }}>
        {empty ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nessun dato nel periodo" /> : children}
      </div>
    </Card>
  );
}

function Heatmap({ data }: { data: DashboardStats["heatmap"] }) {
  const { token } = antdTheme.useToken();
  const max = Math.max(1, ...data.map((d) => d.count));
  const cell = (weekday: number, hour: number) => data.find((d) => d.weekday === weekday && d.hour === hour)?.count ?? 0;
  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 07–21

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `44px repeat(${hours.length}, minmax(26px, 1fr))`, gap: 3, minWidth: 520 }}>
        <span />
        {hours.map((h) => (
          <Typography.Text key={h} type="secondary" style={{ fontSize: 11, textAlign: "center" }}>
            {h}
          </Typography.Text>
        ))}
        {WEEKDAYS.map((label, i) => (
          <div key={label} style={{ display: "contents" }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: "26px" }}>
              {label}
            </Typography.Text>
            {hours.map((h) => {
              const count = cell(i + 1, h);
              return (
                <div
                  key={h}
                  title={`${label} ${h}:00 · ${count} consegne`}
                  style={{
                    height: 26,
                    borderRadius: 5,
                    background: count
                      ? `color-mix(in srgb, ${brand.primary} ${Math.max(14, (count / max) * 100)}%, transparent)`
                      : token.colorFillQuaternary,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  usePageTitle("Dashboard");
  const { token } = antdTheme.useToken();
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", month.format("YYYY-MM")],
    queryFn: () => getDashboardStats(month),
  });

  const axis = { stroke: token.colorTextTertiary, fontSize: 12 } as const;
  const grid = token.colorBorderSecondary;
  const tooltipStyle = {
    background: token.colorBgElevated,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 8,
    color: token.colorText,
  };

  const daily = useMemo(
    () => (data?.daily ?? []).map((d) => ({ ...d, label: d.date.slice(8), revenue: Number(d.revenue) })),
    [data],
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Andamento mensile di ordini, incassi e utilizzo delle radioguide"
        actions={
          <Flex gap={4}>
            <Button aria-label="Mese precedente" icon={<LeftOutlined />} onClick={() => setMonth((m) => m.subtract(1, "month"))} />
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(v) => v && setMonth(v.startOf("month"))}
              format="MMMM YYYY"
              style={{ width: 170 }}
            />
            <Button aria-label="Mese successivo" icon={<RightOutlined />} onClick={() => setMonth((m) => m.add(1, "month"))} />
            <Button onClick={() => setMonth(dayjs().startOf("month"))}>Questo mese</Button>
          </Flex>
        }
      />

      {error && <Alert type="error" showIcon title={getErrorMessage(error)} style={{ marginBottom: 16 }} />}
      {isLoading && <SectionSpinner />}

      {data && (
        <Flex vertical gap={16}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} xl={6}>
              <Kpi
                title="Incasso"
                value={fmtMoney(Number(data.current.revenue))}
                delta={pctChange(Number(data.current.revenue), Number(data.previous.revenue))}
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Kpi title="Ordini" value={fmtNumber(data.current.orders)} delta={pctChange(data.current.orders, data.previous.orders)} />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Kpi
                title="Valore medio ordine"
                value={fmtMoney(Number(data.current.avg_order_value))}
                hint={`${data.current.cancelled} annullati (esclusi dai totali)`}
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Kpi
                title="Radioguide consegnate"
                value={fmtNumber(data.current.radios)}
                hint={`+ ${data.current.extras} extra`}
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Kpi
                title="Radioguide perse"
                value={fmtNumber(data.current.lost)}
                hint={`Tasso di perdita ${lossRate(data.current.lost, data.current.radios).toFixed(1).replace(".", ",")}%`}
                tone={data.current.lost > 0 ? "bad" : "good"}
              />
            </Col>
          </Row>

          <ChartCard title="Consegne, ritiri e incasso per giorno" empty={daily.length === 0}>
            <ResponsiveContainer>
              <ComposedChart data={daily}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis yAxisId="left" allowDecimals={false} {...axis} />
                <YAxis yAxisId="right" orientation="right" {...axis} tickFormatter={(v) => `€${v}`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => (name === "Incasso" ? fmtMoney(Number(v)) : v)} />
                <Legend />
                <Bar isAnimationActive={false} yAxisId="left" dataKey="deliveries" name="Consegne" fill={brand.primary} radius={[4, 4, 0, 0]} />
                <Bar isAnimationActive={false} yAxisId="left" dataKey="pickups" name="Ritiri" fill={brand.coral} radius={[4, 4, 0, 0]} />
                <Line isAnimationActive={false} yAxisId="right" dataKey="revenue" name="Incasso" stroke="#16a34a" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10}>
              <ChartCard title="Stato degli ordini" empty={data.status_distribution.length === 0}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={data.status_distribution.map((s) => ({ ...s, name: ORDER_STATUS_META[s.status].label }))}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {data.status_distribution.map((s) => (
                        <Cell key={s.status} fill={ORDER_STATUS_META[s.status].hex} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </Col>
            <Col xs={24} lg={14}>
              <ChartCard title="Ordini per settimana" empty={data.weekly.length === 0}>
                <ResponsiveContainer>
                  <AreaChart data={data.weekly.map((w) => ({ ...w, label: dayjs(w.week_start).format("D MMM") }))}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis allowDecimals={false} {...axis} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area isAnimationActive={false} dataKey="orders" name="Ordini" stroke={brand.primary} fill={brand.primary} fillOpacity={0.18} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <ChartCard title="Orari di consegna e ritiro" empty={data.hourly.every((h) => h.deliveries + h.pickups === 0)}>
                <ResponsiveContainer>
                  <BarChart data={data.hourly.map((h) => ({ ...h, label: `${h.hour}:00` }))}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="label" interval={1} {...axis} />
                    <YAxis allowDecimals={false} {...axis} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar isAnimationActive={false} dataKey="deliveries" name="Consegne" fill={brand.primary} radius={[4, 4, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="pickups" name="Ritiri" fill={brand.coral} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Col>
            <Col xs={24} lg={10}>
              <ChartCard title="Utilizzo canali radio" empty={data.channels.length === 0}>
                <ResponsiveContainer>
                  <BarChart data={data.channels.map((c) => ({ ...c, label: String(c.channel) }))}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis allowDecimals={false} {...axis} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar isAnimationActive={false} dataKey="orders" name="Ordini" fill={brand.wave} stroke={brand.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Col>
          </Row>

          <Card title="Quando si consegna (giorno × ora)" size="small">
            {data.heatmap.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nessun dato nel periodo" /> : <Heatmap data={data.heatmap} />}
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Top guide" size="small">
                <Table
                  size="small"
                  rowKey="name"
                  pagination={false}
                  dataSource={data.top_guides}
                  locale={{ emptyText: "Nessun dato" }}
                  columns={[
                    { title: "Guida", dataIndex: "name" },
                    { title: "Ordini", dataIndex: "orders", align: "right" },
                    { title: "Radio", dataIndex: "radios", align: "right" },
                    { title: "Incasso", dataIndex: "revenue", align: "right", render: (v: number) => fmtMoney(Number(v)) },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Luoghi di consegna più frequenti" size="small">
                <Table
                  size="small"
                  rowKey="location"
                  pagination={false}
                  dataSource={data.top_locations}
                  locale={{ emptyText: "Nessun dato" }}
                  columns={[
                    { title: "Luogo", dataIndex: "location", ellipsis: true },
                    { title: "Ordini", dataIndex: "orders", align: "right", width: 90 },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </Flex>
      )}
    </>
  );
}

export default DashboardPage;
