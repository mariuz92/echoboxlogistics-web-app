import { useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Drawer, Empty, Flex, Form, Input, Select, Spin, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { ORDER_STATUS_META } from "../src/types/domain";
import {
  actionError, getIssueDetail, getIssueQueue, getOrderHistory, ISSUE_PAGE_SIZE, updateIssue,
  type Issue, type IssueFilters, type IssueSeverity, type Snapshot,
} from "../src/features/platform/api";
import type { OpenEditor } from "./ConsolePages";

const STATES = { open: "Aperto", investigating: "In verifica", resolved: "Risolto" };
const SEVERITIES = { info: "Informativo", warning: "Avviso", critical: "Critico" };
const SOURCES = { web: "Web", flutter: "Flutter", backend: "Backend" };
const severityColors: Record<IssueSeverity, string> = { info: "blue", warning: "gold", critical: "red" };
const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const date = (value: string) => dayjs(value).format("DD/MM/YYYY HH:mm");

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
      { title: "Ultima attività", render: (_, row) => date(row.last_seen_at) },
      { title: "Gravità", render: (_, row) => <Tag color={severityColors[row.severity]}>{SEVERITIES[row.severity]}</Tag> },
      { title: "Stato", render: (_, row) => STATES[row.state] },
    ]} />;
}

export function IssueQueue({ userId, tenantId, openIssue }: {
  userId: string; tenantId?: string; openIssue: (id: string) => void;
}) {
  const [filters, setFilters] = useState<IssueFilters>({ state: "active" });
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["platform", userId, "issues", tenantId, filters, page],
    queryFn: () => getIssueQueue(filters, page, tenantId),
    refetchInterval: 60_000,
    retry: false,
  });
  const total = query.data?.total;

  useEffect(() => {
    if (total !== undefined) setPage((current) => Math.min(current, Math.max(1, Math.ceil(total / ISSUE_PAGE_SIZE))));
  }, [total]);

  function changeFilters(change: Partial<IssueFilters>) {
    setFilters((previous) => ({ ...previous, ...change }));
    setPage(1);
  }

  return <Card>
    <Flex gap={8} wrap style={{ marginBottom: 16 }}>
      <Input.Search allowClear aria-label="Cerca problemi" placeholder="Codice, azienda o riferimento" maxLength={120}
        onSearch={(search) => changeFilters({ search: search.trim() || undefined })} style={{ width: 288, maxWidth: "100%" }} />
      <Select aria-label="Stato dei problemi" value={filters.state} style={{ minWidth: 150 }}
        options={options({ active: "Da gestire", ...STATES, all: "Tutti gli stati" })}
        onChange={(state: IssueFilters["state"]) => changeFilters({ state })} />
      <Select allowClear aria-label="Origine dei problemi" placeholder="Tutte le origini" value={filters.source} style={{ minWidth: 150 }}
        options={options(SOURCES)} onChange={(source: IssueFilters["source"]) => changeFilters({ source })} />
      <Select allowClear aria-label="Gravità dei problemi" placeholder="Tutte le gravità" value={filters.severity} style={{ minWidth: 150 }}
        options={options(SEVERITIES)} onChange={(severity: IssueFilters["severity"]) => changeFilters({ severity })} />
    </Flex>
    {query.isError ? <LoadError error={query.error} retry={() => void query.refetch()} /> :
      <IssueTable issues={query.data?.issues ?? []} openIssue={openIssue} loading={query.isFetching}
        pagination={{ current: page, total, pageSize: ISSUE_PAGE_SIZE, showSizeChanger: false, onChange: setPage }} />}
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
    {query.isError ? <LoadError error={query.error} retry={() => void query.refetch()} /> : !issue ? <Spin /> :
      <Flex vertical gap={20}>
        <Descriptions column={{ xs: 1, sm: 2 }} items={[
          { key: "id", label: "Riferimento", children: <Typography.Text copyable={{ text: issue.id }}>{issue.id.slice(0, 8)}</Typography.Text> },
          { key: "tenant", label: "Azienda", children: issue.company_name ?? "—" },
          { key: "source", label: "Origine", children: `${SOURCES[issue.source]} · ${issue.area}` },
          { key: "build", label: "Versione", children: issue.build ?? "—" },
          { key: "first", label: "Prima occorrenza", children: date(issue.first_seen_at) },
          { key: "last", label: "Ultima occorrenza", children: date(issue.last_seen_at) },
          { key: "state", label: "Stato", children: STATES[issue.state] },
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
          {query.data?.activity.length ? <Flex vertical gap={16}>
            {query.data.activity.map((entry) => <div key={entry.id}>
              <Typography.Text strong>{entry.actor}</Typography.Text>
              <Typography.Text type="secondary" style={{ display: "block" }}>
                {date(entry.created_at)} · {STATES[entry.state]} · {SEVERITIES[entry.severity]}
              </Typography.Text>
              <Typography.Paragraph style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.reason}</Typography.Paragraph>
            </div>)}
          </Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nessuna modifica registrata" />}
        </Card>
      </Flex>}
  </Drawer>;
}

const ORDER_EVENTS: Record<string, string> = {
  created: "Ordine creato", assigned: "Assegnazione aggiornata", status_changed: "Stato aggiornato",
  updated: "Ordine aggiornato", deleted: "Ordine eliminato",
};

export function OrderHistory({ userId, tenantId, orderId, close }: {
  userId: string; tenantId: string; orderId: string; close: () => void;
}) {
  const query = useQuery({
    queryKey: ["platform", userId, "order-history", tenantId, orderId],
    queryFn: () => getOrderHistory(tenantId, orderId), retry: false,
  });

  return <Drawer open onClose={close} title={`Cronologia ordine ${orderId.slice(0, 8)}`} size={480}>
    {query.isError ? <LoadError error={query.error} retry={() => void query.refetch()} /> : !query.data ? <Spin /> :
      query.data.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nessun evento registrato" /> :
        <Flex vertical gap={16}>
          {query.data.map((event) => <div key={event.id}>
            <Typography.Text strong>{ORDER_EVENTS[event.event_type] ?? "Modifica ordine"}</Typography.Text>
            <Typography.Text type="secondary" style={{ display: "block" }}>{date(event.created_at)}</Typography.Text>
            {event.from_status && event.from_status !== event.to_status &&
              <div>Da {ORDER_STATUS_META[event.from_status].label}</div>}
            {event.to_status && event.from_status !== event.to_status &&
              <div>Stato risultante · {ORDER_STATUS_META[event.to_status].label}</div>}
          </div>)}
        </Flex>}
  </Drawer>;
}

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return <Alert showIcon type="error" title={actionError(error)} action={<Button onClick={retry}>Riprova</Button>} />;
}
