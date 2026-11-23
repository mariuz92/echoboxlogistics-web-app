import { Typography } from "antd";
import { brand } from "../../../config/theme";
import type { DashboardInsights } from "../api";
import { WEEKDAYS } from "../utils";
import { Section } from "./Section";
import { useChartStyle } from "./chartStyle";

/** Deliveries and pickups by weekday and hour: when riders are needed. */
export function StopsHeatmap({ data }: { data: DashboardInsights["stops"] }) {
  const { token } = useChartStyle();
  const max = Math.max(1, ...data.map((d) => d.count));
  const hours = data.map((d) => d.hour);
  const from = Math.min(7, ...hours);
  const to = Math.max(21, ...hours);
  const range = Array.from({ length: to - from + 1 }, (_, i) => i + from);
  const cell = (weekday: number, hour: number) => data.find((d) => d.weekday === weekday && d.hour === hour)?.count ?? 0;

  return (
    <Section
      title="Quando servono i rider"
      note="Consegne e ritiri per giorno della settimana e ora. Più scuro, più lavoro."
      empty={data.length === 0}
    >
      <div style={{ overflowX: "auto" }}>
        <div
          role="img"
          aria-label="Mappa del carico di lavoro per giorno e ora"
          style={{ display: "grid", gridTemplateColumns: `44px repeat(${range.length}, minmax(26px, 1fr))`, gap: 3, minWidth: 520 }}
        >
          <span />
          {range.map((h) => (
            <Typography.Text key={h} type="secondary" style={{ fontSize: 11, textAlign: "center" }}>
              {h}
            </Typography.Text>
          ))}
          {WEEKDAYS.map((label, i) => (
            <div key={label} style={{ display: "contents" }}>
              <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: "26px" }}>
                {label}
              </Typography.Text>
              {range.map((h) => {
                const count = cell(i + 1, h);
                return (
                  <div
                    key={h}
                    title={`${label} ${h}:00 · ${count} ${count === 1 ? "spostamento" : "spostamenti"}`}
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
    </Section>
  );
}
