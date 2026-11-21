import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Button, Card, Descriptions, Drawer, Empty, Flex, Form, Input, Segmented, Select, Space, Table, Tag, Timeline, Typography } from "antd";
import type { TableProps } from "antd";
import { useQuery } from "@tanstack/react-query";
import { fmtDateTime } from "../src/lib/dates";
import { StatusTag } from "../src/shared/components/StatusTag";
import { SectionSpinner } from "../src/shared/components/Screens";
import { isPickupOverdue, needsAssignment } from "../src/features/orders/orderActions";
import {
  actionError, getIssueDetail, getIssueQueue, getOrderHistory, ISSUE_PAGE_SIZE, updateIssue,
  type Company, type Issue, type IssueFilters, type IssueSeverity, type IssueSource, type OperationalOrder, type Snapshot,
} from "../src/features/platform/api";
import type { OpenEditor } from "./ConsolePages";

const STATES = { open: "Aperto", investigating: "In verifica", resolved: "Risolto" };
const SEVERITIES = { info: "Informativo", warning: "Avviso", critical: "Critico" };
const SOURCES = { web: "Web", flutter: "Flutter", backend: "Backend" };
const FILTER_STATES = { active: "Da gestire", ...STATES, all: "Tutti gli stati" };
const stateColors = { open: "gold", investigating: "blue", resolved: "green" };
const severityColors: Record<IssueSeverity, string> = { info: "blue", warning: "gold", critical: "red" };
const maxIssuePage = Math.floor(2_147_483_647 / ISSUE_PAGE_SIZE) + 1;
const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const validFilter = <T extends string>(labels: Record<T, string>, value: string | null): T | undefined =>
  value && Object.hasOwn(labels, value) ? value as T : undefined;

type IssueRow = Issue & { assignee_email?: string | null };

export function IssueTable({ issues, openIssue, pagination, loading, compact }: {
  issues: IssueRow[];
  openIssue: (id: string) => void;
  pagination: TableProps<IssueRow>["pagination"];
  loading?: boolean;
  compact?: boolean;
}) {
  return <Table<IssueRow> rowKey="id" scroll={{ x: compact ? 740 : 900 }} dataSource={issues}
    loading={loading} pagination={pagination} locale={{ emptyText: "Nessuna segnalazione" }} columns={[
      { title: "Problema", render: (_, row) => <Button type="link" size="small" onClick={() => openIssue(row.id)}
        style={{ paddingInline: 0 }}><Typography.Text code>{row.code}</Typography.Text></Button> },
      { title: "Origine", render: (_, row) => [SOURCES[row.source], row.area, row.build].filter(Boolean).join(" · ") },
      { title: "Azienda", render: (_, row) => row.company_name ?? "—" },
      ...(!compact ? [{ title: "Assegnato a", dataIndex: "assignee_email", render: (value: string | null) => value ?? "—" }] : []),
      { title: "Occorrenze", dataIndex: "occurrences" },
      { title: "Ultima attività", render: (_, row) => fmtDateTime(row.last_seen_at) },
      { title: "Gravità", render: (_, row) => <Tag color={severityColors[row.severity]}>{SEVERITIES[row.severity]}</Tag> },
      { title: "Stato", render: (_, row) => <Tag color={stateColors[row.state]}>{STATES[row.state]}</Tag> },
    ]} />;
}

export function IssueQueue({ userId, tenantId, openIssue }: {
  userId: string; tenantId?: string; openIssue: (id: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const filters: IssueFilters = {
    state: validFilter(FILTER_STATES, params.get("state")) ?? "active",
    source: validFilter(SOURCES, params.get("source")),
    severity: validFilter(SEVERITIES, params.get("severity")),
    search: params.get("q")?.trim().slice(0, 120) || undefined,
  };
  const [draft, setDraft] = useState(filters.search ?? "");
  const pageValue = Number(params.get("page"));
  const page = Number.isInteger(pageValue) && pageValue > 0 && pageValue <= maxIssuePage ? pageValue : 1;
  const query = useQuery({
    queryKey: ["platform", userId, "issues", tenantId, filters, page],
    queryFn: () => getIssueQueue(filters, page, tenantId),
    refetchInterval: 60_000,
    retry: false,
  });
  const total = query.data?.total;

  useEffect(() => setDraft(filters.search ?? ""), [filters.search]);
  useEffect(() => {
    if (total === undefined || params.has("issue")) return;
    const lastPage = Math.max(1, Math.ceil(total / ISSUE_PAGE_SIZE));
    if (page <= lastPage) return;
    const next = new URLSearchParams(params);
    if (lastPage === 1) next.delete("page");
    else next.set("page", String(lastPage));
    setParams(next, { replace: true });
  }, [page, params, setParams, total]);

  function changeFilter(key: "q" | "state" | "source" | "severity", value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  function changePage(value: number) {
    const next = new URLSearchParams(params);
    if (value === 1) next.delete("page");
    else next.set("page", String(value));
    setParams(next);
  }

  return <Card styles={{ body: { padding: 16 } }}>
    <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
      <Input.Search allowClear aria-label="Cerca problemi" placeholder="Codice, azienda o riferimento" maxLength={120} value={draft}
        onChange={(event) => setDraft(event.target.value)} onSearch={(search) => changeFilter("q", search.trim())}
        style={{ width: 280, maxWidth: "100%" }} />
      <Select<IssueFilters["state"]> aria-label="Stato dei problemi" value={filters.state} style={{ minWidth: 150 }}
        options={options(FILTER_STATES)} onChange={(state) => changeFilter("state", state === "active" ? undefined : state)} />
      <Select<IssueSource> allowClear aria-label="Origine dei problemi" placeholder="Tutte le origini" value={filters.source} style={{ minWidth: 150 }}
        options={options(SOURCES)} onChange={(source) => changeFilter("source", source)} />
      <Select<IssueSeverity> allowClear aria-label="Gravità dei problemi" placeholder="Tutte le gravità" value={filters.severity} style={{ minWidth: 150 }}
        options={options(SEVERITIES)} onChange={(severity) => changeFilter("severity", severity)} />
    </Flex>
    {query.isError ? <LoadError error={query.error} retry={() => void query.refetch()} /> :
      <IssueTable issues={query.data?.issues ?? []} openIssue={openIssue} loading={query.isPending}
        pagination={{ current: page, total, pageSize: ISSUE_PAGE_SIZE, showSizeChanger: false, onChange: changePage }} />}
  </Card>;
}

export function IssueDrawer({ userId, issueId, operators, close, openCompany, edit }: {
  userId: string; issueId: string; operators: Snapshot["operators"]; close: () => void;
  openCompany: (id: string) => void; edit: OpenEditor;
}) {
  const query = useQuery({
    queryKey: ["platform", userId, "issue", issueId], queryFn: () => getIssueDetail(issueId),
    refetchInterval: 60_000, retry: false,
  });
  const issue = query.data?.issue;
  const tenantId = issue?.tenant_id;
  return <Drawer open onClose={close} title={issue ? `Problema ${issue.code}` : "Dettaglio problema"} size={560}>
    {query.isError ? <LoadError error={query.error} retry={() => void query.refetch()} /> : !issue ? <SectionSpinner /> :
      <Flex vertical gap={20}>
        <Descriptions column={{ xs: 1, sm: 2 }} items={[
          { key: "id", label: "Riferimento", children: <Typography.Text copyable={{ text: issue.id }}>{issue.id.slice(0, 8)}</Typography.Text> },
          { key: "tenant", label: "Azienda", children: issue.company_name ?? "—" },
          { key: "source", label: "Origine", children: `${SOURCES[issue.source]} · ${issue.area}` },
          { key: "build", label: "Versione", children: issue.build ?? "—" },
          { key: "first", label: "Prima occorrenza", children: fmtDateTime(issue.first_seen_at) },
          { key: "last", label: "Ultima occorrenza", children: fmtDateTime(issue.last_seen_at) },
          { key: "state", label: "Stato", children: <Tag color={stateColors[issue.state]}>{STATES[issue.state]}</Tag> },
          { key: "severity", label: "Gravità", children: <Tag color={severityColors[issue.severity]}>{SEVERITIES[issue.severity]}</Tag> },
          { key: "occurrences", label: "Occorrenze", children: issue.occurrences },
          { key: "assignee", label: "Assegnato a", children: issue.assignee_email ?? "Nessuno" },
        ]} />
        <Flex wrap gap={8}>
          <Button type="primary" onClick={() => edit({
            title: "Aggiorna problema",
            submit: (fields) => updateIssue(issue.id, issue.triage_version, fields),
            values: { state: issue.state, severity: issue.severity, assignee_id: issue.assignee_id ?? undefined },
            reasonLabel: "Nota di gestione o risoluzione",
            fields: <>
              <Form.Item name="state" label="Stato" rules={[{ required: true }]}><Select options={options(STATES)} /></Form.Item>
              <Form.Item name="severity" label="Gravità" rules={[{ required: true }]}><Select options={options(SEVERITIES)} /></Form.Item>
              <Form.Item name="assignee_id" label="Assegna a">
                <Select allowClear placeholder="Nessun operatore" options={operators.filter((operator) => operator.enabled || operator.user_id === issue.assignee_id)
                  .map((operator) => ({ value: operator.user_id, label: operator.enabled ? operator.email : `${operator.email} (disabilitato)` }))} />
              </Form.Item>
            </>,
          })}>Gestisci problema</Button>
          {tenantId && <Button onClick={() => openCompany(tenantId)}>Operazioni azienda</Button>}
        </Flex>
        <Card title="Attività degli operatori" size="small">
          {query.data?.activity.length ? <Timeline items={query.data.activity.map((entry) => ({
            key: entry.id,
            title: fmtDateTime(entry.created_at),
            content: <Space orientation="vertical" size={2}>
              <Typography.Text strong>{entry.actor}</Typography.Text>
              <Typography.Text type="secondary">{STATES[entry.state]} · {SEVERITIES[entry.severity]}</Typography.Text>
              <Typography.Paragraph style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.reason}</Typography.Paragraph>
            </Space>,
          }))} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nessuna modifica registrata" />}
        </Card>
      </Flex>}
  </Drawer>;
}

const ORDER_EVENTS: Record<string, string> = {
  created: "Ordine creato", assigned: "Assegnazione aggiornata", status_changed: "Stato aggiornato",
  updated: "Ordine aggiornato", deleted: "Ordine eliminato",
};

export function OrderHistory({ userId, tenantId, timezone, orderId, close }: {
  userId: string; tenantId: string; timezone: string; orderId: string; close: () => void;
}) {
  const query = useQuery({
    queryKey: ["platform", userId, "order-history", tenantId, orderId],
    queryFn: () => getOrderHistory(tenantId, orderId), retry: false,
  });

  return <Drawer open onClose={close} title={`Cronologia ordine ${orderId.slice(0, 8)}`} size={480}>
    {query.isError ? <LoadError error={query.error} retry={() => void query.refetch()} /> : !query.data ? <SectionSpinner /> :
      query.data.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nessun evento registrato" /> :
        <Timeline items={query.data.map((event) => ({
          key: event.id,
          title: fmtDateTime(event.created_at, timezone),
          content: <Space orientation="vertical" size={2}>
            <Typography.Text>{ORDER_EVENTS[event.event_type] ?? "Modifica ordine"}</Typography.Text>
            {event.to_status && event.from_status !== event.to_status && <Flex gap={4} align="center" wrap>
              {event.from_status && <><StatusTag status={event.from_status} /><Typography.Text type="secondary">a</Typography.Text></>}
              <StatusTag status={event.to_status} />
            </Flex>}
          </Space>,
        }))} />}
  </Drawer>;
}

type OperationsFilter = "all" | "unassigned" | "overdue";

export function CompanyOperations({ orders, company, openOrder }: {
  orders: OperationalOrder[]; company: Company; openOrder: (id: string) => void;
}) {
  const [filter, setFilter] = useState<OperationsFilter>("all");
  const [search, setSearch] = useState("");
  const text = search.trim().toLowerCase();
  const visible = orders.filter((order) => {
    if (filter === "unassigned" && !needsAssignment(order)) return false;
    if (filter === "overdue" && !isPickupOverdue(order)) return false;
    return !text || order.id.includes(text) || String(order.radio_channel ?? "") === text;
  });

  return <Card title="Incarichi aperti" styles={{ body: { padding: 16 } }}>
    <Flex gap={12} align="center" wrap style={{ marginBottom: 16 }}>
      <Segmented<OperationsFilter> aria-label="Filtra incarichi" value={filter} onChange={setFilter} options={[
        { label: "Tutti", value: "all" }, { label: "Da assegnare", value: "unassigned" }, { label: "Ritiri in ritardo", value: "overdue" },
      ]} />
      <Input.Search allowClear aria-label="Cerca incarichi" placeholder="Riferimento o canale" value={search}
        onChange={(event) => setSearch(event.target.value)} style={{ width: 280, maxWidth: "100%" }} />
    </Flex>
    <Table rowKey="id" scroll={{ x: 860 }} dataSource={visible} locale={{ emptyText: "Nessun incarico aperto" }}
      rowClassName={(row) => needsAssignment(row) || isPickupOverdue(row) ? "row-attention" : ""} columns={[
        { title: "Riferimento", render: (_, row) => <Typography.Text copyable={{ text: row.id }}>{row.id.slice(0, 8)}</Typography.Text> },
        { title: "Stato", render: (_, row) => <StatusTag status={row.status} /> },
        { title: "Consegna", render: (_, row) => fmtDateTime(row.delivery_at, company.timezone) },
        { title: "Ritiro", render: (_, row) => <Flex gap={4} wrap>
          {fmtDateTime(row.pickup_at, company.timezone)}{isPickupOverdue(row) && <Tag color="gold">In ritardo</Tag>}
        </Flex> },
        { title: "Canale", render: (_, row) => row.radio_channel ?? "—" },
        { title: "Radioguide perse", dataIndex: "lost_radios" },
        { title: "Cronologia", render: (_, row) => <Button size="small" onClick={() => openOrder(row.id)}>Vedi eventi</Button> },
      ]} />
  </Card>;
}

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return <Alert showIcon type="error" title={actionError(error)} action={<Button onClick={retry}>Riprova</Button>} />;
}
