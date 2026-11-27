import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Descriptions, Flex, Input, Modal, Progress, Row, Segmented, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { getErrorMessage } from "../../lib/errors";
import { SectionSpinner } from "../../shared/components/Screens";
import { t } from "../../i18n";
import { cancelPlanChangeRequest, requestPlanChange } from "./api";
import { money } from "./alerts";
import { estimateFromPlan } from "./estimate";
import { useCompanyBilling } from "./useBilling";
import {
  limitLevel, type BillingInterval, type CompanyBilling, type EstimateLine, type Invoice, type InvoiceLine,
  type PlanInfo, type SubscriptionState,
} from "./types";

const day = (value: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "—");

function stateLabel(state: SubscriptionState): string {
  return {
    trial: t("Prova"), active: t("Attivo"), past_due: t("Pagamento in ritardo"), expired: t("Scaduto"), cancelled: t("Annullato"),
  }[state];
}

function lineLabel(line: EstimateLine | InvoiceLine): string {
  if (line.code === "base") return t("Canone di base");
  if (line.code === "extra_riders") return t("Rider aggiuntivi ({n})", { n: line.quantity });
  if (line.code === "extra_orders") {
    return t("Ordini aggiuntivi ({n} × {block})", { n: line.quantity, block: "block" in line && line.block ? line.block : 100 });
  }
  return ("label" in line && line.label) || line.code || "";
}

function Usage({ billing }: { billing: CompanyBilling }) {
  const { plan, usage, estimate } = billing;
  const rows = [
    { label: t("Ordini questo mese"), used: usage.orders, included: plan?.included_orders ?? null },
    { label: t("Rider attivi"), used: usage.riders, included: plan?.included_riders ?? null },
  ];
  return (
    <Card title={t("Utilizzo")} extra={<Typography.Text type="secondary">{day(usage.period_start)} – {day(usage.period_end)}</Typography.Text>}>
      <Flex vertical gap={16}>
        {rows.map(({ label, used, included }) => {
          const { percent, level } = limitLevel(used, included);
          return (
            <div key={label}>
              <Flex justify="space-between">
                <Typography.Text>{label}</Typography.Text>
                <Typography.Text type={level === "reached" ? "danger" : "secondary"}>
                  {included === null ? t("{used} (illimitati)", { used }) : t("{used} su {included}", { used, included })}
                </Typography.Text>
              </Flex>
              {percent !== null && (
                <Progress percent={Math.min(percent, 100)} showInfo={false} status={level === "reached" ? "exception" : "normal"}
                  strokeColor={level === "warning" ? "#faad14" : undefined} />
              )}
            </div>
          );
        })}
        <Typography.Text type="secondary">
          {t("Nessun blocco quando raggiungi i limiti: puoi continuare a lavorare e gli extra vengono fatturati nella fattura successiva.")}
        </Typography.Text>
        {estimate && (
          <div>
            <Typography.Text strong>{t("Stima del mese in corso")}</Typography.Text>
            <Table size="small" pagination={false} rowKey="code" style={{ marginTop: 8 }} dataSource={estimate.lines} showHeader={false}
              columns={[
                { render: (_, line: EstimateLine) => lineLabel(line) },
                { align: "right", render: (_, line: EstimateLine) => money(line.amount, estimate.currency) },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><Typography.Text strong>{t("Totale stimato")}</Typography.Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><Typography.Text strong>{money(estimate.total, estimate.currency)}</Typography.Text></Table.Summary.Cell>
                </Table.Summary.Row>
              )} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("L’importo esatto è quello della fattura: l’IVA, se dovuta, si aggiunge.")}
            </Typography.Text>
          </div>
        )}
      </Flex>
    </Card>
  );
}

function PlanCard({ plan, current, billing, interval, onChoose }: {
  plan: PlanInfo; current?: PlanInfo | null; billing: CompanyBilling; interval: BillingInterval; onChoose: (plan: PlanInfo) => void;
}) {
  const isCurrent = current?.code === plan.code && billing.subscription?.interval === interval;
  const pending = billing.request?.to_plan === plan.code && billing.request.billing_interval === interval;
  const price = interval === "year" ? plan.price_year ?? plan.price_month * 12 : plan.price_month;
  const saving = interval === "year" ? plan.price_month * 12 - price : 0;
  const withUsage = estimateFromPlan(plan, "month", billing.usage).total;
  const higher = current ? plan.price_month > current.price_month : null;
  const verb = higher === null ? t("Scegli {plan}", { plan: plan.name }) : higher ? t("Upgrade a {plan}", { plan: plan.name }) : t("Downgrade a {plan}", { plan: plan.name });

  return (
    <Card style={{ height: "100%", borderColor: isCurrent ? "var(--ant-color-primary, #1677ff)" : undefined }}
      title={<Flex justify="space-between" align="center"><span>{plan.name}</span>{isCurrent && <Tag color="blue">{t("Piano attuale")}</Tag>}</Flex>}>
      <Flex vertical gap={8} style={{ height: "100%" }}>
        <div>
          <Typography.Text strong style={{ fontSize: 26 }}>{money(price, plan.currency)}</Typography.Text>
          <Typography.Text type="secondary"> / {interval === "year" ? t("anno") : t("mese")}</Typography.Text>
          {saving > 0 && <div><Tag color="green">{t("Risparmi {amount}", { amount: money(saving, plan.currency) })}</Tag></div>}
        </div>
        <ul style={{ paddingInlineStart: 18, margin: 0 }}>
          <li>{plan.included_riders === null ? t("Rider illimitati") : t("{n} rider inclusi", { n: plan.included_riders })}</li>
          <li>{plan.included_orders === null ? t("Ordini illimitati") : t("{n} ordini al mese inclusi", { n: plan.included_orders })}</li>
          {plan.included_riders !== null && <li>{t("Rider in più: {price} al mese", { price: money(plan.extra_rider_price, plan.currency) })}</li>}
          {plan.included_orders !== null && <li>{t("Ordini in più: {price} ogni {block}", { price: money(plan.extra_orders_price, plan.currency), block: plan.orders_block })}</li>}
        </ul>
        {billing.subscription && !isCurrent && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t("Con il tuo utilizzo di questo mese: {price} al mese", { price: money(withUsage, plan.currency) })}
          </Typography.Text>
        )}
        <div style={{ marginTop: "auto" }}>
          <Button block type={higher === false ? "default" : "primary"} disabled={isCurrent || pending || !!billing.request} onClick={() => onChoose(plan)}>
            {isCurrent ? t("Piano attuale") : pending ? t("Richiesta inviata") : verb}
          </Button>
        </div>
      </Flex>
    </Card>
  );
}

function Invoices({ invoices }: { invoices: Invoice[] }) {
  const tag = (invoice: Invoice) => {
    if (invoice.status === "paid") return <Tag color="green">{t("Pagata")}</Tag>;
    if (invoice.status === "void") return <Tag>{t("Annullata")}</Tag>;
    if (invoice.due_at && dayjs(invoice.due_at).isBefore(dayjs())) return <Tag color="red">{t("Scaduta")}</Tag>;
    return <Tag color="blue">{t("Da pagare")}</Tag>;
  };
  return (
    <Card title={t("Fatture")}>
      <Table<Invoice> size="small" rowKey="id" scroll={{ x: 640 }} dataSource={invoices} locale={{ emptyText: t("Nessuna fattura") }}
        expandable={{ expandedRowRender: (invoice) => (
          <Table size="small" pagination={false} rowKey={(_, i) => String(i)} dataSource={invoice.lines}
            columns={[
              { title: t("Descrizione"), render: (_, line: InvoiceLine) => lineLabel(line) },
              { title: t("Importo"), align: "right", render: (_, line: InvoiceLine) => money(line.amount, invoice.currency) },
            ]} />
        ) }}
        columns={[
          { title: t("Numero"), render: (_, i) => i.external_url ? <a href={i.external_url} target="_blank" rel="noreferrer noopener">{i.number}</a> : i.number },
          { title: t("Periodo"), render: (_, i) => `${day(i.period_start)} – ${day(i.period_end)}` },
          { title: t("Importo"), render: (_, i) => money(i.amount, i.currency) },
          { title: t("Stato"), render: (_, i) => tag(i) },
          { title: t("Scadenza"), render: (_, i) => day(i.due_at) },
          { title: t("Pagata il"), render: (_, i) => day(i.paid_at) },
        ]} />
    </Card>
  );
}

/** Loads the company's billing data and shows it. */
export function SubscriptionPanel() {
  const { data: billing, isLoading, error } = useCompanyBilling();
  if (isLoading) return <SectionSpinner />;
  if (error || !billing) return <Alert type="info" showIcon title={t("L’abbonamento non è disponibile al momento. Riprova più tardi.")} />;
  return <SubscriptionView billing={billing} />;
}

export function SubscriptionView({ billing }: { billing: CompanyBilling }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [chosen, setChosen] = useState<PlanInfo>();
  const [note, setNote] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["company-billing"] });
  const send = useMutation({
    mutationFn: () => requestPlanChange(chosen!.code, interval, note),
    onSuccess: () => {
      void message.success(t("Richiesta inviata. Ti risponderemo appena possibile."));
      setChosen(undefined);
      setNote("");
      void refresh();
    },
    onError: (e) => void message.error(getErrorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: cancelPlanChangeRequest,
    onSuccess: () => { void message.success(t("Richiesta annullata.")); void refresh(); },
    onError: (e) => void message.error(getErrorMessage(e)),
  });

  const { subscription: sub, plan, request, last_response: reply } = billing;
  const planName = (code: string) => billing.plans.find((p) => p.code === code)?.name ?? code;
  const endLabel = sub?.state === "trial" ? t("Prova fino al") : t("Prossimo rinnovo");
  const recentReply = reply && dayjs(reply.handled_at).isAfter(dayjs().subtract(14, "day"));

  return (
    <Flex vertical gap={16}>
      {request && (
        <Alert type="info" showIcon
          title={t("Richiesta in corso: {plan} ({interval}), inviata il {date}.", {
            plan: planName(request.to_plan), interval: request.billing_interval === "year" ? t("annuale") : t("mensile"), date: day(request.created_at),
          })}
          action={<Button size="small" loading={cancel.isPending} onClick={() => cancel.mutate()}>{t("Annulla richiesta")}</Button>} />
      )}
      {recentReply && !request && (
        <Alert type={reply.status === "approved" ? "success" : "warning"} showIcon
          title={reply.status === "approved"
            ? t("La tua richiesta per il piano {plan} è stata approvata.", { plan: planName(reply.to_plan) })
            : t("La tua richiesta per il piano {plan} non è stata accettata.", { plan: planName(reply.to_plan) })}
          description={reply.response || undefined} />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={t("Il tuo abbonamento")} style={{ height: "100%" }}>
            {sub && plan ? (
              <Descriptions size="small" column={1} items={[
                { key: "plan", label: t("Piano"), children: <Flex gap={8}><strong>{plan.name}</strong>{sub.forever && <Tag color="purple">{t("Per sempre")}</Tag>}</Flex> },
                { key: "state", label: t("Stato"), children: <Tag color={sub.state === "active" ? "green" : sub.state === "trial" ? "blue" : "orange"}>{stateLabel(sub.state)}</Tag> },
                { key: "interval", label: t("Fatturazione"), children: sub.interval === "year" ? t("Annuale") : t("Mensile") },
                { key: "end", label: sub.forever ? t("Scadenza") : endLabel, children: sub.forever ? t("Nessuna scadenza") : day(sub.ends_at) },
                ...(sub.billing_email ? [{ key: "email", label: t("Email di fatturazione"), children: sub.billing_email }] : []),
              ]} />
            ) : (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {t("Nessun piano assegnato: l’azienda ha accesso completo, senza limiti. Scegli un piano qui sotto quando vuoi attivare l’abbonamento.")}
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}><Usage billing={billing} /></Col>
      </Row>

      <Card title={t("Piani")} extra={<Segmented<BillingInterval> value={interval} onChange={setInterval}
        options={[{ value: "month", label: t("Mensile") }, { value: "year", label: t("Annuale") }]} />}>
        <Row gutter={[16, 16]}>
          {billing.plans.map((p) => (
            <Col key={p.code} xs={24} md={12} xl={8}>
              <PlanCard plan={p} current={plan} billing={billing} interval={interval} onChoose={setChosen} />
            </Col>
          ))}
        </Row>
        <Typography.Paragraph type="secondary" style={{ margin: "16px 0 0" }}>
          {t("Il cambio di piano viene applicato da EchoBox dopo la tua richiesta. Hai bisogno di un piano su misura? Scrivici dalla richiesta.")}
        </Typography.Paragraph>
      </Card>

      <Invoices invoices={billing.invoices} />

      <Modal open={!!chosen} title={chosen ? t("Richiedi il piano {plan}", { plan: chosen.name }) : ""} onCancel={() => setChosen(undefined)}
        okText={t("Invia richiesta")} cancelText={t("Annulla")} confirmLoading={send.isPending} onOk={() => send.mutate()}>
        {chosen && (
          <Flex vertical gap={12}>
            <Typography.Text>
              {t("{plan} · {price} {period}", {
                plan: chosen.name,
                price: money(interval === "year" ? chosen.price_year ?? chosen.price_month * 12 : chosen.price_month, chosen.currency),
                period: interval === "year" ? t("all’anno") : t("al mese"),
              })}
            </Typography.Text>
            {plan && chosen.price_month < plan.price_month && (
              <Alert type="warning" showIcon title={t("Con un piano più piccolo i limiti inclusi si abbassano: gli eventuali extra vengono fatturati.")} />
            )}
            <Input.TextArea rows={3} maxLength={500} showCount value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t("Nota per EchoBox (facoltativa)")} aria-label={t("Nota per EchoBox")} />
          </Flex>
        )}
      </Modal>
    </Flex>
  );
}
