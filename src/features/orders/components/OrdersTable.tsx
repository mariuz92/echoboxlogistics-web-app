import { useMemo } from "react";
import { useNavigate } from "react-router";
import { App, Badge, Button, Dropdown, Flex, Table, Tag, Tooltip, Typography, type MenuProps, type TableProps } from "antd";
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  GlobalOutlined,
  MoreOutlined,
  SwapOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { fmtDateTime, fmtMoney, fmtTime, dayjs } from "../../../lib/dates";
import { StatusTag } from "../../../shared/components/StatusTag";
import { useReadyUser } from "../../../providers/current-user";
import {
  getAssignBlocker,
  getAssignableLeg,
  ORDER_STATUS_FLOW,
  type Order,
  type OrderLeg,
} from "../../../types/domain";
import { getStatusActions, isPickupOverdue, needsAssignment } from "../orderActions";
import { useMembers, useOrderMutations, useRiderActivity } from "../hooks";
import type { DrawerMode } from "./OrderDrawer";
import { numberLocale, t, tn } from "../../../i18n";

/** Submenu titles bubble to the table row (which opens the details drawer): stop them. */
const stopTitleClick = ({ domEvent }: { domEvent: React.SyntheticEvent }) => domEvent.stopPropagation();

interface OrdersTableProps {
  orders: Order[];
  loading?: boolean;
  /** Anchor day: times on other days also show the date. */
  anchorDay?: string;
  onOpen: (order: Order, mode: DrawerMode) => void;
}

export function OrdersTable({ orders, loading, anchorDay, onOpen }: OrdersTableProps) {
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const { timezone } = useReadyUser();
  const { data: members = [] } = useMembers();
  const { data: activity = [] } = useRiderActivity();
  const { assign, setStatus, remove } = useOrderMutations();

  const riders = useMemo(
    () => members.filter((m) => m.roles.includes("rider") && !m.disabled),
    [members],
  );
  const busyRiders = useMemo(
    () => new Set(activity.filter((a) => a.is_busy).map((a) => a.rider_id)),
    [activity],
  );

  const when = (iso: string | null) => {
    if (!iso) return null;
    const sameDay = anchorDay && dayjs(iso).tz(timezone).format("YYYY-MM-DD") === anchorDay;
    return sameDay ? fmtTime(iso, timezone) : fmtDateTime(iso, timezone);
  };

  const runAssign = (order: Order, leg: OrderLeg, riderId: string | null, riderName?: string) => {
    assign.mutate(
      { orderId: order.id, leg, riderId },
      {
        onSuccess: () =>
          void message.success(
            riderId
              ? leg === "delivery" ? t("Consegna assegnata a {name}", { name: riderName ?? "" }) : t("Ritiro assegnato a {name}", { name: riderName ?? "" })
              : t("Assegnazione rimossa"),
          ),
      },
    );
  };

  const handleAssign = (order: Order, riderId: string | null) => {
    const leg = getAssignableLeg(order);
    if (!leg) return;

    if (riderId && getAssignBlocker(order) === "pickup_details_missing") {
      modal.confirm({
        title: t("Ritiro non pianificato"),
        content: t("Imposta data/ora e luogo del ritiro prima di assegnare un rider. Vuoi modificare l'ordine ora?"),
        okText: t("Modifica ordine"),
        cancelText: t("Annulla"),
        onOk: () => onOpen(order, "edit"),
      });
      return;
    }

    const rider = riders.find((r) => r.id === riderId);
    const current = leg === "delivery" ? order.delivery_rider : order.pickup_rider;
    if (riderId && current && current.id !== riderId) {
      modal.confirm({
        title: t("Riassegnare l'ordine?"),
        content: t("Al momento è assegnato a {current}. Vuoi passarlo a {next}?", { current: current.full_name, next: rider?.full_name ?? "" }),
        okText: t("Riassegna"),
        cancelText: t("Annulla"),
        onOk: () => runAssign(order, leg, riderId, rider?.full_name),
      });
      return;
    }
    if (riderId && current?.id === riderId) {
      void message.info(t("Già assegnato a {name}", { name: current.full_name }));
      return;
    }
    runAssign(order, leg, riderId, rider?.full_name);
  };

  const confirmDelete = (order: Order) =>
    modal.confirm({
      title: t("Eliminare definitivamente l'ordine?"),
      content: t("{summary}. L'operazione non può essere annullata. Per tenere traccia dell'ordine usa \"Annulla ordine\".", { summary: `${order.guide_name} · ${fmtDateTime(order.delivery_at, timezone)}` }),
      okText: t("Elimina"),
      okButtonProps: { danger: true },
      cancelText: t("Indietro"),
      onOk: () =>
        remove.mutateAsync(order.id).then(() => void message.success(t("Ordine eliminato"))),
    });

  const menuFor = (order: Order): MenuProps["items"] => {
    const leg = getAssignableLeg(order);
    const currentRider = leg === "delivery" ? order.delivery_rider : leg === "pickup" ? order.pickup_rider : null;
    const legLabel = leg === "pickup" ? t("ritiro") : t("consegna");

    const assignChildren: MenuProps["items"] =
      riders.length === 0
        ? [{ key: "add-rider", icon: <UserAddOutlined />, label: t("Aggiungi un rider"), onClick: () => navigate("/riders") }]
        : [
            ...riders.map((rider) => ({
              key: `rider-${rider.id}`,
              label: (
                <Flex justify="space-between" align="center" gap={12}>
                  <span>{rider.full_name}</span>
                  {busyRiders.has(rider.id) && <Badge status="processing" text={t("Occupato")} />}
                </Flex>
              ),
              disabled: currentRider?.id === rider.id,
              onClick: () => handleAssign(order, rider.id),
            })),
            ...(currentRider
              ? [
                  { type: "divider" as const },
                  {
                    key: "unassign",
                    icon: <UserDeleteOutlined />,
                    label: t("Rimuovi assegnazione"),
                    onClick: () => handleAssign(order, null),
                  },
                ]
              : []),
          ];

    const statusItems: MenuProps["items"] = getStatusActions(order).map((action) => ({
      key: `status-${action.status}`,
      label: action.label,
      danger: action.danger,
      onClick: () => {
        const run = () =>
          setStatus.mutateAsync({ orderId: order.id, status: action.status }).then(() => void message.success(t("Stato aggiornato")));
        if (action.confirm) {
          modal.confirm({ title: action.label + "?", content: action.confirm, okText: t("Conferma"), cancelText: t("Indietro"), onOk: run });
        } else {
          void run().catch(() => undefined);
        }
      },
    }));

    return [
      { key: "view", icon: <EyeOutlined />, label: t("Dettagli"), onClick: () => onOpen(order, "view") },
      { key: "edit", icon: <EditOutlined />, label: t("Modifica"), onClick: () => onOpen(order, "edit") },
      { type: "divider" },
      leg
        ? {
            key: "assign",
            icon: <UserAddOutlined />,
            label: currentRider ? t("Cambia rider ({leg})", { leg: legLabel }) : t("Assegna {leg}", { leg: legLabel }),
            children: assignChildren,
            // submenu titles bubble to the row too (opening the drawer): stop them
            onTitleClick: stopTitleClick,
          }
        : {
            key: "assign",
            icon: <UserAddOutlined />,
            label: t("Assegna rider"),
            disabled: true,
            title: t("Non assegnabile in questo stato"),
          },
      ...(statusItems && statusItems.length
        ? [
            { type: "divider" as const },
            {
              key: "status",
              icon: <SwapOutlined />,
              label: t("Cambia stato"),
              children: statusItems,
              onTitleClick: stopTitleClick,
            },
          ]
        : []),
      { type: "divider" },
      { key: "delete", icon: <DeleteOutlined />, label: t("Elimina"), danger: true, onClick: () => confirmDelete(order) },
    ];
  };

  const columns: TableProps<Order>["columns"] = [
    {
      title: t("Guida"),
      key: "guide",
      width: 200,
      fixed: "left",
      sorter: (a, b) => a.guide_name.localeCompare(b.guide_name, numberLocale()),
      render: (_, order) => (
        <Flex vertical>
          <Typography.Text strong className="ellipsis-cell">
            {order.guide_name}
          </Typography.Text>
          {order.guide_phone && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {order.guide_phone}
            </Typography.Text>
          )}
        </Flex>
      ),
    },
    {
      title: t("Stato"),
      key: "status",
      width: 170,
      sorter: (a, b) => ORDER_STATUS_FLOW.indexOf(a.status) - ORDER_STATUS_FLOW.indexOf(b.status),
      render: (_, order) => (
        <Flex gap={6} align="center" wrap>
          <StatusTag status={order.status} />
          {isPickupOverdue(order) && (
            <Tooltip title={t("Ritiro in ritardo")}>
              <WarningOutlined style={{ color: "#dc2626" }} />
            </Tooltip>
          )}
          {order.source === "public_form" && (
            <Tooltip title={t("Ricevuto dal modulo pubblico")}>
              <GlobalOutlined style={{ color: "#64748b" }} />
            </Tooltip>
          )}
        </Flex>
      ),
    },
    {
      title: t("Consegna"),
      key: "delivery",
      width: 230,
      defaultSortOrder: "ascend",
      sorter: (a, b) => dayjs(a.delivery_at).valueOf() - dayjs(b.delivery_at).valueOf(),
      render: (_, order) => (
        <Flex vertical>
          <Typography.Text>
            <ClockCircleOutlined style={{ opacity: 0.5 }} /> {when(order.delivery_at)}
          </Typography.Text>
          <Tooltip title={order.delivery_address}>
            <Typography.Text type="secondary" className="ellipsis-cell" style={{ fontSize: 12 }}>
              {order.delivery_address}
            </Typography.Text>
          </Tooltip>
        </Flex>
      ),
    },
    {
      title: t("Ritiro"),
      key: "pickup",
      width: 230,
      sorter: (a, b) => dayjs(a.pickup_at ?? 0).valueOf() - dayjs(b.pickup_at ?? 0).valueOf(),
      render: (_, order) =>
        order.pickup_at || order.pickup_address ? (
          <Flex vertical>
            <Typography.Text>
              <ClockCircleOutlined style={{ opacity: 0.5 }} /> {when(order.pickup_at) ?? "—"}
            </Typography.Text>
            <Tooltip title={order.pickup_address}>
              <Typography.Text type="secondary" className="ellipsis-cell" style={{ fontSize: 12 }}>
                {order.pickup_address ?? t("Luogo da definire")}
              </Typography.Text>
            </Tooltip>
          </Flex>
        ) : (
          <Typography.Text type="secondary">{t("Non pianificato")}</Typography.Text>
        ),
    },
    {
      title: t("Rider"),
      key: "riders",
      width: 190,
      render: (_, order) => (
        <Flex vertical gap={4} align="flex-start">
          {order.delivery_rider ? (
            <Tag color="blue" variant="filled" style={{ margin: 0 }}>
              {t("C ·")}{" "}{order.delivery_rider.full_name}
            </Tag>
          ) : null}
          {order.pickup_rider ? (
            <Tag color="purple" variant="filled" style={{ margin: 0 }}>
              {t("R ·")}{" "}{order.pickup_rider.full_name}
            </Tag>
          ) : null}
          {!order.delivery_rider && !order.pickup_rider && (
            <Typography.Text type={needsAssignment(order) ? "warning" : "secondary"}>
              {needsAssignment(order) ? t("Da assegnare") : "—"}
            </Typography.Text>
          )}
        </Flex>
      ),
    },
    {
      title: t("Radio"),
      key: "radios",
      width: 130,
      align: "right",
      sorter: (a, b) => a.radios_count - b.radios_count,
      render: (_, order) => (
        <Flex vertical align="flex-end">
          <Typography.Text>
            {order.radios_count}
            {order.extra_radios > 0 && (
              <Typography.Text type="secondary"> +{order.extra_radios}</Typography.Text>
            )}
          </Typography.Text>
          {order.radio_channel !== null ? (
            <Tag style={{ margin: 0 }}>{t("Canale")}{" "}{order.radio_channel}</Tag>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("nessun canale")}
            </Typography.Text>
          )}
        </Flex>
      ),
    },
    {
      title: t("Saldo"),
      key: "balance",
      width: 110,
      align: "right",
      sorter: (a, b) => Number(a.balance) - Number(b.balance),
      render: (_, order) => (
        <Flex vertical align="flex-end">
          <Typography.Text>{fmtMoney(Number(order.balance))}</Typography.Text>
          {order.invoice_required && (
            <Tag color="gold" variant="filled" style={{ margin: 0 }}>
              {t("Fattura")}
            </Tag>
          )}
        </Flex>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 64,
      fixed: "right",
      render: (_, order) => (
        <Dropdown
          menu={{
            items: menuFor(order),
            // The menu is portaled, but React still bubbles its clicks to the
            // table row (which would open the details drawer after every action).
            onClick: ({ domEvent }) => domEvent.stopPropagation(),
            // Hover does not exist on touch screens: open submenus on tap/click instead.
            triggerSubMenuAction: "click",
          }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Button
            type="text"
            aria-label={t("Azioni ordine")}
            icon={<MoreOutlined />}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      ),
    },
  ];

  return (
    <Table<Order>
      rowKey="id"
      size="middle"
      columns={columns}
      dataSource={orders}
      loading={loading}
      scroll={{ x: 1280 }}
      sticky
      pagination={{
        defaultPageSize: 25,
        showSizeChanger: true,
        pageSizeOptions: [25, 50, 100, 200],
        showTotal: (total) => tn(total, "{n} ordine", "{n} ordini"),
      }}
      locale={{ emptyText: t("Nessun ordine nel periodo selezionato") }}
      rowClassName={(order) =>
        [
          "clickable-row",
          order.status === "cancelled" ? "row-cancelled" : "",
          needsAssignment(order) ? "row-attention" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      onRow={(order) => ({ onClick: () => onOpen(order, "view") })}
    />
  );
}
