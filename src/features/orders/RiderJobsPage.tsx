import { useMemo, useState } from "react";
import { App, Button, Card, Empty, Flex, InputNumber, Modal, Tag, Typography } from "antd";
import {
  AudioOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { fmtDateTime } from "../../lib/dates";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { SectionSpinner } from "../../shared/components/Screens";
import { StatusTag } from "../../shared/components/StatusTag";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import type { Order } from "../../types/domain";
import type { RiderAction } from "./api";
import { useOrderMutations, useOrdersRealtime, useRiderJobs } from "./hooks";

interface JobStep {
  action: RiderAction;
  label: string;
  icon: React.ReactNode;
  done?: string;
}

function nextStep(order: Order, riderId: string): { leg: "delivery" | "pickup"; step?: JobStep } | null {
  if (order.delivery_rider_id === riderId) {
    if (order.status === "delivery_assigned")
      return { leg: "delivery", step: { action: "start_delivery", label: "Avvia consegna", icon: <PlayCircleOutlined />, done: "Consegna avviata" } };
    if (order.status === "out_for_delivery")
      return { leg: "delivery", step: { action: "complete_delivery", label: "Consegna completata", icon: <CheckCircleOutlined />, done: "Consegna completata" } };
  }
  if (order.pickup_rider_id === riderId) {
    if (order.status === "pickup_assigned")
      return { leg: "pickup", step: { action: "start_pickup", label: "Avvia ritiro", icon: <PlayCircleOutlined />, done: "Ritiro avviato" } };
    if (order.status === "out_for_pickup")
      return { leg: "pickup", step: { action: "complete_pickup", label: "Ritiro completato", icon: <CheckCircleOutlined />, done: "Ritiro completato" } };
  }
  return null;
}

/** Jobs list for riders: what to deliver/collect now, plus pickups anyone can claim. */
export function RiderJobsPage() {
  usePageTitle("Le mie consegne");
  const { message } = App.useApp();
  const { profile, timezone } = useReadyUser();
  const { data: jobs = [], isLoading } = useRiderJobs();
  const { riderAction } = useOrderMutations();
  useOrdersRealtime();

  const [lostFor, setLostFor] = useState<Order | null>(null);
  const [lost, setLost] = useState<number>(0);

  const { mine, available } = useMemo(
    () => ({
      mine: jobs.filter((o) => nextStep(o, profile.id)),
      available: jobs.filter((o) => o.status === "awaiting_pickup" && !o.pickup_rider_id),
    }),
    [jobs, profile.id],
  );

  const run = (order: Order, action: RiderAction, done: string, lostCount?: number) =>
    riderAction.mutate(
      { orderId: order.id, action, lost: lostCount },
      { onSuccess: () => void message.success(done) },
    );

  const onStep = (order: Order, step: JobStep) => {
    if (step.action === "complete_pickup") {
      setLost(order.lost_radios);
      setLostFor(order);
      return;
    }
    run(order, step.action, step.done ?? "Fatto");
  };

  const card = (order: Order, mode: "mine" | "available") => {
    const info = mode === "mine" ? nextStep(order, profile.id) : null;
    const leg = info?.leg ?? "pickup";
    const when = leg === "delivery" ? order.delivery_at : order.pickup_at;
    const address = leg === "delivery" ? order.delivery_address : order.pickup_address;

    return (
      <Card key={order.id} size="small" styles={{ body: { padding: 16 } }}>
        <Flex justify="space-between" align="flex-start" gap={8} wrap>
          <Flex vertical gap={2}>
            <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>
              {leg === "delivery" ? "Consegna" : "Ritiro"}
            </Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {fmtDateTime(when, timezone)}
            </Typography.Title>
          </Flex>
          <StatusTag status={order.status} />
        </Flex>

        {address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", margin: "10px 0" }}
          >
            <EnvironmentOutlined /> {address}
          </a>
        )}

        <Flex gap={8} wrap align="center" style={{ marginBottom: 12 }}>
          <Typography.Text strong>{order.guide_name}</Typography.Text>
          {order.guide_phone && (
            <a href={`tel:${order.guide_phone.replace(/\s/g, "")}`}>
              <PhoneOutlined /> {order.guide_phone}
            </a>
          )}
          <Tag icon={<AudioOutlined />} variant="filled">
            {order.radios_count + order.extra_radios} radio
          </Tag>
          {order.radio_channel !== null && <Tag variant="filled">Canale {order.radio_channel}</Tag>}
        </Flex>

        {order.notes && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {order.notes}
          </Typography.Paragraph>
        )}

        {mode === "mine" && info?.step && (
          <Button
            type="primary"
            size="large"
            block
            icon={info.step.icon}
            loading={riderAction.isPending && riderAction.variables?.orderId === order.id}
            onClick={() => onStep(order, info.step!)}
          >
            {info.step.label}
          </Button>
        )}
        {mode === "available" && (
          <Button
            size="large"
            block
            loading={riderAction.isPending && riderAction.variables?.orderId === order.id}
            onClick={() => run(order, "claim_pickup", "Ritiro preso in carico")}
          >
            Prendi in carico il ritiro
          </Button>
        )}
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Le mie consegne" subtitle={`Ciao ${profile.full_name || profile.email}`} />

      {isLoading ? (
        <SectionSpinner />
      ) : (
        <Flex vertical gap={24} style={{ maxWidth: 720 }}>
          <section>
            <Typography.Title level={4}>Assegnate a me ({mine.length})</Typography.Title>
            {mine.length === 0 ? (
              <Card>
                <Empty description="Nessuna consegna o ritiro assegnato" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </Card>
            ) : (
              <Flex vertical gap={12}>
                {mine.map((o) => card(o, "mine"))}
              </Flex>
            )}
          </section>

          <section>
            <Typography.Title level={4}>Ritiri disponibili ({available.length})</Typography.Title>
            {available.length === 0 ? (
              <Card>
                <Empty description="Nessun ritiro in attesa" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </Card>
            ) : (
              <Flex vertical gap={12}>
                {available.map((o) => card(o, "available"))}
              </Flex>
            )}
          </section>
        </Flex>
      )}

      <Modal
        title="Ritiro completato"
        open={Boolean(lostFor)}
        onCancel={() => setLostFor(null)}
        okText="Conferma ritiro"
        cancelText="Annulla"
        confirmLoading={riderAction.isPending}
        onOk={() => {
          if (!lostFor) return;
          run(lostFor, "complete_pickup", "Ritiro completato", lost);
          setLostFor(null);
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          Quante radioguide mancano all&apos;appello? Lascia 0 se sono rientrate tutte.
        </Typography.Paragraph>
        <InputNumber
          min={0}
          max={lostFor ? lostFor.radios_count + lostFor.extra_radios : undefined}
          precision={0}
          size="large"
          value={lost}
          onChange={(value) => setLost(value ?? 0)}
          style={{ width: "100%" }}
        />
      </Modal>
    </>
  );
}

export default RiderJobsPage;
