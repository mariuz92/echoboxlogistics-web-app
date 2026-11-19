import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Statistic,
  Switch,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  FilePdfOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { dayjs, fmtMoney, getPeriodRange, type Dayjs, type Period } from "../../lib/dates";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { ORDER_STATUSES, ORDER_STATUS_META, type Order, type OrderStatus } from "../../types/domain";
import { needsAssignment } from "./orderActions";
import { useOrders, useOrdersRealtime, usePendingPickups } from "./hooks";
import { OrdersTable } from "./components/OrdersTable";
import { OrderDrawer, type DrawerMode } from "./components/OrderDrawer";
import { OccupiedChannels } from "./components/ChannelBoard";
import { exportOrdersPdf } from "./exportPdf";

const PERIODS: { label: string; value: Period }[] = [
  { label: "Giorno", value: "day" },
  { label: "Settimana", value: "week" },
  { label: "Mese", value: "month" },
  { label: "Anno", value: "year" },
];

const PICKER: Record<Period, "date" | "week" | "month" | "year"> = {
  day: "date",
  week: "week",
  month: "month",
  year: "year",
};

function parseParams(params: URLSearchParams): { date: Dayjs; period: Period } {
  // Legacy links from the calendar used ?month=YYYY-MM
  const month = params.get("month");
  if (month && dayjs(month, "YYYY-MM", true).isValid()) {
    return { date: dayjs(month, "YYYY-MM"), period: "month" };
  }
  const rawDate = params.get("date");
  const date = rawDate && dayjs(rawDate, "YYYY-MM-DD", true).isValid() ? dayjs(rawDate) : dayjs();
  const rawPeriod = params.get("period");
  const period = PERIODS.some((p) => p.value === rawPeriod) ? (rawPeriod as Period) : "day";
  return { date, period };
}

function periodTitle(date: Dayjs, period: Period): string {
  switch (period) {
    case "day":
      return date.format("dddd D MMMM YYYY");
    case "week": {
      const start = date.subtract((date.day() + 6) % 7, "day");
      return `${start.format("D MMM")} – ${start.add(6, "day").format("D MMM YYYY")}`;
    }
    case "month":
      return date.format("MMMM YYYY");
    default:
      return date.format("YYYY");
  }
}

export function OrdersPage() {
  usePageTitle("Ordini");
  const { message } = App.useApp();
  const { timezone } = useReadyUser();
  const [params, setParams] = useSearchParams();
  const { date, period } = useMemo(() => parseParams(params), [params]);
  const range = useMemo(() => getPeriodRange(date, period, timezone), [date, period, timezone]);

  // Show the table spinner on first load and when switching period, but not on background
  // (realtime) refreshes: those would flash a spinner and could close an open row menu.
  const { data: orders = [], isLoading, isPlaceholderData } = useOrders(range);
  const { data: pending = [] } = usePendingPickups();
  useOrdersRealtime();

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const [drawer, setDrawer] = useState<{ open: boolean; mode: DrawerMode; id?: string; snapshot?: Order }>({
    open: false,
    mode: "view",
  });
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  const go = (nextDate: Dayjs, nextPeriod: Period = period) =>
    setParams({ date: nextDate.format("YYYY-MM-DD"), period: nextPeriod });

  const step = (direction: 1 | -1) => go(date.add(direction, period === "week" ? "week" : period));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statuses.length && !statuses.includes(o.status)) return false;
      if (onlyUnassigned && !needsAssignment(o)) return false;
      if (!q) return true;
      return [o.guide_name, o.guide_phone, o.delivery_address, o.pickup_address, o.notes]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [orders, search, statuses, onlyUnassigned]);

  const kpi = useMemo(() => {
    const live = visible.filter((o) => o.status !== "cancelled");
    return {
      orders: live.length,
      radios: live.reduce((sum, o) => sum + o.radios_count + o.extra_radios, 0),
      revenue: live.reduce((sum, o) => sum + Number(o.balance), 0),
      toAssign: live.filter(needsAssignment).length,
      inProgress: live.filter((o) => o.status === "out_for_delivery" || o.status === "out_for_pickup").length,
    };
  }, [visible]);

  // Keep the drawer in sync with realtime updates of the order being shown.
  const drawerOrder = useMemo(
    () => orders.find((o) => o.id === drawer.id) ?? pending.find((o) => o.id === drawer.id) ?? drawer.snapshot,
    [orders, pending, drawer.id, drawer.snapshot],
  );

  const openOrder = (order: Order, mode: DrawerMode) =>
    setDrawer({ open: true, mode, id: order.id, snapshot: order });

  // Pickups that are unscheduled or late, regardless of the visible period.
  const overduePickups = useMemo(
    () => pending.filter((o) => !o.pickup_at || new Date(o.pickup_at).getTime() < Date.now()),
    [pending],
  );

  const onExport = async () => {
    try {
      await exportOrdersPdf(visible, timezone, periodTitle(date, period));
    } catch {
      void message.error("Impossibile generare il PDF.");
    }
  };

  return (
    <>
      <PageHeader
        title="Ordini"
        subtitle={periodTitle(date, period)}
        actions={
          <>
            <Button icon={<AppstoreOutlined />} onClick={() => setChannelsOpen(true)}>
              Canali occupati
            </Button>
            <Button icon={<FilePdfOutlined />} onClick={onExport} disabled={visible.length === 0}>
              Esporta PDF
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setDrawer({ open: true, mode: "create" })}
            >
              Nuovo ordine
            </Button>
          </>
        }
      />

      {overduePickups.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={`${overduePickups.length} ${overduePickups.length === 1 ? "ritiro da pianificare o in ritardo" : "ritiri da pianificare o in ritardo"}`}
          description="Radioguide consegnate che non sono ancora rientrate e senza una data di ritiro valida."
          action={
            <Button size="small" onClick={() => setPendingOpen(true)}>
              Mostra
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={8} xl={4}>
          <Card size="small">
            <Statistic title="Ordini" value={kpi.orders} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small">
            <Statistic title="Radioguide" value={kpi.radios} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small">
            <Statistic title="Incasso" value={fmtMoney(kpi.revenue)} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Da assegnare"
              value={kpi.toAssign}
              styles={{ content: { color: kpi.toAssign > 0 ? "#d97706" : undefined } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small">
            <Statistic title="In corso" value={kpi.inProgress} />
          </Card>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 16 } }}>
        <Flex gap={12} wrap align="center" style={{ marginBottom: 16 }}>
          <Flex gap={4} align="center">
            <Button aria-label="Periodo precedente" icon={<LeftOutlined />} onClick={() => step(-1)} />
            <DatePicker
              allowClear={false}
              picker={PICKER[period]}
              value={date}
              onChange={(value) => value && go(value)}
              format={period === "day" ? "DD/MM/YYYY" : undefined}
              style={{ width: 160 }}
            />
            <Button aria-label="Periodo successivo" icon={<RightOutlined />} onClick={() => step(1)} />
            <Button onClick={() => go(dayjs(), "day")}>Oggi</Button>
          </Flex>

          <Segmented<Period> options={PERIODS} value={period} onChange={(value) => go(date, value)} />

          <Input.Search
            allowClear
            placeholder="Cerca guida, telefono, indirizzo…"
            style={{ width: 280, maxWidth: "100%" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Select<OrderStatus[]>
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            placeholder="Tutti gli stati"
            style={{ minWidth: 200 }}
            value={statuses}
            onChange={setStatuses}
            options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }))}
          />

          <Flex gap={8} align="center">
            <Switch checked={onlyUnassigned} onChange={setOnlyUnassigned} />
            <Typography.Text>Solo da assegnare</Typography.Text>
          </Flex>
        </Flex>

        <OrdersTable
          orders={visible}
          loading={isLoading || isPlaceholderData}
          anchorDay={period === "day" ? date.format("YYYY-MM-DD") : undefined}
          onOpen={openOrder}
        />
      </Card>

      <OrderDrawer
        open={drawer.open}
        mode={drawer.mode}
        order={drawerOrder}
        defaultDate={period === "day" ? date : dayjs()}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        onModeChange={(mode) => setDrawer((d) => ({ ...d, mode }))}
      />

      <OccupiedChannels open={channelsOpen} onClose={() => setChannelsOpen(false)} />

      <Modal
        title="Ritiri da pianificare o in ritardo"
        open={pendingOpen}
        onCancel={() => setPendingOpen(false)}
        footer={null}
        width={1100}
        destroyOnHidden
      >
        <OrdersTable
          orders={overduePickups}
          onOpen={(order, mode) => {
            setPendingOpen(false);
            openOrder(order, mode);
          }}
        />
      </Modal>
    </>
  );
}

export default OrdersPage;
