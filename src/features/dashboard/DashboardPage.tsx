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

/** Shows or hides one of the explanatory panels. */
function PanelToggle({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <Button size="small" shape="round" type={on ? "primary" : "default"} aria-pressed={on} onClick={() => onChange(!on)}>
      {children}
    </Button>
  );
}

export function DashboardPage() {
  usePageTitle("Dashboard");
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
        title="Dashboard"
        subtitle="Cosa sta succedendo e cosa conviene decidere: incassi, radio, rider e clienti"
        actions={
          <Flex gap={4} wrap>
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
          <Flex gap={8} wrap align="center">
            <Typography.Text type="secondary">Note:</Typography.Text>
            {alertCount > 0 && (
              <PanelToggle on={panels.isOpen("alerts")} onChange={(v) => panels.setOpen("alerts", v)}>
                Da gestire ora ({alertCount})
              </PanelToggle>
            )}
            <PanelToggle on={panels.isOpen("digest")} onChange={(v) => panels.setOpen("digest", v)}>
              In breve
            </PanelToggle>
            {data.in_progress && (
              <PanelToggle on={panels.isOpen("note")} onChange={(v) => panels.setOpen("note", v)}>
                Mese in corso
              </PanelToggle>
            )}
          </Flex>

          {data.in_progress && panels.isOpen("note") && (
            <Alert
              type="info"
              showIcon
              closable={{ onClose: () => panels.setOpen("note", false), "aria-label": "Nascondi Mese in corso" }}
              title={`Mese in corso: i dati arrivano fino al ${dayjs(data.through).format("D MMMM")} e sono confrontati con gli stessi giorni del mese scorso.`}
              description={
                data.booked_ahead.orders > 0
                  ? `Già prenotati nei giorni che restano: ${fmtNumber(data.booked_ahead.orders)} ordini, ${fmtNumber(data.booked_ahead.radios)} radio, ${fmtEuro(data.booked_ahead.revenue)}.`
                  : undefined
              }
            />
          )}

          {panels.isOpen("alerts") && <Alerts alerts={data.alerts} onClose={() => panels.setOpen("alerts", false)} />}
          {panels.isOpen("digest") && <Digest insights={insights} onClose={() => panels.setOpen("digest", false)} />}

          <GroupTitle>Come va il lavoro</GroupTitle>
          <Kpis data={data} />
          <TrendChart data={data} />

          <GroupTitle>Quante radio e quanti rider servono</GroupTitle>
          <Capacity data={data} />
          <StopsHeatmap data={data.stops} />

          <GroupTitle>I clienti</GroupTitle>
          <Guides data={data} />

          <GroupTitle>Come lavori</GroupTitle>
          <Operations data={data} />

          <GroupTitle>Dove</GroupTitle>
          <Locations data={data} />
        </Flex>
      )}
    </>
  );
}

export default DashboardPage;
