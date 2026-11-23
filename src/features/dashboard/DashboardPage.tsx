import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Flex, Typography } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { dayjs, fmtNumber, type Dayjs } from "../../lib/dates";
import { getErrorMessage } from "../../lib/errors";
import { PageHeader } from "../../shared/components/PageHeader";
import { SectionSpinner } from "../../shared/components/Screens";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { getDashboardInsights } from "./api";
import { Alerts, alertItems } from "./components/Alerts";
import { Capacity } from "./components/Capacity";
import { Digest } from "./components/Digest";
import { Guides } from "./components/Guides";
import { Kpis } from "./components/Kpis";
import { Locations } from "./components/Locations";
import { Operations } from "./components/Operations";
import { GroupTitle } from "./components/Section";
import { StopsHeatmap } from "./components/StopsHeatmap";
import { TrendChart } from "./components/TrendChart";
import { usePanels } from "./usePanels";
import { buildInsights, fmtEuro } from "./utils";
import { t } from "../../i18n";

/** Shows or hides one of the explanatory panels. */
function PanelToggle({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <Button size="small" shape="round" type={on ? "primary" : "default"} aria-pressed={on} onClick={() => onChange(!on)}>
      {children}
    </Button>
  );
}

export function DashboardPage() {
  usePageTitle(t("Dashboard"));
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", month.format("YYYY-MM")],
    queryFn: () => getDashboardInsights(month),
  });
  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const panels = usePanels();
  const alertCount = data ? alertItems(data.alerts).length : 0;

  return (
    <>
      <PageHeader
        title={t("Dashboard")}
        subtitle={t("Cosa sta succedendo e cosa conviene decidere: incassi, radio, rider e clienti")}
        actions={
          <Flex gap={4} wrap>
            <Button aria-label={t("Mese precedente")} icon={<LeftOutlined />} onClick={() => setMonth((m) => m.subtract(1, "month"))} />
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(v) => v && setMonth(v.startOf("month"))}
              format="MMMM YYYY"
              style={{ width: 170 }}
            />
            <Button aria-label={t("Mese successivo")} icon={<RightOutlined />} onClick={() => setMonth((m) => m.add(1, "month"))} />
            <Button onClick={() => setMonth(dayjs().startOf("month"))}>{t("Questo mese")}</Button>
          </Flex>
        }
      />

      {error && <Alert type="error" showIcon title={getErrorMessage(error)} style={{ marginBottom: 16 }} />}
      {isLoading && <SectionSpinner />}

      {data && (
        <Flex vertical gap={16}>
          <Flex gap={8} wrap align="center">
            <Typography.Text type="secondary">{t("Note:")}</Typography.Text>
            {alertCount > 0 && (
              <PanelToggle on={panels.isOpen("alerts")} onChange={(v) => panels.setOpen("alerts", v)}>
                {t("Da gestire ora (")}{alertCount})
              </PanelToggle>
            )}
            <PanelToggle on={panels.isOpen("digest")} onChange={(v) => panels.setOpen("digest", v)}>
              {t("In breve")}
            </PanelToggle>
            {data.in_progress && (
              <PanelToggle on={panels.isOpen("note")} onChange={(v) => panels.setOpen("note", v)}>
                {t("Mese in corso")}
              </PanelToggle>
            )}
          </Flex>

          {data.in_progress && panels.isOpen("note") && (
            <Alert
              type="info"
              showIcon
              closable={{ onClose: () => panels.setOpen("note", false), "aria-label": t("Nascondi Mese in corso") }}
              title={t("Mese in corso: i dati arrivano fino al {date} e sono confrontati con gli stessi giorni del mese scorso.", { date: dayjs(data.through).format("D MMMM") })}
              description={
                data.booked_ahead.orders > 0
                  ? t("Già prenotati nei giorni che restano: {orders} ordini, {radios} radio, {revenue}.", { orders: fmtNumber(data.booked_ahead.orders), radios: fmtNumber(data.booked_ahead.radios), revenue: fmtEuro(data.booked_ahead.revenue) })
                  : undefined
              }
            />
          )}

          {panels.isOpen("alerts") && <Alerts alerts={data.alerts} onClose={() => panels.setOpen("alerts", false)} />}
          {panels.isOpen("digest") && <Digest insights={insights} onClose={() => panels.setOpen("digest", false)} />}

          <GroupTitle>{t("Come va il lavoro")}</GroupTitle>
          <Kpis data={data} />
          <TrendChart data={data} />

          <GroupTitle>{t("Quante radio e quanti rider servono")}</GroupTitle>
          <Capacity data={data} />
          <StopsHeatmap data={data.stops} />

          <GroupTitle>{t("I clienti")}</GroupTitle>
          <Guides data={data} />

          <GroupTitle>{t("Come lavori")}</GroupTitle>
          <Operations data={data} />

          <GroupTitle>{t("Dove")}</GroupTitle>
          <Locations data={data} />
        </Flex>
      )}
    </>
  );
}

export default DashboardPage;
