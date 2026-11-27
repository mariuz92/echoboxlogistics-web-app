import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Descriptions, Flex, Input, Modal, Progress, Row, Segmented, Table, Tag, theme, Typography } from "antd";
import { CheckOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getErrorMessage } from "../../lib/errors";
import { SectionSpinner } from "../../shared/components/Screens";
import { numberLocale, t, tn } from "../../i18n";
import { cancelPlanChangeRequest, requestPlanChange } from "./api";
import { money } from "./alerts";
import { monthlyEquivalent, yearlyDeal } from "./deal";
import { planChangeKind } from "./proration";
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

function Line({ icon, children, muted = false }: { icon: "check" | "plus"; children: string; muted?: boolean }) {
  const { token } = theme.useToken();
  return (
    <Flex gap={8} align="baseline">
      {icon === "check"
        ? <CheckOutlined style={{ color: token.colorSuccess, fontSize: 13 }} />
        : <PlusOutlined style={{ color: token.colorTextTertiary, fontSize: 12 }} />}
      <Typography.Text type={muted ? "secondary" : undefined} style={muted ? { fontSize: 14 } : undefined}>{children}</Typography.Text>
    </Flex>
  );
}

function PlanCard({ plan, current, billing, interval, best, onChoose }: {
  plan: PlanInfo; current?: PlanInfo | null; billing: CompanyBilling; interval: BillingInterval; best: boolean;
  onChoose: (plan: PlanInfo) => void;
}) {
  const { token } = theme.useToken();
  const isCurrent = current?.code === plan.code && billing.subscription?.interval === interval;
  const pending = billing.request?.to_plan === plan.code && billing.request.billing_interval === interval;
  const deal = yearlyDeal(plan);
  const yearly = interval === "year";
  const price = yearly ? deal?.price ?? plan.price_month * 12 : plan.price_month;
  const forYou = monthlyEquivalent(plan, interval, billing.usage);
  // Same plan, other interval: monthly -> yearly is an upgrade of the commitment, yearly -> monthly a downgrade.
  const samePlan = !!current && current.code === plan.code;
  const higher = !current ? null : samePlan ? yearly : plan.price_month > current.price_month;
  const verb = higher === null ? t("Scegli {plan}", { plan: plan.name })
    : samePlan ? (yearly ? t("Passa all’annuale") : t("Passa al mensile"))
    : higher ? t("Upgrade a {plan}", { plan: plan.name }) : t("Downgrade a {plan}", { plan: plan.name });
  const count = (n: number) => n.toLocaleString(numberLocale());

  return (
    <Card style={{ height: "100%", borderColor: isCurrent ? token.colorPrimary : undefined, boxShadow: isCurrent ? `0 0 0 1px ${token.colorPrimary}` : undefined }}
      styles={{ body: { height: "100%", padding: 24 } }}>
      <Flex vertical gap={18} style={{ height: "100%" }}>
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>{plan.name}</Typography.Title>
          <Flex gap={4} wrap>
            {isCurrent && <Tag color="blue" style={{ margin: 0 }}>{t("Piano attuale")}</Tag>}
            {best && <Tag color="green" style={{ margin: 0 }}>{t("Il più conveniente per te")}</Tag>}
          </Flex>
        </Flex>

        <div>
          {yearly && deal && <div><Typography.Text delete type="secondary">{money(deal.listPrice, plan.currency)}</Typography.Text></div>}
          <Flex align="baseline" gap={6}>
            <Typography.Text strong style={{ fontSize: 36, lineHeight: 1.1 }}>{money(price, plan.currency)}</Typography.Text>
            <Typography.Text type="secondary">/ {yearly ? t("anno") : t("mese")}</Typography.Text>
          </Flex>
          {deal && (yearly ? (
            <Flex vertical gap={2} style={{ marginTop: 6 }}>
              <Flex gap={8} align="center" wrap>
                <Tag color="green" style={{ margin: 0, fontWeight: 600 }}>−{deal.percent}%</Tag>
                <Typography.Text style={{ color: token.colorSuccess, fontWeight: 500 }}>
                  {t("Risparmi {amount}", { amount: money(deal.saving, plan.currency) })} · {tn(deal.monthsFree, "{n} mese gratis", "{n} mesi gratis")}
                </Typography.Text>
              </Flex>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("pari a {price} al mese", { price: money(deal.perMonth, plan.currency) })}</Typography.Text>
            </Flex>
          ) : (
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 13 }}>
              {t("Con il piano annuale: {price} al mese (−{percent}%)", { price: money(deal.perMonth, plan.currency), percent: deal.percent })}
            </Typography.Text>
          ))}
        </div>

        <Flex vertical gap={8}>
          <Typography.Text type="secondary" style={{ fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" }}>{t("Incluso")}</Typography.Text>
          <Line icon="check">{plan.included_riders === null ? t("Rider illimitati") : t("{n} rider inclusi", { n: count(plan.included_riders) })}</Line>
          <Line icon="check">{plan.included_orders === null ? t("Ordini illimitati") : t("{n} ordini al mese inclusi", { n: count(plan.included_orders) })}</Line>
        </Flex>

        {(plan.included_riders !== null || plan.included_orders !== null) && (
          <Flex vertical gap={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" }}>{t("Oltre i limiti")}</Typography.Text>
            {plan.included_riders !== null && <Line icon="plus" muted>{t("Rider in più: {price} al mese", { price: money(plan.extra_rider_price, plan.currency) })}</Line>}
            {plan.included_orders !== null && <Line icon="plus" muted>{t("Ordini in più: {price} ogni {block}", { price: money(plan.extra_orders_price, plan.currency), block: plan.orders_block })}</Line>}
          </Flex>
        )}

        <div style={{ marginTop: "auto" }}>
          <div style={{ background: token.colorFillAlter, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>{t("Per il tuo utilizzo di questo mese")}</Typography.Text>
            <Typography.Text strong style={{ fontSize: 18 }}>≈ {money(forYou, plan.currency)}</Typography.Text>
            <Typography.Text type="secondary"> {t("al mese")}</Typography.Text>
          </div>
          <Button block size="large" type={higher === false ? "default" : "primary"} disabled={isCurrent || pending || !!billing.request} onClick={() => onChoose(plan)}>
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
  const bestPercent = Math.max(0, ...billing.plans.map((p) => yearlyDeal(p)?.percent ?? 0));
  const bestPlan = billing.plans.length > 1
    ? billing.plans.reduce((a, b) => (monthlyEquivalent(b, interval, billing.usage) < monthlyEquivalent(a, interval, billing.usage) ? b : a)).code
    : undefined;
  const change = plan && sub && chosen ? planChangeKind(plan, sub.interval, chosen, interval) : "upgrade";
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
                ...(sub.next_plan_code ? [{ key: "next", label: t("Cambio programmato"), children: t("Dal rinnovo del {date}: piano {plan} ({interval})", {
                  date: day(sub.ends_at), plan: planName(sub.next_plan_code), interval: sub.next_billing_interval === "year" ? t("annuale") : t("mensile"),
                }) }] : []),
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
        options={[{ value: "month", label: t("Mensile") }, { value: "year", label: (
          <Flex gap={6} align="center">{t("Annuale")}{bestPercent > 0 && <Tag color="green" style={{ margin: 0 }}>−{bestPercent}%</Tag>}</Flex>
        ) }]} />}>
        {interval === "year" && bestPercent > 0 && (
          <Alert type="success" showIcon style={{ marginBottom: 16 }}
            title={t("Piano annuale: lo sconto è sul canone base. Rider e ordini extra restano al prezzo normale e si pagano mese per mese.")} />
        )}
        <Row gutter={[16, 16]}>
          {billing.plans.map((p) => (
            <Col key={p.code} xs={24} md={12} xl={8}>
              <PlanCard plan={p} current={plan} billing={billing} interval={interval} best={p.code === bestPlan} onChoose={setChosen} />
            </Col>
          ))}
        </Row>
        <Typography.Paragraph type="secondary" style={{ margin: "16px 0 0" }}>
          {t("Il cambio di piano viene applicato da EchoBox dopo la tua richiesta. Hai bisogno di un piano su misura? Scrivici dalla richiesta.")}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
          {t("Piano annuale: si paga in anticipo. Se disdici rimborsiamo il canone dei mesi interi che restano, non i rider e gli ordini extra già usati. Un upgrade si paga per i mesi rimanenti; un downgrade vale dal rinnovo.")}
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
            {change === "downgrade" && (
              <Alert type="warning" showIcon title={t("Il passaggio a un piano più piccolo parte dal prossimo rinnovo e ha limiti inclusi più bassi: gli eventuali extra vengono fatturati.")} />
            )}
            {change === "upgrade" && sub?.interval === "year" && interval === "year" && (
              <Alert type="info" showIcon title={t("L’upgrade parte subito: si paga la differenza del canone per i mesi interi che restano dell’anno.")} />
            )}
            <Input.TextArea rows={3} maxLength={500} showCount value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t("Nota per EchoBox (facoltativa)")} aria-label={t("Nota per EchoBox")} />
          </Flex>
        )}
      </Modal>
    </Flex>
  );
}
