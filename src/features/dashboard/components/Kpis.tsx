import { Card, Col, Row, Statistic, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { fmtMoney, fmtNumber } from "../../../lib/dates";
import type { DashboardInsights } from "../api";
import { dec1, avgRadiosPerOrder, fmtEuro, fmtShare, formatPct, lossRate, pctChange, punctuality, revenuePerRadio } from "../utils";
import { t } from "../../../i18n";

function Kpi({
  title,
  value,
  delta,
  deltaLabel,
  invert,
  points,
  hint,
}: {
  title: string;
  value: string;
  /** change against the comparison period (null: no baseline) */
  delta?: number | null;
  deltaLabel?: string;
  /** a rise is bad news (lost radios) */
  invert?: boolean;
  /** the change is in percentage points, not percent */
  points?: boolean;
  hint?: string;
}) {
  const good = delta === undefined || delta === null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <Card size="small" style={{ height: "100%" }}>
      <Statistic title={title} value={value} />
      {delta !== undefined && (
        <Typography.Text
          style={{ fontSize: 13, color: good === null ? undefined : good ? "#16a34a" : "#dc2626" }}
          type={delta === null ? "secondary" : undefined}
        >
          {delta !== null && (delta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />)}{" "}
          {points && delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")} pt` : formatPct(delta)}{" "}
          <Typography.Text type="secondary">{deltaLabel}</Typography.Text>
        </Typography.Text>
      )}
      {hint && (
        <Typography.Text type="secondary" style={{ fontSize: 13, display: "block" }}>
          {hint}
        </Typography.Text>
      )}
    </Card>
  );
}

export function Kpis({ data }: { data: DashboardInsights }) {
  const { current: c, previous: p } = data;
  const vs = data.in_progress ? t("vs stessi giorni del mese scorso") : t("vs mese precedente");
  const rpr = revenuePerRadio(c);
  const rprPrev = revenuePerRadio(p);
  const avg = c.orders > 0 ? c.revenue / c.orders : 0;
  const avgPrev = p.orders > 0 ? p.revenue / p.orders : 0;
  const onTime = punctuality(c);
  const onTimePrev = punctuality(p);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={8}>
        <Kpi title={t("Incasso")} value={fmtEuro(c.revenue)} delta={pctChange(c.revenue, p.revenue)} deltaLabel={vs} />
      </Col>
      <Col xs={24} sm={12} xl={8}>
        <Kpi
          title={t("Ordini")}
          value={fmtNumber(c.orders)}
          delta={pctChange(c.orders, p.orders)}
          deltaLabel={vs}
          hint={t("{radios} radio · {avg} per gruppo", { radios: fmtNumber(c.radios), avg: dec1(avgRadiosPerOrder(c) ?? 0) })}
        />
      </Col>
      <Col xs={24} sm={12} xl={8}>
        <Kpi title={t("Valore medio ordine")} value={fmtMoney(avg)} delta={pctChange(avg, avgPrev)} deltaLabel={vs} />
      </Col>
      <Col xs={24} sm={12} xl={8}>
        <Kpi
          title={t("Incasso per radio")}
          value={rpr === null ? t("n/d") : fmtMoney(rpr)}
          delta={rpr !== null && rprPrev !== null ? pctChange(rpr, rprPrev) : null}
          deltaLabel={vs}
          hint={t("Quanto rende ogni radio consegnata")}
        />
      </Col>
      <Col xs={24} sm={12} xl={8}>
        <Kpi
          title={t("Consegne puntuali")}
          value={fmtShare(onTime)}
          delta={onTime !== null && onTimePrev !== null ? onTime - onTimePrev : undefined}
          deltaLabel={vs}
          points
          hint={t("Entro 10 minuti dall'orario concordato")}
        />
      </Col>
      <Col xs={24} sm={12} xl={8}>
        <Kpi
          title={t("Radio perse")}
          value={fmtNumber(c.lost)}
          invert
          delta={pctChange(c.lost, p.lost)}
          deltaLabel={vs}
          hint={t("{pct}% delle radio consegnate", { pct: dec1(lossRate(c.lost, c.radios)) })}
        />
      </Col>
    </Row>
  );
}
