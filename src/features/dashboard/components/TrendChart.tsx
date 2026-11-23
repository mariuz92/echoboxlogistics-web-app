import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented, Typography } from "antd";
import { dayjs, fmtNumber } from "../../../lib/dates";
import { fmtEuro } from "../utils";
import type { DashboardInsights } from "../api";
import { Section } from "./Section";
import { useChartStyle } from "./chartStyle";

type Metric = "revenue" | "orders" | "radios";
const METRICS: { value: Metric; label: string }[] = [
  { value: "revenue", label: "Incasso" },
  { value: "orders", label: "Ordini" },
  { value: "radios", label: "Radio" },
];
const fmt = (metric: Metric, v: number) => (metric === "revenue" ? fmtEuro(v) : fmtNumber(v));

/** Twelve months, one metric at a time: seasonality and growth at a glance. */
export function TrendChart({ data }: { data: DashboardInsights }) {
  const s = useChartStyle();
  const [metric, setMetric] = useState<Metric>("revenue");

  const rows = data.trend.map((m) => {
    const d = dayjs(`${m.month}-01`);
    return {
      ...m,
      label: d.format(d.month() === 0 ? "MMM YY" : "MMM"),
      full: d.format("MMMM YYYY"),
      current: m.month === data.month,
    };
  });
  // average of the complete months, the line a month should be read against
  const complete = rows.filter((r) => !(r.current && data.in_progress) && r[metric] > 0);
  const average = complete.length ? complete.reduce((acc, r) => acc + r[metric], 0) / complete.length : null;

  return (
    <Section
      title="Gli ultimi 12 mesi"
      note="Il mese scelto è in evidenza; la linea è la media dei mesi completi."
      extra={<Segmented size="small" options={METRICS} value={metric} onChange={(v) => setMetric(v as Metric)} />}
      height={280}
      empty={rows.every((r) => r.orders === 0)}
    >
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={s.grid} vertical={false} />
          <XAxis dataKey="label" {...s.axis} />
          <YAxis
            {...s.axis}
            width={52}
            allowDecimals={false}
            tickFormatter={(v) => (metric === "revenue" ? `€${v >= 1000 ? `${Math.round(v / 1000)}k` : v}` : fmtNumber(v))}
          />
          <Tooltip
            cursor={{ fill: s.token.colorFillTertiary }}
            contentStyle={s.tooltip}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <div style={{ ...s.tooltip, padding: "8px 12px" }}>
                  <Typography.Text strong style={{ textTransform: "capitalize" }}>
                    {r.full}
                    {r.current && data.in_progress ? " (in corso)" : ""}
                  </Typography.Text>
                  <div>Incasso: {fmtEuro(r.revenue)}</div>
                  <div>Ordini: {fmtNumber(r.orders)}</div>
                  <div>Radio: {fmtNumber(r.radios)}</div>
                </div>
              );
            }}
          />
          {average !== null && <ReferenceLine y={average} stroke={s.token.colorTextTertiary} strokeDasharray="4 4" />}
          <Bar isAnimationActive={false} dataKey={metric} name={METRICS.find((m) => m.value === metric)!.label} radius={[4, 4, 0, 0]} maxBarSize={36}>
            {rows.map((r) => (
              <Cell key={r.month} fill={r.current ? s.main : s.quiet} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {average !== null ? `Media mensile: ${fmt(metric, average)}` : ""}
        {data.in_progress ? " · il mese in corso è parziale" : ""}
      </Typography.Text>
    </Section>
  );
}
