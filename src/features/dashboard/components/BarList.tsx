import { Typography } from "antd";
import { brand } from "../../../config/theme";
import { useChartStyle } from "./chartStyle";

export interface BarItem {
  label: string;
  value: number;
  /** text at the end of the row */
  text: string;
  /** small text under the label */
  hint?: string;
}

/** Horizontal bars as a list: names stay readable, bars are thin, values are printed. */
export function BarList({ items, ariaLabel }: { items: BarItem[]; ariaLabel: string }) {
  const { token } = useChartStyle();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={ariaLabel} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
      {items.map((i, n) => (
        <li key={`${n}-${i.label}`}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
            <Typography.Text ellipsis style={{ minWidth: 0 }}>
              {i.label}
              {i.hint && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {" "}
                  · {i.hint}
                </Typography.Text>
              )}
            </Typography.Text>
            <Typography.Text strong style={{ whiteSpace: "nowrap" }}>
              {i.text}
            </Typography.Text>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: token.colorFillQuaternary }}>
            <div style={{ width: `${(i.value / max) * 100}%`, height: "100%", borderRadius: 4, background: brand.primary }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
