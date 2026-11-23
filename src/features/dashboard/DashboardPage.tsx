import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Flex } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { dayjs, fmtNumber, type Dayjs } from "../../lib/dates";
import { getErrorMessage } from "../../lib/errors";
import { PageHeader } from "../../shared/components/PageHeader";
import { SectionSpinner } from "../../shared/components/Screens";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { getDashboardInsights } from "./api";
import { Alerts } from "./components/Alerts";
import { Capacity } from "./components/Capacity";
import { Digest } from "./components/Digest";
import { Guides } from "./components/Guides";
import { Kpis } from "./components/Kpis";
import { Locations } from "./components/Locations";
import { Operations } from "./components/Operations";
import { GroupTitle } from "./components/Section";
import { StopsHeatmap } from "./components/StopsHeatmap";
import { TrendChart } from "./components/TrendChart";
import { buildInsights, fmtEuro } from "./utils";

export function DashboardPage() {
  usePageTitle("Dashboard");
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", month.format("YYYY-MM")],
    queryFn: () => getDashboardInsights(month),
  });
  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);

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
          {data.in_progress && (
            <Alert
              type="info"
              showIcon
              title={`Mese in corso: i dati arrivano fino al ${dayjs(data.through).format("D MMMM")} e sono confrontati con gli stessi giorni del mese scorso.`}
              description={
                data.booked_ahead.orders > 0
                  ? `Già prenotati nei giorni che restano: ${fmtNumber(data.booked_ahead.orders)} ordini, ${fmtNumber(data.booked_ahead.radios)} radio, ${fmtEuro(data.booked_ahead.revenue)}.`
                  : undefined
              }
            />
          )}

          <Alerts alerts={data.alerts} />
          <Digest insights={insights} />

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
