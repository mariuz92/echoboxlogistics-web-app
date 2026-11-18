import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Calendar, Card, Flex, Tag, Tooltip, type CalendarProps } from "antd";
import itIT from "antd/es/calendar/locale/it_IT";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { dayjs, fmtMoney, getPeriodRange, type Dayjs } from "../../lib/dates";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { listOrders } from "../orders/api";
import { useOrdersRealtime } from "../orders/hooks";

interface DayStats {
  deliveries: number;
  pickups: number;
  revenue: number;
  radios: number;
}

const empty = (): DayStats => ({ deliveries: 0, pickups: 0, revenue: 0, radios: 0 });

export function CalendarPage() {
  usePageTitle("Calendario");
  const navigate = useNavigate();
  const { timezone } = useReadyUser();
  const [month, setMonth] = useState<Dayjs>(dayjs());
  useOrdersRealtime();

  // The grid shows a few days of the neighbouring months: load a week on each side.
  const range = useMemo(() => {
    const r = getPeriodRange(month, "month", timezone);
    return {
      from: dayjs(r.from).subtract(7, "day").toISOString(),
      to: dayjs(r.to).add(7, "day").toISOString(),
    };
  }, [month, timezone]);

  const { data: orders = [], isFetching, refetch } = useQuery({
    queryKey: ["orders", "calendar", range.from, range.to],
    queryFn: () => listOrders(range),
  });

  const { days, months } = useMemo(() => {
    const days = new Map<string, DayStats>();
    const months = new Map<string, DayStats>();
    const bump = (map: Map<string, DayStats>, key: string, fn: (s: DayStats) => void) => {
      const s = map.get(key) ?? empty();
      fn(s);
      map.set(key, s);
    };

    for (const order of orders) {
      if (order.status === "cancelled") continue;
      const delivery = dayjs(order.delivery_at).tz(timezone);
      const radios = order.radios_count + order.extra_radios;
      for (const [map, key] of [
        [days, delivery.format("YYYY-MM-DD")],
        [months, delivery.format("YYYY-MM")],
      ] as const) {
        bump(map, key, (s) => {
          s.deliveries += 1;
          s.revenue += Number(order.balance);
          s.radios += radios;
        });
      }
      if (order.pickup_at) {
        const pickup = dayjs(order.pickup_at).tz(timezone);
        bump(days, pickup.format("YYYY-MM-DD"), (s) => (s.pickups += 1));
        bump(months, pickup.format("YYYY-MM"), (s) => (s.pickups += 1));
      }
    }
    return { days, months };
  }, [orders, timezone]);

  const exportCsv = () => {
    const rows = [["Data", "Consegne", "Ritiri", "Incasso (EUR)", "Radioguide consegnate"]];
    [...days.entries()]
      .filter(([date]) => date.startsWith(month.format("YYYY-MM")))
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, s]) => rows.push([date, String(s.deliveries), String(s.pickups), s.revenue.toFixed(2), String(s.radios)]));

    const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario_${month.format("YYYY-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellRender: CalendarProps<Dayjs>["cellRender"] = (current, info) => {
    if (info.type === "date") {
      const s = days.get(current.format("YYYY-MM-DD"));
      if (!s) return null;
      return (
        <Flex vertical gap={3} style={{ marginTop: 4 }}>
          {s.deliveries > 0 && (
            <Tag color="blue" variant="filled" style={{ margin: 0 }}>
              {s.deliveries} consegn{s.deliveries === 1 ? "a" : "e"}
            </Tag>
          )}
          {s.pickups > 0 && (
            <Tag color="purple" variant="filled" style={{ margin: 0 }}>
              {s.pickups} ritir{s.pickups === 1 ? "o" : "i"}
            </Tag>
          )}
        </Flex>
      );
    }
    if (info.type === "month") {
      const s = months.get(current.format("YYYY-MM"));
      if (!s) return null;
      return (
        <Tooltip title={`${s.radios} radioguide`}>
          <Flex vertical align="center" gap={2}>
            <Tag color="geekblue" variant="filled">
              {s.deliveries} ordini
            </Tag>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{fmtMoney(s.revenue)}</span>
          </Flex>
        </Tooltip>
      );
    }
    return info.originNode;
  };

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle="Consegne e ritiri del mese. Clicca un giorno per vederne gli ordini."
        actions={
          <>
            <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>
              Aggiorna
            </Button>
            <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={days.size === 0}>
              Esporta CSV
            </Button>
          </>
        }
      />
      <Card styles={{ body: { padding: 8 } }}>
        <Calendar
          locale={itIT}
          value={month}
          cellRender={cellRender}
          onPanelChange={(date) => setMonth(date)}
          onSelect={(date, { source }) => {
            if (source === "date") navigate(`/?date=${date.format("YYYY-MM-DD")}&period=day`);
            if (source === "month") navigate(`/?date=${date.startOf("month").format("YYYY-MM-DD")}&period=month`);
          }}
        />
      </Card>
    </>
  );
}

export default CalendarPage;
