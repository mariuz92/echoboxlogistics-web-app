import { useMemo, useState } from "react";
import {
  Alert, Button, Card, Col, Descriptions, Flex, Form, Input, InputNumber, Row, Select, Statistic, Switch,
  Table, Tabs, Tag, Tooltip, Typography,
} from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { PageHeader } from "../src/shared/components/PageHeader";
import {
  highlightPlan, submitAction, type BillingCompany, type BillingInvoice, type BillingNotice, type BillingOverview,
  type BillingRequest, type Company, type NoticeKind, type Plan, type Snapshot,
} from "../src/features/platform/api";
import { estimateFromPlan } from "../src/features/billing/estimate";
import { MAX_PUBLIC_PLANS } from "../src/features/billing/pricing";
import { baseFee, planChangeKind, remainingMonths, upgradeDifference, yearlyRefund } from "../src/features/billing/proration";
import { limitLevel, type EstimateLine, type InvoiceLine, type InvoiceStatus } from "../src/features/billing/types";
import {
  accessTag, date, DATE, dateInput, day, money, REQUIRED, SUBSCRIPTION, UsageBar, type OpenEditor,
} from "./shared";

const INTERVAL = { month: "Mensile", year: "Annuale" } as const;
const INVOICE: Record<InvoiceStatus, [string, string]> = {
  draft: ["Bozza", "default"], issued: ["Emessa", "blue"], paid: ["Pagata", "green"], void: ["Annullata", "default"],
};
const NOTICE: Record<NoticeKind, string> = {
  limit_orders_80: "Ordini all’80%", limit_orders_100: "Limite ordini raggiunto", limit_riders_100: "Limite rider raggiunto",
  trial_ending: "Prova in scadenza", past_due: "Pagamento in ritardo", payment_reminder: "Promemoria di pagamento",
  custom: "Messaggio",
};
const REQUEST: Record<BillingRequest["status"], [string, string]> = {
  open: ["Da gestire", "gold"], approved: ["Approvata", "green"], rejected: ["Rifiutata", "red"], cancelled: ["Annullata", "default"],
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const planName = (plans: Plan[], code: string | null) => plans.find((p) => p.code === code)?.name ?? code ?? "—";

function invoiceTag(invoice: Pick<BillingInvoice, "status" | "due_at">) {
  if (invoice.status === "issued" && invoice.due_at && dayjs(invoice.due_at).isBefore(dayjs())) {
    return <Tag color="red">Scaduta</Tag>;
  }
  return <Tag color={INVOICE[invoice.status][1]}>{INVOICE[invoice.status][0]}</Tag>;
}

function lineLabel(line: EstimateLine, plan: Plan, interval: "month" | "year") {
  if (line.code === "base") return `Canone ${plan.name} (${interval === "year" ? "annuale" : "mensile"})`;
  if (line.code === "extra_riders") return `Rider aggiuntivi (${line.quantity})`;
  return `Ordini aggiuntivi (${line.quantity} × ${line.block ?? 100})`;
}

function InvoiceLines({ lines }: { lines: InvoiceLine[] }) {
  return <Table size="small" pagination={false} rowKey={(_, i) => String(i)} dataSource={lines} columns={[
    { title: "Descrizione", render: (_, l) => l.label ?? l.code },
    { title: "Qtà", dataIndex: "quantity", width: 70 },
    { title: "Prezzo", render: (_, l) => money(l.unit_price), width: 110 },
    { title: "Importo", render: (_, l) => money(l.amount), width: 110 },
  ]} />;
}

// ----------------------------------------------------------------------------- plans

function planFields(isEdit: boolean) {
  const number = (name: string, label: string, props: { precision?: number; extra?: string; required?: boolean; min?: number }) => (
    <Col xs={24} sm={12}>
      <Form.Item name={name} label={label} extra={props.extra} rules={props.required ? REQUIRED : undefined}>
        <InputNumber min={props.min ?? 0} precision={props.precision ?? 0} style={{ width: "100%" }} />
      </Form.Item>
    </Col>
  );
  return <>
    <Form.Item name="code" label="Codice" extra="Minuscole, numeri, - e _. Non si può cambiare dopo la creazione."
      rules={[{ required: true, pattern: /^[a-z][a-z0-9_-]{1,39}$/ }]}><Input disabled={isEdit} /></Form.Item>
    <Form.Item name="name" label="Nome" rules={[{ required: true, whitespace: true, min: 2, max: 80 }]}><Input /></Form.Item>
    <Form.Item name="description" label="Descrizione breve"><Input maxLength={300} /></Form.Item>
    <Row gutter={12}>
      {number("price_month", "Prezzo al mese", { precision: 2, required: true })}
      {number("price_year", "Prezzo all’anno", { precision: 2, extra: "Vuoto = 12 mesi" })}
      {number("included_riders", "Rider inclusi", { extra: "Vuoto = illimitati" })}
      {number("included_orders", "Ordini inclusi al mese", { extra: "Vuoto = illimitati" })}
      {number("extra_rider_price", "Rider aggiuntivo (al mese)", { precision: 2 })}
      {number("extra_orders_price", "Ordini aggiuntivi (per blocco)", { precision: 2 })}
      {number("orders_block", "Ordini per blocco", { min: 1, required: true })}
      <Col xs={24} sm={12}>
        <Form.Item name="currency" label="Valuta" rules={[{ required: true, pattern: /^[A-Za-z]{3}$/ }]}><Input maxLength={3} /></Form.Item>
      </Col>
    </Row>
    <Form.Item name="available" label="Assegnabile" valuePropName="checked"><Switch /></Form.Item>
    <Form.Item name="is_public" label="Visibile ai clienti e sul sito" valuePropName="checked"
      extra="Compare nell’elenco dei piani del cliente e nei prezzi del sito. Spegni per i piani su misura: restano assegnabili solo da qui."><Switch /></Form.Item>
    <Form.Item name="sort_order" label="Ordine"><InputNumber precision={0} style={{ width: "100%" }} /></Form.Item>
  </>;
}

const NEW_PLAN = {
  available: true, is_public: true, currency: "EUR", orders_block: 100, sort_order: 100, price_month: 0,
  extra_rider_price: 0, extra_orders_price: 0, description: "",
};

export function Plans({ snapshot, overview, edit }: { snapshot: Snapshot; overview?: BillingOverview; edit: OpenEditor }) {
  function open(plan?: Plan, copy = false) {
    edit({
      action: "save_plan", title: plan && !copy ? "Modifica piano" : copy ? "Duplica piano" : "Crea piano",
      values: plan ? { ...plan, ...(copy ? { code: "", name: `${plan.name} (copia)`, is_public: false } : {}) } : NEW_PLAN,
      description: "I limiti sono morbidi: oltre il limite il cliente riceve un avviso e gli extra vengono fatturati.",
      fields: planFields(!!plan && !copy),
    });
  }

  const defaults = overview?.trial_defaults;
  // Same order as the site: display order, then name.
  const published = snapshot.plans.filter((p) => p.available && p.is_public)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const hidden = published.slice(MAX_PUBLIC_PLANS);
  return <>
    <PageHeader title="Piani" subtitle="Prezzi e limiti dei piani. I piani disponibili e visibili ai clienti compaiono anche sul sito, con il calcolatore: i cambi qui si vedono sul sito entro pochi minuti."
      actions={<Button type="primary" onClick={() => open()}>Crea piano</Button>} />
    <Flex vertical gap={16}>
      {hidden.length > 0 && <Alert type="warning" showIcon
        title={`Il sito mostra solo i primi ${MAX_PUBLIC_PLANS} piani pubblicati (secondo “Ordine”). Non compaiono: ${hidden.map((p) => p.name).join(", ")}. Archivia un piano o spegni “Visibile ai clienti e sul sito” per sceglierne tre.`} />}
      <Card><Table rowKey="code" scroll={{ x: 960 }} pagination={false} dataSource={snapshot.plans} columns={[
        { title: "Piano", render: (_, p: Plan) => <Flex vertical>
          <Typography.Text strong>{p.name}{!p.is_public && <Tag style={{ marginLeft: 8 }}>Su misura</Tag>}</Typography.Text>
          <Typography.Text type="secondary">{p.code}</Typography.Text>
        </Flex> },
        { title: "Mese", render: (_, p: Plan) => money(p.price_month, p.currency) },
        { title: "Anno", render: (_, p: Plan) => p.price_year === null ? "12 mesi" : money(p.price_year, p.currency) },
        { title: "Rider", render: (_, p: Plan) => p.included_riders ?? "illimitati" },
        { title: "Ordini/mese", render: (_, p: Plan) => p.included_orders ?? "illimitati" },
        { title: "Rider extra", render: (_, p: Plan) => money(p.extra_rider_price, p.currency) },
        { title: "Ordini extra", render: (_, p: Plan) => `${money(p.extra_orders_price, p.currency)} / ${p.orders_block}` },
        { title: "Stato", render: (_, p: Plan) => <Tag color={p.available ? "green" : "default"}>{p.available ? "Disponibile" : "Archiviato"}</Tag> },
        { title: "Sito", render: (_, p: Plan) => p.available && p.is_public
          ? <Flex vertical gap={4} align="flex-start">
            <Tag color="blue">Pubblicato</Tag>
            {p.highlighted ? <Tag color="gold">Il più scelto</Tag> : null}
          </Flex> : <Typography.Text type="secondary">Non pubblicato</Typography.Text> },
        { title: "Azioni", render: (_, p: Plan) => <Flex gap={6} wrap>
          <Button size="small" onClick={() => open(p)}>Modifica</Button>
          <Button size="small" onClick={() => open(p, true)}>Duplica</Button>
          {p.available && p.is_public && <Button size="small" onClick={() => edit({
            title: p.highlighted ? "Togli il badge “Il più scelto”" : "Evidenzia sul sito",
            values: { reason: p.highlighted ? "Badge rimosso" : "Piano evidenziato sul sito" },
            description: p.highlighted
              ? `${p.name} non avrà più il badge “Il più scelto” sul sito.`
              : `${p.name} avrà il badge “Il più scelto” sul sito, al posto di quello attuale.`,
            submit: async (fields) => { await highlightPlan(p.code, !p.highlighted, String(fields.reason)); },
          })}>{p.highlighted ? "Togli badge" : "Evidenzia"}</Button>}
        </Flex> },
      ]} /></Card>
      {defaults && <Card title="Prova per i nuovi clienti" extra={<Button onClick={() => edit({
        action: "save_trial_defaults", title: "Prova automatica per le nuove aziende",
        values: { plan_code: defaults.plan_code ?? undefined, days: defaults.days },
        description: "Se i giorni sono più di zero, ogni nuova azienda parte con una prova del piano scelto. Alla scadenza passa in sola lettura. Le aziende già esistenti non cambiano.",
        fields: <>
          <Form.Item name="plan_code" label="Piano della prova">
            <Select allowClear options={snapshot.plans.filter((p) => p.available).map((p) => ({ value: p.code, label: p.name }))} />
          </Form.Item>
          <Form.Item name="days" label="Giorni di prova (0 = nessuna)" rules={REQUIRED}><InputNumber min={0} max={365} precision={0} style={{ width: "100%" }} /></Form.Item>
        </>,
      })}>Modifica</Button>}>
        <Typography.Text>{defaults.days > 0
          ? `Le nuove aziende ricevono ${defaults.days} giorni di prova del piano ${planName(snapshot.plans, defaults.plan_code)}.`
          : "Nessuna prova automatica: le nuove aziende restano senza abbonamento, con accesso completo."}</Typography.Text>
      </Card>}
      <Alert type="info" showIcon title="Le aziende senza abbonamento hanno accesso completo e nessun limite. Assegna un piano dalla scheda dell’azienda per applicare limiti e fatturazione." />
    </Flex>
  </>;
}

// ----------------------------------------------------------------------------- editors

function subscriptionEditor(company: Company, snapshot: Snapshot, edit: OpenEditor) {
  const sub = snapshot.subscription;
  edit({
    title: "Modifica abbonamento", action: "save_subscription", dates: ["ends_at", "grace_until", "closeout_until"],
    description: "Le date sono mostrate nel fuso orario del tuo dispositivo. “Per sempre” richiede lo stato Attivo e rimuove la scadenza.",
    values: {
      tenant_id: company.id, state: sub?.state ?? "active", plan_code: sub?.plan_code, billing_interval: sub?.billing_interval ?? "month",
      forever: sub?.forever ?? false, ends_at: dateInput(sub?.ends_at), grace_until: dateInput(sub?.grace_until),
      closeout_until: dateInput(sub?.closeout_until), billing_email: sub?.billing_email, notes: sub?.notes ?? "",
    },
    fields: <>
      <Form.Item name="plan_code" label="Piano" rules={REQUIRED}>
        <Select options={snapshot.plans.filter((p) => p.available || p.code === sub?.plan_code).map((p) => ({ label: p.name, value: p.code }))} />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} sm={12}><Form.Item name="state" label="Stato" rules={REQUIRED}>
          <Select options={Object.entries(SUBSCRIPTION).map(([value, label]) => ({ value, label }))} />
        </Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item name="billing_interval" label="Fatturazione" rules={REQUIRED}>
          <Select options={Object.entries(INTERVAL).map(([value, label]) => ({ value, label }))} />
        </Form.Item></Col>
      </Row>
      <Form.Item name="forever" label="Per sempre (nessuna scadenza)" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item noStyle shouldUpdate={(a, b) => a.forever !== b.forever}>
        {({ getFieldValue }) => <Form.Item name="ends_at" label="Data fine o rinnovo">
          <Input type="datetime-local" disabled={!!getFieldValue("forever")} />
        </Form.Item>}
      </Form.Item>
      <Form.Item name="grace_until" label="Periodo di tolleranza fino a"><Input type="datetime-local" /></Form.Item>
      <Form.Item name="closeout_until" label="Chiusura incarichi fino a"><Input type="datetime-local" /></Form.Item>
      <Form.Item name="billing_email" label="Email fatturazione" rules={[{ type: "email", max: 254 }]}><Input /></Form.Item>
      <Form.Item name="notes" label="Note interne"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
    </>,
  });
}

function invoiceEditor(
  company: Company, edit: OpenEditor, initialLines: { label: string; quantity: number; unit_price: number }[],
) {
  const now = dayjs();
  edit({
    title: "Nuova fattura",
    description: "Registra la fattura emessa al cliente. Il documento fiscale si emette con il tuo servizio di fatturazione elettronica: puoi incollare qui il link.",
    values: {
      status: "issued", period_start: now.startOf("month").format("YYYY-MM-DD"), period_end: now.endOf("month").format("YYYY-MM-DD"),
      lines: initialLines.length ? initialLines : [{ label: "", quantity: 1, unit_price: 0 }], reason: "Emissione fattura",
    },
    submit: async (fields) => {
      const lines = (fields.lines as unknown as { label: string; quantity: number; unit_price: number }[]).map((l) => ({
        code: "custom", label: l.label, quantity: l.quantity, unit_price: l.unit_price, amount: round2(l.quantity * l.unit_price),
      }));
      await submitAction("create_invoice", {
        tenant_id: company.id, period_start: fields.period_start, period_end: fields.period_end, status: fields.status,
        number: fields.number, due_at: fields.due_at, external_url: fields.external_url, lines, reason: fields.reason,
      });
    },
    fields: <>
      <Row gutter={12}>
        <Col xs={24} sm={12}><Form.Item name="period_start" label="Periodo dal" rules={REQUIRED}><Input type="date" /></Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item name="period_end" label="al" rules={REQUIRED}><Input type="date" /></Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item name="number" label="Numero" extra="Vuoto = numerazione automatica"><Input maxLength={40} /></Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item name="due_at" label="Scadenza" extra="Vuoto = 30 giorni"><Input type="date" /></Form.Item></Col>
      </Row>
      <Form.Item name="status" label="Stato" rules={REQUIRED}>
        <Select options={[{ value: "issued", label: "Emessa (visibile al cliente)" }, { value: "draft", label: "Bozza (non visibile)" }]} />
      </Form.Item>
      <Form.Item name="external_url" label="Link alla fattura (opzionale)" rules={[{ type: "url" }]}><Input placeholder="https://" /></Form.Item>
      <Typography.Text strong>Righe</Typography.Text>
      <Form.List name="lines">{(fields, { add, remove }) => <Flex vertical gap={4} style={{ margin: "8px 0 16px" }}>
        {fields.map(({ key, name }) => <Flex key={key} gap={8} align="start">
          <Form.Item name={[name, "label"]} rules={[{ required: true, whitespace: true, max: 120 }]} style={{ flex: 1, marginBottom: 4 }}>
            <Input placeholder="Descrizione" />
          </Form.Item>
          <Form.Item name={[name, "quantity"]} rules={REQUIRED} style={{ marginBottom: 4 }}><InputNumber min={0} placeholder="Qtà" style={{ width: 76 }} /></Form.Item>
          <Form.Item name={[name, "unit_price"]} rules={REQUIRED} style={{ marginBottom: 4 }}><InputNumber precision={2} placeholder="Prezzo" style={{ width: 104 }} /></Form.Item>
          <Button type="text" aria-label="Rimuovi riga" icon={<MinusCircleOutlined />} disabled={fields.length === 1} onClick={() => remove(name)} />
        </Flex>)}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ label: "", quantity: 1, unit_price: 0 })}>Aggiungi riga</Button>
      </Flex>}</Form.List>
    </>,
  });
}

function invoiceActions(invoice: BillingInvoice, edit: OpenEditor) {
  const id = invoice.id;
  return <Flex gap={6} wrap>
    {invoice.status === "draft" && <Button size="small" onClick={() => edit({
      title: "Emetti fattura", action: "set_invoice_status", values: { invoice_id: id, status: "issued", reason: "Fattura emessa" },
      description: `La fattura ${invoice.number} diventa visibile al cliente.`,
    })}>Emetti</Button>}
    {invoice.status === "issued" && <Button size="small" type="primary" onClick={() => edit({
      title: "Segna come pagata", action: "set_invoice_status", dates: ["paid_at"],
      values: { invoice_id: id, status: "paid", paid_at: dayjs().format(DATE), extend_subscription: true, reason: "Bonifico ricevuto" },
      description: `${invoice.number} · ${money(invoice.amount, invoice.currency)}. Il pagamento viene registrato automaticamente.`,
      fields: <>
        <Form.Item name="paid_at" label="Data del pagamento" rules={REQUIRED}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="extend_subscription" label="Rinnova l’abbonamento di un periodo" valuePropName="checked"
          extra="Imposta lo stato Attivo e sposta la scadenza di un mese o un anno."><Switch /></Form.Item>
      </>,
    })}>Segna pagata</Button>}
    {invoice.status === "issued" && <Button size="small" danger onClick={() => edit({
      title: "Annulla fattura", action: "set_invoice_status", values: { invoice_id: id, status: "void" },
      description: `La fattura ${invoice.number} resta in archivio come annullata.`,
    })}>Annulla</Button>}
    {invoice.status === "draft" && <Button size="small" danger onClick={() => edit({
      title: "Elimina bozza", action: "delete_invoice", values: { invoice_id: id }, description: invoice.number,
    })}>Elimina</Button>}
  </Flex>;
}

function noticeEditor(edit: OpenEditor, company?: { id: string; name: string }, companies?: { id: string; name: string }[]) {
  edit({
    title: company ? `Invia email a ${company.name}` : "Invia email a un’azienda", action: "send_notice",
    values: { tenant_id: company?.id, kind: "payment_reminder", reason: "Promemoria inviato dall’operatore" },
    description: "L’email parte entro pochi secondi, in italiano e in inglese, all’indirizzo di fatturazione o agli amministratori dell’azienda.",
    fields: <>
      {!company && <Form.Item name="tenant_id" label="Azienda" rules={REQUIRED}>
        <Select showSearch optionFilterProp="label" options={(companies ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      </Form.Item>}
      <Form.Item name="kind" label="Tipo" rules={REQUIRED}>
        <Select options={(["payment_reminder", "trial_ending", "custom"] as NoticeKind[]).map((value) => ({ value, label: NOTICE[value] }))} />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(a, b) => a.kind !== b.kind}>
        {({ getFieldValue }) => getFieldValue("kind") === "custom" && <Form.Item name="message" label="Messaggio" rules={[{ required: true, whitespace: true }]}>
          <Input.TextArea rows={4} maxLength={1000} showCount />
        </Form.Item>}
      </Form.Item>
    </>,
  });
}

/**
 * Approving or rejecting a plan request. Policy for a company that is paying:
 * an upgrade applies at once (yearly plans pay the base-fee difference for the whole months left),
 * a downgrade starts at the next renewal.
 */
function requestEditor(
  request: BillingRequest, decision: "approved" | "rejected", edit: OpenEditor, plans: Plan[], company?: BillingCompany,
) {
  const current = plans.find((p) => p.code === company?.plan_code);
  const next = plans.find((p) => p.code === request.to_plan);
  const paying = !!company && (company.state === "active" || company.state === "past_due") && !company.forever && !!company.ends_at;
  const kind = current && next && company?.billing_interval
    ? planChangeKind(current, company.billing_interval, next, request.billing_interval) : "upgrade";
  const months = remainingMonths(company?.ends_at);
  const difference = decision === "approved" && paying && kind === "upgrade" && current && next
    && company?.billing_interval === "year" && request.billing_interval === "year" ? upgradeDifference(current, next, months) : 0;

  let note = "";
  if (decision === "approved" && paying && kind === "downgrade") {
    note = ` È un downgrade: il nuovo piano parte dal rinnovo del ${day(company?.ends_at)}. Non ci sono rimborsi.`;
  } else if (decision === "approved" && paying && kind === "upgrade" && company?.billing_interval === "month") {
    note = " Il piano parte subito e il nuovo prezzo vale dalla prossima fattura mensile.";
  } else if (decision === "approved" && difference > 0) {
    note = ` Il piano parte subito. A metà anno si paga la differenza del canone per i mesi interi rimasti (${months}): ${money(difference, next?.currency)}.`;
  } else if (decision === "approved") {
    note = " Il piano viene applicato subito; emetti poi la fattura.";
  }
  const base = {
    title: decision === "approved" ? "Approva cambio piano" : "Rifiuta cambio piano",
    description: `${request.company_name}: ${planName(plans, request.from_plan)} → ${planName(plans, request.to_plan)} (${INTERVAL[request.billing_interval].toLowerCase()}).${note}`,
  };
  const reply = <Form.Item name="response" label="Messaggio per il cliente (opzionale)"><Input.TextArea rows={2} maxLength={500} /></Form.Item>;
  const reason = decision === "approved" ? "Cambio piano approvato" : "Cambio piano rifiutato";

  if (difference > 0 && current && next && company) {
    edit({
      ...base, values: { create_invoice: true, reason },
      submit: async (fields) => {
        await submitAction("handle_plan_request", { request_id: request.id, decision, response: fields.response, reason: fields.reason });
        if (fields.create_invoice) {
          await submitAction("create_invoice", {
            tenant_id: request.tenant_id, period_start: dayjs().format("YYYY-MM-DD"), period_end: dayjs(company.ends_at).format("YYYY-MM-DD"),
            status: "issued", reason: "Conguaglio upgrade",
            lines: [{ code: "upgrade", label: `Upgrade ${current.name} → ${next.name}: differenza per ${months} mesi`, quantity: 1, unit_price: difference, amount: difference }],
          });
        }
      },
      fields: <>{reply}<Form.Item name="create_invoice" label={`Emetti la fattura di conguaglio (${money(difference, next.currency)})`} valuePropName="checked"><Switch /></Form.Item></>,
    });
    return;
  }
  edit({ ...base, action: "handle_plan_request", values: { request_id: request.id, decision, reason }, fields: reply });
}

/** Cancelling: a yearly plan refunds the base fee of the whole months left, never riders or orders. */
function cancelEditor(company: Company, plan: Plan | undefined, sub: NonNullable<Snapshot["subscription"]>, edit: OpenEditor) {
  const yearly = sub.billing_interval === "year" && !sub.forever && !!sub.ends_at;
  const months = yearly ? remainingMonths(sub.ends_at) : 0;
  const paid = plan ? baseFee(plan, "year") : 0;
  const suggested = yearly ? yearlyRefund(paid, months) : 0;
  edit({
    title: "Disdici abbonamento", action: "cancel_subscription", dates: ["closeout_until"],
    values: { tenant_id: company.id, refund_amount: suggested, reason: "Disdetta richiesta dal cliente" },
    description: (yearly
      ? `Piano annuale (${money(paid, plan?.currency)}): restano ${months} mesi interi, quindi rimborso = ${money(paid, plan?.currency)} × ${months}/12 = ${money(suggested, plan?.currency)}. `
        + "Un mese iniziato conta come usato; rider e ordini extra non si rimborsano. Cambia l’importo se il canone pagato era diverso. "
      : "Piano mensile o per sempre: di norma nessun rimborso. ")
      + "L’azienda passa in sola lettura (o in chiusura incarichi fino alla data indicata). Il rimborso resta registrato tra i pagamenti.",
    fields: <>
      <Form.Item name="refund_amount" label="Rimborso (€)" extra="Non può superare quanto incassato e non ancora rimborsato.">
        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item name="closeout_until" label="Chiusura incarichi fino a (facoltativo)"><Input type="datetime-local" /></Form.Item>
    </>,
  });
}

// ----------------------------------------------------------------------------- billing hub

type Filter = "all" | "limits" | "trial" | "past_due" | "unpaid" | "none";

function atLimit(row: BillingCompany) {
  return limitLevel(row.usage.orders, row.included_orders).level === "reached"
    || limitLevel(row.usage.riders, row.included_riders).level === "reached";
}

export function Billing({ overview, snapshot, edit, openCompany }: {
  overview: BillingOverview; snapshot: Snapshot; edit: OpenEditor; openCompany: (id: string, tab?: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const { summary } = overview;
  const companies = useMemo(() => overview.companies.filter((row) => ({
    all: true, limits: atLimit(row), trial: row.state === "trial", past_due: row.state === "past_due",
    unpaid: row.unpaid > 0, none: row.state === null,
  })[filter]), [overview.companies, filter]);
  const link = (id: string, name: string) => <Button type="link" style={{ padding: 0 }} onClick={() => openCompany(id, "billing")}>{name}</Button>;

  return <>
    <PageHeader title="Fatturazione" subtitle="Abbonamenti, utilizzo, fatture, pagamenti e richieste dei clienti."
      actions={<Button onClick={() => noticeEditor(edit, undefined, overview.companies)}>Invia email</Button>} />
    <Tabs destroyOnHidden items={[
      { key: "overview", label: "Aziende", children: <Flex vertical gap={16}>
        <Row gutter={[16, 16]}>
          {([
            ["Ricavo mensile ricorrente", money(summary.mrr)], ["Prove in corso", summary.trials],
            ["In ritardo", summary.past_due], ["Da incassare", money(summary.unpaid_total)],
            ["Fatture scadute", summary.overdue_invoices], ["Richieste di piano", summary.open_requests],
          ] as [string, string | number][]).map(([title, value]) => (
            <Col key={title} xs={12} xl={4}><Card size="small"><Statistic title={title} value={value} /></Card></Col>
          ))}
        </Row>
        <Card>
          <Select<Filter> value={filter} onChange={setFilter} aria-label="Filtra aziende" style={{ width: 260, marginBottom: 16 }} options={[
            { value: "all", label: "Tutte le aziende" }, { value: "limits", label: "Limite raggiunto" },
            { value: "trial", label: "In prova" }, { value: "past_due", label: "Pagamento in ritardo" },
            { value: "unpaid", label: "Con fatture da pagare" }, { value: "none", label: "Senza abbonamento" },
          ]} />
          <Table<BillingCompany> rowKey="id" scroll={{ x: 1040 }} dataSource={companies} columns={[
            { title: "Azienda", render: (_, r) => link(r.id, r.name) },
            { title: "Piano", render: (_, r) => r.plan_name ? <Flex gap={4} wrap>
              <span>{r.plan_name}</span>
              {r.forever ? <Tag color="purple">Per sempre</Tag> : r.billing_interval && <Tag>{INTERVAL[r.billing_interval]}</Tag>}
            </Flex> : "—" },
            { title: "Stato", render: (_, r) => <Flex gap={4} wrap>
              {r.state ? <Tag>{SUBSCRIPTION[r.state]}</Tag> : <Tag>Senza abbonamento</Tag>}
              {r.access_mode !== "full" && accessTag(r.access_mode)}
            </Flex> },
            { title: "Scadenza", render: (_, r) => r.forever ? "Mai" : day(r.ends_at) },
            { title: "Ordini del mese", render: (_, r) => <UsageBar used={r.usage.orders} included={r.included_orders} /> },
            { title: "Rider", render: (_, r) => <UsageBar used={r.usage.riders} included={r.included_riders} /> },
            { title: "Da pagare", render: (_, r) => r.unpaid > 0 ? <Typography.Text type="danger">{money(r.unpaid, r.currency ?? "EUR")}</Typography.Text> : "—" },
            { title: "Ultimo pagamento", render: (_, r) => day(r.last_paid_at) },
          ]} />
        </Card>
      </Flex> },
      { key: "invoices", label: "Fatture", children: <Card><Table<BillingInvoice> rowKey="id" scroll={{ x: 900 }} dataSource={overview.invoices}
        expandable={{ expandedRowRender: (row) => <InvoiceLines lines={row.lines} /> }} columns={[
          { title: "Numero", render: (_, r) => r.external_url
            ? <a href={r.external_url} target="_blank" rel="noreferrer noopener">{r.number}</a> : r.number },
          { title: "Azienda", render: (_, r) => link(r.tenant_id, r.company_name) },
          { title: "Periodo", render: (_, r) => `${day(r.period_start)} – ${day(r.period_end)}` },
          { title: "Importo", render: (_, r) => money(r.amount, r.currency) },
          { title: "Stato", render: (_, r) => invoiceTag(r) },
          { title: "Scadenza", render: (_, r) => day(r.due_at) },
          { title: "Pagata il", render: (_, r) => day(r.paid_at) },
          { title: "Azioni", render: (_, r) => invoiceActions(r, edit) },
        ]} /></Card> },
      { key: "payments", label: "Pagamenti", children: <Card><Table rowKey="id" scroll={{ x: 560 }} dataSource={overview.payments} columns={[
        { title: "Azienda", render: (_, r) => link(r.tenant_id, r.company_name) },
        { title: "Tipo", render: (_, r) => r.kind === "refund" ? <Tag color="red">Rimborso</Tag> : <Tag color="green">Pagamento</Tag> },
        { title: "Importo", render: (_, r) => (r.kind === "refund" ? "−" : "") + money(r.amount, r.currency) },
        { title: "Riferimento", dataIndex: "reference" },
        { title: "Data", render: (_, r) => date(r.paid_at) },
      ]} /></Card> },
      { key: "requests", label: <Flex gap={6} align="center">Richieste{summary.open_requests > 0 && <Tag color="gold" style={{ margin: 0 }}>{summary.open_requests}</Tag>}</Flex>,
        children: <Card><Table<BillingRequest> rowKey="id" scroll={{ x: 800 }} dataSource={overview.requests} columns={[
          { title: "Azienda", render: (_, r) => link(r.tenant_id, r.company_name) },
          { title: "Cambio", render: (_, r) => `${planName(snapshot.plans, r.from_plan)} → ${planName(snapshot.plans, r.to_plan)} (${INTERVAL[r.billing_interval].toLowerCase()})` },
          { title: "Nota", render: (_, r) => r.note || "—" },
          { title: "Richiesta il", render: (_, r) => date(r.created_at) },
          { title: "Stato", render: (_, r) => <Tag color={REQUEST[r.status][1]}>{REQUEST[r.status][0]}</Tag> },
          { title: "Azioni", render: (_, r) => r.status === "open" && <Flex gap={6}>
            <Button size="small" type="primary" onClick={() => requestEditor(r, "approved", edit, snapshot.plans, overview.companies.find((c) => c.id === r.tenant_id))}>Approva</Button>
            <Button size="small" danger onClick={() => requestEditor(r, "rejected", edit, snapshot.plans, overview.companies.find((c) => c.id === r.tenant_id))}>Rifiuta</Button>
          </Flex> },
        ]} /></Card> },
      { key: "notices", label: "Email", children: <Card><Table<BillingNotice> rowKey="id" scroll={{ x: 640 }} dataSource={overview.notices} columns={[
        { title: "Data", render: (_, r) => date(r.created_at) },
        { title: "Azienda", render: (_, r) => link(r.tenant_id, r.company_name) },
        { title: "Tipo", render: (_, r) => NOTICE[r.kind] },
        { title: "Stato", render: (_, r) => r.sent_at ? <Tag color="green">Inviata</Tag> : r.error
          ? <Tooltip title={`Tentativi: ${r.attempts}`}><Tag color="red">{r.error}</Tag></Tooltip> : <Tag>In coda</Tag> },
      ]} /></Card> },
    ]} />
  </>;
}

// ----------------------------------------------------------------------------- company tab

export function CompanyBilling({ snapshot, company, overview, overviewFailed, edit }: {
  snapshot: Snapshot; company: Company; overview?: BillingOverview; overviewFailed: boolean; edit: OpenEditor;
}) {
  const sub = snapshot.subscription;
  const plan = snapshot.plans.find((p) => p.code === sub?.plan_code);
  const row = overview?.companies.find((c) => c.id === company.id);
  const estimate = plan && sub && row ? estimateFromPlan(plan, sub.billing_interval, row.usage) : undefined;
  const invoices = overview?.invoices.filter((i) => i.tenant_id === company.id) ?? [];
  const requests = overview?.requests.filter((r) => r.tenant_id === company.id) ?? [];

  return <Flex vertical gap={16}>
    {overviewFailed && <Alert type="warning" showIcon title="Utilizzo e fatture non disponibili: aggiorna il database con l’ultima migrazione." />}
    <Card title="Abbonamento" extra={<Flex gap={8} wrap>
      <Button onClick={() => noticeEditor(edit, company)}>Invia email</Button>
      <Button disabled={!snapshot.plans.some((p) => p.available)} onClick={() => edit({
        title: "Avvia prova", action: "start_trial", values: { tenant_id: company.id, plan_code: plan?.code, days: 14, reason: "Prova gratuita" },
        description: "Il cliente ha accesso completo per i giorni indicati. Alla scadenza passa in sola lettura se non attivi un abbonamento.",
        fields: <>
          <Form.Item name="plan_code" label="Piano" rules={REQUIRED}>
            <Select options={snapshot.plans.filter((p) => p.available).map((p) => ({ value: p.code, label: p.name }))} />
          </Form.Item>
          <Form.Item name="days" label="Giorni" rules={REQUIRED}><InputNumber min={1} max={365} precision={0} style={{ width: "100%" }} /></Form.Item>
        </>,
      })}>Avvia prova</Button>
      {sub && ["trial", "active", "past_due"].includes(sub.state) && <Button danger onClick={() => cancelEditor(company, plan, sub, edit)}>Disdici</Button>}
      <Button type="primary" disabled={!snapshot.plans.some((p) => p.available || p.code === sub?.plan_code)}
        onClick={() => subscriptionEditor(company, snapshot, edit)}>Modifica abbonamento</Button>
    </Flex>}>
      <Descriptions size="small" column={{ xs: 1, md: 2 }} items={[
        { key: "plan", label: "Piano", children: plan?.name ?? "Senza piano (accesso completo)" },
        { key: "status", label: "Stato", children: <Flex gap={6}>
          {sub ? SUBSCRIPTION[sub.state] : "—"}{sub?.forever && <Tag color="purple">Per sempre</Tag>}
        </Flex> },
        { key: "interval", label: "Fatturazione", children: sub ? INTERVAL[sub.billing_interval] : "—" },
        ...(sub?.next_plan_code ? [{ key: "next", label: "Cambio programmato", children:
          `${planName(snapshot.plans, sub.next_plan_code)} (${INTERVAL[sub.next_billing_interval ?? "month"].toLowerCase()}) dal rinnovo del ${day(sub.ends_at)}` }] : []),
        { key: "ends", label: "Data fine o rinnovo", children: sub?.forever ? "Nessuna scadenza" : date(sub?.ends_at ?? null) },
        { key: "grace", label: "Tolleranza fino a", children: date(sub?.grace_until ?? null) },
        { key: "closeout", label: "Chiusura incarichi fino a", children: date(sub?.closeout_until ?? null) },
        { key: "email", label: "Email fatturazione", children: sub?.billing_email ?? "—" },
        { key: "notes", label: "Note interne", children: sub?.notes || "—" },
      ]} />
    </Card>

    {row && sub && plan && <Card title="Utilizzo del mese" extra={<Button disabled={!estimate} onClick={() => estimate && invoiceEditor(company, edit,
      estimate.lines.map((line) => ({ label: lineLabel(line, plan, sub.billing_interval), quantity: line.quantity, unit_price: line.unit_price })))}>
      Crea fattura dalla stima</Button>}>
      <Row gutter={[24, 12]}>
        <Col xs={24} md={8}><Typography.Text type="secondary">Ordini ({day(row.usage.period_start)} – {day(row.usage.period_end)})</Typography.Text>
          <UsageBar used={row.usage.orders} included={row.included_orders} /></Col>
        <Col xs={24} md={8}><Typography.Text type="secondary">Rider attivi nell’account</Typography.Text>
          <UsageBar used={row.usage.riders} included={row.included_riders} />
          <Typography.Text type="secondary">{row.usage.active_riders} con almeno un ordine questo mese</Typography.Text></Col>
        <Col xs={24} md={8}>{estimate && <><Typography.Text type="secondary">Stima del mese</Typography.Text>
          <div><Typography.Text strong style={{ fontSize: 20 }}>{money(estimate.total, estimate.currency)}</Typography.Text></div></>}</Col>
      </Row>
      {estimate && estimate.lines.length > 1 && <Table size="small" style={{ marginTop: 16 }} pagination={false} rowKey="code" dataSource={estimate.lines} columns={[
        { title: "Voce", render: (_, l) => lineLabel(l, plan, sub.billing_interval) },
        { title: "Importo", render: (_, l) => money(l.amount, estimate.currency), width: 120 },
      ]} />}
    </Card>}

    <Card title="Fatture" extra={<Button disabled={!overview} onClick={() => invoiceEditor(company, edit, [])}>Nuova fattura</Button>}>
      <Table<BillingInvoice> rowKey="id" scroll={{ x: 760 }} dataSource={invoices}
        expandable={{ expandedRowRender: (r) => <InvoiceLines lines={r.lines} /> }} columns={[
          { title: "Numero", render: (_, r) => r.external_url
            ? <a href={r.external_url} target="_blank" rel="noreferrer noopener">{r.number}</a> : r.number },
          { title: "Periodo", render: (_, r) => `${day(r.period_start)} – ${day(r.period_end)}` },
          { title: "Importo", render: (_, r) => money(r.amount, r.currency) },
          { title: "Stato", render: (_, r) => invoiceTag(r) },
          { title: "Scadenza", render: (_, r) => day(r.due_at) },
          { title: "Azioni", render: (_, r) => invoiceActions(r, edit) },
        ]} />
    </Card>

    {requests.length > 0 && <Card title="Richieste di cambio piano"><Table<BillingRequest> rowKey="id" pagination={false} scroll={{ x: 560 }} dataSource={requests} columns={[
      { title: "Cambio", render: (_, r) => `${planName(snapshot.plans, r.from_plan)} → ${planName(snapshot.plans, r.to_plan)} (${INTERVAL[r.billing_interval].toLowerCase()})` },
      { title: "Nota", render: (_, r) => r.note || "—" },
      { title: "Stato", render: (_, r) => <Tag color={REQUEST[r.status][1]}>{REQUEST[r.status][0]}</Tag> },
      { title: "Azioni", render: (_, r) => r.status === "open" && <Flex gap={6}>
        <Button size="small" type="primary" onClick={() => requestEditor(r, "approved", edit, snapshot.plans, row)}>Approva</Button>
        <Button size="small" danger onClick={() => requestEditor(r, "rejected", edit, snapshot.plans, row)}>Rifiuta</Button>
      </Flex> },
    ]} /></Card>}

    <Card title="Pagamenti registrati" extra={<Button onClick={() => edit({
      title: "Registra pagamento", action: "record_payment", dates: ["paid_at"],
      values: { tenant_id: company.id, currency: "EUR", paid_at: dayjs().format(DATE) },
      description: "Per un pagamento legato a una fattura usa “Segna pagata” nella tabella delle fatture.",
      fields: <>
        <Form.Item name="amount" label="Importo" rules={REQUIRED}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="currency" label="Valuta" rules={[{ required: true, pattern: /^[A-Za-z]{3}$/ }]}><Input maxLength={3} /></Form.Item>
        <Form.Item name="reference" label="Riferimento" rules={[{ required: true, whitespace: true, max: 120 }]}><Input /></Form.Item>
        <Form.Item name="paid_at" label="Data pagamento" rules={REQUIRED}><Input type="datetime-local" /></Form.Item>
      </>,
    })}>Registra pagamento</Button>}>
      <Table rowKey="id" scroll={{ x: 500 }} dataSource={overview ? overview.payments.filter((p) => p.tenant_id === company.id)
        : snapshot.payments.map((p) => ({ ...p, kind: "payment" as const, tenant_id: company.id, company_name: company.name }))} columns={[
        { title: "Riferimento", dataIndex: "reference" },
        { title: "Tipo", render: (_, r) => r.kind === "refund" ? <Tag color="red">Rimborso</Tag> : <Tag color="green">Pagamento</Tag> },
        { title: "Importo", render: (_, r) => (r.kind === "refund" ? "−" : "") + money(r.amount, r.currency) },
        { title: "Data", render: (_, r) => date(r.paid_at) },
      ]} />
    </Card>
  </Flex>;
}

/** Removing a company is only possible when it is suspended and has no billing history. */
export function DeleteCompanyButton({ company, edit, onDeleted }: { company: Company; edit: OpenEditor; onDeleted: () => void }) {
  return <Tooltip title={company.is_active ? "Sospendi prima l’azienda" : undefined}>
    <Button danger disabled={company.is_active} onClick={() => edit({
      title: "Rimuovi azienda", values: { reason: "Rimozione richiesta dal cliente" },
      description: "Elimina in modo definitivo l’azienda, i suoi ordini, i membri e i loro account. Non si può annullare. "
        + "Le aziende con fatture o pagamenti non possono essere rimosse: vanno conservate per la contabilità, quindi lasciale sospese.",
      submit: async (fields) => {
        await submitAction("delete_company", { tenant_id: company.id, confirm_slug: fields.confirm_slug, reason: fields.reason });
        onDeleted();
      },
      fields: <Form.Item name="confirm_slug" label={`Per confermare scrivi “${company.slug}”`} rules={[{ required: true }]}><Input autoComplete="off" /></Form.Item>,
    })}>Rimuovi</Button>
  </Tooltip>;
}
