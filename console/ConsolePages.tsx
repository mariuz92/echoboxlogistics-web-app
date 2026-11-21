import { useState, type ReactNode } from "react";
import {
  App, Button, Card, Col, Descriptions, Flex, Form, Input, InputNumber, Modal, Row,
  Select, Statistic, Switch, Table, Tabs, Tag, Typography,
} from "antd";
import dayjs from "dayjs";
import type { Json } from "../src/types/database.types";
import { PageHeader } from "../src/shared/components/PageHeader";
import {
  actionError, sendInvite, submitAction, type AccessMode, type Action, type Company,
  type Snapshot, type SubscriptionState,
} from "../src/features/platform/api";
import { CompanyOperations, IssueQueue, IssueTable } from "./ConsoleSupport";

type Values = Record<string, Json | undefined>;
type Editor = {
  title: string;
  values?: Values;
  fields?: ReactNode;
  description?: string;
  dates?: string[];
  reasonLabel?: string;
} & ({ action: Action; send?: boolean } | { submit: (fields: Values) => Promise<void> });
export type OpenEditor = (editor: Editor) => void;

const REQUIRED = [{ required: true }];
const DATE = "YYYY-MM-DDTHH:mm";
const date = (value: string | null) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—";
const dateInput = (value: string | null | undefined) => value ? dayjs(value).format(DATE) : undefined;
const label = (value: string) => value.replaceAll("_", " ");

const ACCESS: Record<AccessMode, [string, string]> = {
  full: ["Attiva", "green"],
  closeout: ["Chiusura incarichi", "gold"],
  read_only: ["Sola lettura", "orange"],
  suspended: ["Sospesa", "red"],
};
const SUBSCRIPTION: Record<SubscriptionState, string> = {
  trial: "Prova", active: "Attivo", past_due: "Pagamento in ritardo", expired: "Scaduto", cancelled: "Annullato",
};
function accessTag(mode: AccessMode) {
  return <Tag color={ACCESS[mode][1]}>{ACCESS[mode][0]}</Tag>;
}

export function ActionEditor({ editor, close, refresh }: { editor: Editor; close: () => void; refresh: () => void }) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  async function submit(fields: Values) {
    setSaving(true);
    setFailure("");
    try {
      for (const key of editor.dates ?? []) {
        if (typeof fields[key] === "string" && fields[key]) fields[key] = new Date(fields[key]).toISOString();
      }
      const values = { ...editor.values, ...fields };
      const result = "submit" in editor ? await editor.submit(values) : await submitAction(editor.action, values);
      close();
      if ("send" in editor && editor.send && result?.invitation_id) {
        await notifyInvite(result.invitation_id, message);
      } else {
        void message.success("Modifica salvata");
      }
    } catch (error) {
      setFailure(actionError(error));
    } finally {
      setSaving(false);
      refresh();
    }
  }

  return (
    <Modal title={editor.title} open footer={null} onCancel={saving ? undefined : close} maskClosable={!saving}>
      {editor.description && <Typography.Paragraph type="secondary">{editor.description}</Typography.Paragraph>}
      <Form layout="vertical" initialValues={editor.values} onFinish={submit} scrollToFirstError>
        {editor.fields}
        <Form.Item name="reason" label={editor.reasonLabel ?? "Motivo della modifica"} rules={[{ required: true, whitespace: true, max: 500 }]}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        {failure && <Typography.Paragraph type="danger" role="alert">{failure}</Typography.Paragraph>}
        <Flex justify="end" gap={8}>
          <Button disabled={saving} onClick={close}>Annulla</Button>
          <Button type="primary" htmlType="submit" loading={saving}>Salva</Button>
        </Flex>
      </Form>
    </Modal>
  );
}

async function notifyInvite(id: string, message: ReturnType<typeof App.useApp>["message"]) {
  try {
    const result = await sendInvite(id);
    if (result === "sent") void message.success("Invito inviato");
    else if (result === "existing_account") void message.info("Invito salvato. La persona può accedere all’app e completarlo con il suo account.");
    else void message.warning("Invito salvato. L’email non è stata inviata.");
  } catch (error) {
    void message.error(actionError(error));
  }
}

export function Overview({ snapshot, openIssue, openQueue }: {
  snapshot: Snapshot; openIssue: (id: string) => void; openQueue: () => void;
}) {
  const { summary } = snapshot;
  return <>
    <PageHeader title="Panoramica" subtitle="Attività delle aziende e problemi da verificare." />
    <Row gutter={[16, 16]}>
      {[
        ["Aziende", summary.companies], ["Inviti in attesa", summary.pending_invites],
        ["Ritiri in ritardo", summary.overdue_pickups], ["Problemi aperti", summary.issues],
      ].map(([title, value]) => (
        <Col key={title} xs={12} xl={6}><Card size="small"><Statistic title={title} value={value} /></Card></Col>
      ))}
    </Row>
    <Card title="Problemi recenti" extra={<Button type="link" onClick={openQueue}>Apri coda</Button>} style={{ marginTop: 16 }}>
      <IssueTable issues={snapshot.issues.slice(0, 5)} openIssue={openIssue} pagination={false} compact />
    </Card>
  </>;
}

export function Companies({
  userId, snapshot, company, onCompany, search, onSearch, openEditor, refresh, tab, onTab, openIssue, openOrderHistory,
}: {
  userId: string; snapshot: Snapshot; company?: Company; onCompany: (id?: string) => void;
  search?: string; onSearch: (value: string) => void;
  openEditor: OpenEditor; refresh: () => void;
  tab: string; onTab: (tab: string) => void; openIssue: (id: string) => void; openOrderHistory: (orderId: string) => void;
}) {
  const { message } = App.useApp();
  const [sending, setSending] = useState<string>();
  if (!company) return <>
    <PageHeader title="Aziende" subtitle="Accesso, persone e attività per azienda." actions={
      <Button type="primary" onClick={() => openEditor({
        title: "Crea azienda", action: "create_company", send: true, values: { timezone: "Europe/Rome" },
        fields: <>
          <Form.Item name="name" label="Nome azienda" rules={[{ required: true, whitespace: true, min: 2, max: 120 }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email del titolare" rules={[{ required: true, type: "email", max: 254 }]}><Input /></Form.Item>
          <Form.Item name="timezone" label="Fuso orario" rules={REQUIRED}><Input placeholder="Europe/Rome" /></Form.Item>
        </>,
      })}>Crea azienda</Button>
    } />
    <Card>
      <Input.Search key={search} allowClear aria-label="Cerca azienda" placeholder="Cerca per nome o slug"
        defaultValue={search} maxLength={120} onSearch={onSearch} style={{ maxWidth: 360, marginBottom: 16 }} />
      <Table rowKey="id" scroll={{ x: 640 }} dataSource={snapshot.companies} columns={[
        { title: "Azienda", render: (_, row) => <Button type="link" onClick={() => onCompany(row.id)}>{row.name}</Button> },
        { title: "Slug", dataIndex: "slug" },
        { title: "Accesso", render: (_, row) => accessTag(row.access_mode) },
        { title: "Piano", dataIndex: "plan_code", render: (value: string | null) => value ?? "—" },
        { title: "Abbonamento", render: (_, row) => row.subscription_state ? SUBSCRIPTION[row.subscription_state] : "—" },
      ]} />
    </Card>
  </>;

  async function retry(id: string) {
    setSending(id);
    try { await notifyInvite(id, message); }
    finally { setSending(undefined); refresh(); }
  }

  return <>
    <PageHeader title={company.name} subtitle={<>{company.slug} · {company.timezone} {accessTag(company.access_mode)}</>} actions={
      <>
        <Button onClick={() => onCompany()}>Tutte le aziende</Button>
        <Button danger={company.is_active} onClick={() => openEditor({
          title: company.is_active ? "Sospendi azienda" : "Riattiva azienda",
          action: "set_company_active", values: { tenant_id: company.id, active: !company.is_active },
          description: company.is_active
            ? "La sospensione blocca le prenotazioni e l’accesso tramite Supabase. Verifica gli incarichi in corso prima di procedere."
            : "La riattivazione ripristina l’accesso previsto dall’abbonamento.",
        })}>{company.is_active ? "Sospendi" : "Riattiva"}</Button>
      </>
    } />
    <Tabs key={company.id} activeKey={tab} onChange={onTab} destroyOnHidden items={[
      { key: "people", label: "Persone e inviti", children: <Flex vertical gap={16}>
        <Card title="Membri" extra={<Button type="primary" disabled={company.access_mode !== "full"} onClick={() => openEditor({
          title: "Invita membro", action: "invite_member", send: true, values: { tenant_id: company.id, role: "admin" },
          fields: <>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", max: 254 }]}><Input /></Form.Item>
            <Form.Item name="role" label="Ruolo" rules={REQUIRED}>
              <Select options={[{ value: "admin", label: "Amministratore" }, { value: "rider", label: "Rider" }]} />
            </Form.Item>
          </>,
        })}>Invita membro</Button>}>
          <Table rowKey="id" scroll={{ x: 760 }} dataSource={snapshot.members} columns={[
            { title: "Nome", render: (_, row) => row.full_name || row.email },
            { title: "Email", dataIndex: "email" },
            { title: "Ruoli", render: (_, row) => <Flex gap={4} wrap>
              {row.id === company.owner_id && <Tag color="blue">Titolare</Tag>}
              {row.roles.map((role) => <Tag key={role}>{role === "admin" ? "Amministratore" : "Rider"}</Tag>)}
            </Flex> },
            { title: "Stato", render: (_, row) => <Tag color={row.disabled ? "red" : "green"}>{row.disabled ? "Disabilitato" : "Attivo"}</Tag> },
            { title: "Azioni", render: (_, row) => row.id !== company.owner_id && <Flex gap={6} wrap>
              <Button size="small" danger={!row.disabled} onClick={() => openEditor({
                title: row.disabled ? "Abilita membro" : "Disabilita membro", action: "set_member_enabled",
                values: { tenant_id: company.id, user_id: row.id, enabled: row.disabled },
              })}>{row.disabled ? "Abilita" : "Disabilita"}</Button>
              {row.roles.includes("admin") && !row.disabled && <Button size="small" onClick={() => openEditor({
                title: "Assegna proprietà", action: "transfer_owner",
                values: { tenant_id: company.id, user_id: row.id },
                description: `Conferma il trasferimento della proprietà a ${row.email}.`,
              })}>Assegna proprietà</Button>}
            </Flex> },
          ]} />
        </Card>
        <Card title="Inviti">
          <Table rowKey="id" scroll={{ x: 650 }} dataSource={snapshot.invitations} columns={[
            { title: "Email", dataIndex: "email" },
            { title: "Ruolo", render: (_, row) => row.for_owner ? "Titolare" : row.roles.join(", ") },
            { title: "Stato", render: (_, row) => row.accepted_at ? "Accettato" :
              dayjs(row.expires_at).isBefore(dayjs()) ? "Scaduto" : ({
                sent: "Email inviata", failed: "Invio non riuscito", sending: "In invio",
                existing_account: "Account già registrato", pending: "Da inviare",
              }[row.delivery_state ?? ""] ?? "In attesa") },
            { title: "Scadenza", render: (_, row) => date(row.expires_at) },
            { title: "Azioni", render: (_, row) => !row.accepted_at && <Flex gap={6} wrap>
              {row.delivery_state && <Button size="small" loading={sending === row.id}
                disabled={company.access_mode !== "full" || dayjs(row.expires_at).isBefore(dayjs())}
                onClick={() => void retry(row.id)}>Invia di nuovo</Button>}
              {row.delivery_state && dayjs(row.expires_at).isBefore(dayjs()) && <Button size="small"
                disabled={company.access_mode !== "full"} onClick={() => openEditor({
                  title: "Rinnova invito", action: "renew_invitation", values: { invitation_id: row.id }, send: true,
                })}>Rinnova</Button>}
              <Button size="small" danger onClick={() => openEditor({
                title: "Revoca invito", action: "revoke_invitation",
                values: { invitation_id: row.id }, description: row.email,
              })}>Revoca</Button>
            </Flex> },
          ]} />
        </Card>
      </Flex> },
      { key: "billing", label: "Abbonamento", children: <CompanyBilling snapshot={snapshot} company={company} edit={openEditor} /> },
      { key: "operations", label: "Operazioni", children: <CompanyOperations orders={snapshot.orders} company={company} openOrder={openOrderHistory} /> },
      { key: "issues", label: "Problemi", children: <IssueQueue userId={userId} tenantId={company.id} openIssue={openIssue} /> },
      { key: "audit", label: "Audit", children: <Card><AuditTable snapshot={snapshot} /></Card> },
    ]} />
  </>;
}

function CompanyBilling({ snapshot, company, edit }: { snapshot: Snapshot; company: Company; edit: OpenEditor }) {
  const sub = snapshot.subscription;
  const dates = ["ends_at", "grace_until", "closeout_until"];
  return <Flex vertical gap={16}>
    <Card title="Abbonamento" extra={<Button type="primary"
      disabled={!snapshot.plans.some((plan) => plan.available || plan.code === sub?.plan_code)}
      onClick={() => edit({
        title: "Modifica abbonamento", action: "save_subscription", dates,
        values: { tenant_id: company.id, state: sub?.state ?? "active", plan_code: sub?.plan_code,
          ends_at: dateInput(sub?.ends_at), grace_until: dateInput(sub?.grace_until),
          closeout_until: dateInput(sub?.closeout_until), billing_email: sub?.billing_email },
        description: "Le date sono mostrate nel fuso orario del tuo dispositivo.",
        fields: <>
          <Form.Item name="plan_code" label="Piano" rules={REQUIRED}>
            <Select options={snapshot.plans.filter((p) => p.available || p.code === sub?.plan_code)
              .map((p) => ({ label: p.name, value: p.code }))} />
          </Form.Item>
          <Form.Item name="state" label="Stato" rules={REQUIRED}>
            <Select options={Object.entries(SUBSCRIPTION).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="billing_email" label="Email fatturazione" rules={[{ type: "email", max: 254 }]}><Input /></Form.Item>
          <Form.Item name="ends_at" label="Data fine o rinnovo"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="grace_until" label="Periodo di tolleranza fino a"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="closeout_until" label="Chiusura incarichi fino a"><Input type="datetime-local" /></Form.Item>
        </>,
      })}>Modifica abbonamento</Button>}>
      <Descriptions size="small" column={{ xs: 1, md: 2 }} items={[
        { key: "plan", label: "Piano", children: snapshot.plans.find((p) => p.code === sub?.plan_code)?.name ?? "Senza piano" },
        { key: "status", label: "Stato", children: sub ? SUBSCRIPTION[sub.state] : "—" },
        { key: "ends", label: "Data fine o rinnovo", children: date(sub?.ends_at ?? null) },
        { key: "grace", label: "Tolleranza fino a", children: date(sub?.grace_until ?? null) },
        { key: "closeout", label: "Chiusura incarichi fino a", children: date(sub?.closeout_until ?? null) },
        { key: "email", label: "Email fatturazione", children: sub?.billing_email ?? "—" },
      ]} />
    </Card>
    <Card title="Pagamenti registrati" extra={<Button onClick={() => edit({
      title: "Registra pagamento", action: "record_payment", dates: ["paid_at"],
      values: { tenant_id: company.id, currency: "EUR", paid_at: dayjs().format(DATE) },
      fields: <>
        <Form.Item name="amount" label="Importo" rules={REQUIRED}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="currency" label="Valuta" rules={[{ required: true, pattern: /^[A-Za-z]{3}$/ }]}><Input maxLength={3} /></Form.Item>
        <Form.Item name="reference" label="Riferimento" rules={[{ required: true, whitespace: true, max: 120 }]}><Input /></Form.Item>
        <Form.Item name="paid_at" label="Data pagamento" rules={REQUIRED}><Input type="datetime-local" /></Form.Item>
      </>,
    })}>Registra pagamento</Button>}>
      <Table rowKey="id" scroll={{ x: 500 }} dataSource={snapshot.payments} columns={[
        { title: "Riferimento", dataIndex: "reference" },
        { title: "Importo", render: (_, row) => new Intl.NumberFormat("it-IT", { style: "currency", currency: row.currency }).format(row.amount) },
        { title: "Data", render: (_, row) => date(row.paid_at) },
      ]} />
    </Card>
  </Flex>;
}

export function Plans({ snapshot, edit }: { snapshot: Snapshot; edit: OpenEditor }) {
  function open(plan?: Snapshot["plans"][number]) {
    edit({
      action: "save_plan", title: plan ? "Modifica piano" : "Crea piano",
      values: plan ? { ...plan } : { available: true },
      fields: <>
        <Form.Item name="code" label="Codice" rules={[{ required: true, pattern: /^[a-z][a-z0-9_-]{1,39}$/ }]}><Input disabled={!!plan} /></Form.Item>
        <Form.Item name="name" label="Nome" rules={[{ required: true, whitespace: true, min: 2, max: 80 }]}><Input /></Form.Item>
        <Form.Item name="available" label="Disponibile" valuePropName="checked"><Switch /></Form.Item>
      </>,
    });
  }

  return <>
    <PageHeader title="Piani" subtitle="Piani assegnabili agli abbonamenti aziendali." actions={<Button type="primary" onClick={() => open()}>Crea piano</Button>} />
    <Card><Table rowKey="code" dataSource={snapshot.plans} columns={[
      { title: "Nome", dataIndex: "name" }, { title: "Codice", dataIndex: "code" },
      { title: "Disponibilità", render: (_, row) => <Tag color={row.available ? "green" : "default"}>{row.available ? "Disponibile" : "Archiviato"}</Tag> },
      { title: "Azioni", render: (_, row) => <Button size="small" onClick={() => open(row)}>Modifica</Button> },
    ]} /></Card>
  </>;
}

export function Contacts({ snapshot, edit }: { snapshot: Snapshot; edit: OpenEditor }) {
  return <>
    <PageHeader title="Messaggi" subtitle="Richieste ricevute dal sito EchoBox." />
    <Card><Table rowKey="id" scroll={{ x: 680 }} dataSource={snapshot.contacts} expandable={{
      expandedRowRender: (row) => <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{row.message}</Typography.Paragraph>,
    }} columns={[
      { title: "Mittente", render: (_, row) => <Flex vertical><Typography.Text>{row.name}</Typography.Text><Typography.Text type="secondary">{row.email}</Typography.Text></Flex> },
      { title: "Azienda", render: (_, row) => row.company ?? "—" },
      { title: "Ricevuto", render: (_, row) => date(row.created_at) },
      { title: "Notifica email", render: (_, row) => row.mail_failed ? <Tag color="red">Invio fallito</Tag> : row.emailed_at ? "Inviata" : "—" },
      { title: "Stato", render: (_, row) => <Tag color={row.handled ? "green" : "gold"}>{row.handled ? "Gestito" : "Da gestire"}</Tag> },
      { title: "Azioni", render: (_, row) => <Button size="small" onClick={() => edit({
        action: "handle_contact", title: row.handled ? "Riapri messaggio" : "Segna come gestito",
        values: { contact_id: row.id, handled: !row.handled },
      })}>{row.handled ? "Riapri" : "Segna come gestito"}</Button> },
    ]} /></Card>
  </>;
}

export function AuditTable({ snapshot }: { snapshot: Snapshot }) {
  return <Table rowKey="id" scroll={{ x: 720 }} dataSource={snapshot.audit} expandable={{
    expandedRowRender: (row) => <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {JSON.stringify({ prima: row.before_state, dopo: row.after_state }, null, 2)}
    </pre>,
  }} columns={[
    { title: "Data", render: (_, row) => date(row.created_at) },
    { title: "Operatore", render: (_, row) => row.actor_email ?? row.actor_id },
    { title: "Azione", render: (_, row) => label(row.action) },
    { title: "Azienda", render: (_, row) => row.tenant_id ?? "—" },
    { title: "Motivo", dataIndex: "reason" },
  ]} />;
}

export function PlatformSettings({ snapshot, edit }: { snapshot: Snapshot; edit: OpenEditor }) {
  const settings = snapshot.settings;
  return <>
    <PageHeader title="Configurazione" subtitle="Impostazioni applicate a tutte le aziende." actions={
      <Button type="primary" onClick={() => edit({
        action: "save_settings", title: "Modifica configurazione", values: { ...settings },
        fields: <>
          <Form.Item label="Creazione aziende solo dalla console" name="operator_only_companies" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="Sospendi tutte le prenotazioni pubbliche" name="booking_paused" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="Avviso nell’app web" name="notice"><Input.TextArea maxLength={500} rows={3} /></Form.Item>
        </>,
      })}>Modifica</Button>
    } />
    <Card><Descriptions column={1} items={[
      { key: "onboarding", label: "Creazione aziende solo dalla console", children: settings.operator_only_companies ? "Attiva" : "Disattiva" },
      { key: "booking", label: "Prenotazioni pubbliche", children: settings.booking_paused ? "Sospese" : "Disponibili secondo le impostazioni aziendali" },
      { key: "notice", label: "Avviso nell’app", children: settings.notice || "—" },
    ]} /></Card>
  </>;
}

export function Operators({ snapshot, userId, edit }: { snapshot: Snapshot; userId: string; edit: OpenEditor }) {
  return <>
    <PageHeader title="Operatori" subtitle="Account autorizzati ad accedere alla console." actions={
      <Button type="primary" onClick={() => edit({
        action: "set_operator", title: "Aggiungi operatore", values: { enabled: true },
        description: "Usa l’indirizzo di un account EchoBox già verificato. La verifica in due passaggi è obbligatoria.",
        fields: <Form.Item name="email" label="Email" rules={[{ type: "email", required: true }]}><Input /></Form.Item>,
      })}>Aggiungi operatore</Button>
    } />
    <Card><Table rowKey="user_id" scroll={{ x: 480 }} dataSource={snapshot.operators} columns={[
      { title: "Account", dataIndex: "email" },
      { title: "Aggiunto", render: (_, row) => date(row.created_at) },
      { title: "Stato", render: (_, row) => <Tag color={row.enabled ? "green" : "red"}>{row.enabled ? "Attivo" : "Disabilitato"}</Tag> },
      { title: "Azioni", render: (_, row) => row.user_id !== userId && <Button size="small" danger={row.enabled} onClick={() => edit({
        action: "set_operator", title: row.enabled ? "Disabilita operatore" : "Abilita operatore",
        values: { email: row.email, enabled: !row.enabled }, description: row.email,
      })}>{row.enabled ? "Disabilita" : "Abilita"}</Button> },
    ]} /></Card>
  </>;
}
