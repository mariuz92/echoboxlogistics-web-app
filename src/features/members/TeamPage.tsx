import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  Row,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  EditOutlined,
  EnvironmentOutlined,
  MailOutlined,
  PlusOutlined,
  ReloadOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { supabase } from "../../lib/supabase";
import { dayjs, fmtDateTime, fmtRelative, fmtTime } from "../../lib/dates";
import { getErrorMessage } from "../../lib/errors";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { StatusTag } from "../../shared/components/StatusTag";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { ROLE_LABELS, type AppRole, type Invitation, type Profile } from "../../types/domain";
import { queryKeys, useMembers, useOrdersRealtime, useRiderActivity } from "../orders/hooks";
import { useQuery } from "@tanstack/react-query";
import { inviteMember, listInvitations, revokeInvitation, updateMember } from "./api";
import { numberLocale, t, tn } from "../../i18n";

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as AppRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

interface MemberForm {
  fullName: string;
  phone?: string;
  roles: AppRole[];
}

interface InviteForm {
  email: string;
  fullName?: string;
  roles: AppRole[];
}

function ActivityCards() {
  const { timezone } = useReadyUser();
  const { data: activity = [] } = useRiderActivity();
  const busy = activity.filter((a) => a.is_busy);

  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <Badge status={busy.length ? "processing" : "default"} /> {t("In servizio ora (")}{busy.length}/{activity.length})
        </Flex>
      }
      size="small"
      style={{ marginBottom: 16 }}
    >
      {busy.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("Nessun rider con ordini attivi")} />
      ) : (
        <Row gutter={[12, 12]}>
          {busy.map((rider) => (
            <Col key={rider.rider_id!} xs={24} md={12} xl={8}>
              <Card size="small" variant="outlined">
                <Flex justify="space-between" align="flex-start" gap={8}>
                  <Flex vertical>
                    <Typography.Text strong>{rider.rider_name}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {rider.current_leg === "delivery" ? t("Consegna") : t("Ritiro")} · {fmtTime(rider.scheduled_at, timezone)}
                      {rider.active_orders && rider.active_orders > 1 ? " · " + tn(rider.active_orders, "{n} ordine", "{n} ordini") : ""}
                    </Typography.Text>
                  </Flex>
                  {rider.current_status && <StatusTag status={rider.current_status} />}
                </Flex>
                {rider.heading_to && (
                  <Typography.Text style={{ display: "block", marginTop: 8 }}>
                    <EnvironmentOutlined /> {rider.heading_to}
                  </Typography.Text>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}

export function TeamPage() {
  usePageTitle(t("Team e rider"));
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { profile: me } = useReadyUser();
  const { data: members = [], isLoading } = useMembers();
  const { data: invitations = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ["invitations"],
    queryFn: listInvitations,
  });
  useOrdersRealtime();

  const [editing, setEditing] = useState<Profile | null>(null);
  const [inviting, setInviting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memberForm] = Form.useForm<MemberForm>();
  const [inviteForm] = Form.useForm<InviteForm>();

  const riders = useMemo(() => members.filter((m) => m.roles.includes("rider")), [members]);
  const admins = useMemo(() => members.filter((m) => m.roles.includes("admin")), [members]);

  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: queryKeys.members });

  const toggleDisabled = async (member: Profile, disabled: boolean) => {
    try {
      await updateMember(member.id, { disabled });
      await refreshMembers();
      void queryClient.invalidateQueries({ queryKey: queryKeys.riderActivity });
      void message.success(disabled ? t("Utente disattivato") : t("Utente riattivato"));
    } catch (error) {
      void message.error(getErrorMessage(error));
    }
  };

  const openEdit = (member: Profile) => {
    setEditing(member);
    memberForm.setFieldsValue({ fullName: member.full_name, phone: member.phone ?? "", roles: member.roles });
  };

  const saveMember = async (values: MemberForm) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateMember(editing.id, { fullName: values.fullName, phone: values.phone ?? "", roles: values.roles });
      await refreshMembers();
      void message.success(t("Utente aggiornato"));
      setEditing(null);
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async (values: InviteForm) => {
    setSaving(true);
    try {
      await inviteMember({ email: values.email.trim(), fullName: values.fullName?.trim(), roles: values.roles });
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
      void message.success(t("Invito inviato a {email}", { email: values.email }));
      setInviting(false);
      inviteForm.resetFields();
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async (member: Profile) => {
    const { error } = await supabase.auth.resetPasswordForEmail(member.email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (error) void message.error(getErrorMessage(error));
    else void message.success(t("Email di reset inviata a {email}", { email: member.email }));
  };

  const memberColumns = (showRoles: boolean) => [
    {
      title: t("Nome"),
      dataIndex: "full_name",
      sorter: (a: Profile, b: Profile) => a.full_name.localeCompare(b.full_name, numberLocale()),
      render: (v: string, m: Profile) => (
        <Flex vertical>
          <Typography.Text strong>
            {v || m.email} {m.id === me.id && <Tag style={{ marginInlineStart: 6 }}>{t("Tu")}</Tag>}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {m.email}
          </Typography.Text>
        </Flex>
      ),
    },
    { title: t("Telefono"), dataIndex: "phone", render: (v: string | null) => v ?? "—" },
    ...(showRoles
      ? [
          {
            title: t("Ruoli"),
            dataIndex: "roles",
            render: (roles: AppRole[]) => (
              <Flex gap={4} wrap>
                {roles.map((r) => (
                  <Tag key={r} color={r === "admin" ? "blue" : "default"} variant="filled">
                    {ROLE_LABELS[r]}
                  </Tag>
                ))}
              </Flex>
            ),
          },
        ]
      : []),
    {
      title: t("Ultimo accesso"),
      dataIndex: "last_login_at",
      render: (v: string | null) => (v ? <span title={fmtDateTime(v)}>{fmtRelative(v)}</span> : t("Mai")),
    },
    {
      title: t("Attivo"),
      dataIndex: "disabled",
      width: 90,
      render: (disabled: boolean, m: Profile) => (
        <Switch
          checked={!disabled}
          disabled={m.id === me.id}
          aria-label={t("Attiva o disattiva {name}", { name: m.full_name })}
          onChange={(checked) => void toggleDisabled(m, !checked)}
        />
      ),
    },
    {
      title: "",
      width: 150,
      render: (_: unknown, m: Profile) => (
        <Flex gap={4} justify="flex-end">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(m)} aria-label={t("Modifica")} />
          <Button type="text" icon={<MailOutlined />} onClick={() => void sendPasswordReset(m)} aria-label={t("Invia reset password")} title={t("Invia reset password")} />
        </Flex>
      ),
    },
  ];

  const invitationColumns = [
    { title: t("Email"), dataIndex: "email" },
    {
      title: t("Ruoli"),
      dataIndex: "roles",
      render: (roles: AppRole[]) => roles.map((r) => <Tag key={r}>{ROLE_LABELS[r]}</Tag>),
    },
    {
      title: t("Scade"),
      dataIndex: "expires_at",
      render: (v: string) => (dayjs(v).isBefore(dayjs()) ? <Tag color="red">{t("Scaduto")}</Tag> : fmtRelative(v)),
    },
    {
      title: "",
      width: 220,
      render: (_: unknown, inv: Invitation) => (
        <Flex gap={4} justify="flex-end">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() =>
              void inviteMember({ email: inv.email, fullName: inv.full_name ?? undefined, roles: inv.roles })
                .then(() => {
                  void message.success(t("Invito reinviato"));
                  return queryClient.invalidateQueries({ queryKey: ["invitations"] });
                })
                .catch((e) => void message.error(getErrorMessage(e)))
            }
          >
            {t("Reinvia")}
          </Button>
          <Button
            size="small"
            danger
            icon={<UndoOutlined />}
            onClick={() =>
              modal.confirm({
                title: t("Revocare l'invito?"),
                content: t("{email} non potrà più usare il link ricevuto.", { email: inv.email }),
                okText: t("Revoca"),
                okButtonProps: { danger: true },
                cancelText: t("Annulla"),
                onOk: async () => {
                  await revokeInvitation(inv.id);
                  await queryClient.invalidateQueries({ queryKey: ["invitations"] });
                },
              })
            }
          >
            {t("Revoca")}
          </Button>
        </Flex>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("Team e rider")}
        subtitle={t("Gestisci chi può accedere alla piattaforma e vedi chi è in servizio.")}
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              inviteForm.setFieldsValue({ roles: ["rider"] });
              setInviting(true);
            }}
          >
            {t("Invita persona")}
          </Button>
        }
      />

      <Tabs
        items={[
          {
            key: "riders",
            label: t("Rider ({n})", { n: riders.length }),
            children: (
              <>
                <ActivityCards />
                <Card styles={{ body: { padding: 16 } }}>
                  <Table<Profile>
                    rowKey="id"
                    loading={isLoading}
                    dataSource={riders}
                    columns={memberColumns(true)}
                    scroll={{ x: 800 }}
                    pagination={false}
                    locale={{ emptyText: t("Nessun rider: invita il primo dal pulsante in alto") }}
                  />
                </Card>
              </>
            ),
          },
          {
            key: "admins",
            label: t("Amministratori ({n})", { n: admins.length }),
            children: (
              <Card styles={{ body: { padding: 16 } }}>
                <Table<Profile>
                  rowKey="id"
                  loading={isLoading}
                  dataSource={admins}
                  columns={memberColumns(true)}
                  scroll={{ x: 800 }}
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: "invites",
            label: t("Inviti in sospeso ({n})", { n: invitations.length }),
            children: (
              <Card styles={{ body: { padding: 16 } }}>
                <Table<Invitation>
                  rowKey="id"
                  loading={invitationsLoading}
                  dataSource={invitations}
                  columns={invitationColumns}
                  scroll={{ x: 640 }}
                  pagination={false}
                  locale={{ emptyText: t("Nessun invito in sospeso") }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Drawer title={t("Modifica utente")} open={Boolean(editing)} onClose={() => setEditing(null)} size={420} destroyOnHidden>
        <Form<MemberForm> form={memberForm} layout="vertical" requiredMark="optional" onFinish={saveMember}>
          <Form.Item label={t("Email")}>
            <Input value={editing?.email} disabled />
          </Form.Item>
          <Form.Item
            label={t("Nome e cognome")}
            name="fullName"
            rules={[{ required: true, whitespace: true, message: t("Inserisci il nome") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t("Telefono")} name="phone" rules={[{ pattern: /^[0-9+\s()-]{6,20}$|^$/, message: t("Numero non valido") }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t("Ruoli")} name="roles" rules={[{ required: true, type: "array", min: 1, message: t("Seleziona almeno un ruolo") }]}>
            <Checkbox.Group options={ROLE_OPTIONS} />
          </Form.Item>
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setEditing(null)}>{t("Annulla")}</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {t("Salva")}
            </Button>
          </Flex>
        </Form>
      </Drawer>

      <Drawer title={t("Invita una persona")} open={inviting} onClose={() => setInviting(false)} size={420} destroyOnHidden>
        <Typography.Paragraph type="secondary">
          {t("Riceverà un'email con un link per scegliere la password e unirsi alla tua azienda con i ruoli indicati.")}
        </Typography.Paragraph>
        <Form<InviteForm> form={inviteForm} layout="vertical" requiredMark="optional" onFinish={sendInvite}>
          <Form.Item
            label={t("Email")}
            name="email"
            rules={[
              { required: true, message: t("Inserisci l'email") },
              { type: "email", message: t("Email non valida") },
            ]}
          >
            <Input placeholder={t("rider@esempio.it")} />
          </Form.Item>
          <Form.Item label={t("Nome e cognome")} name="fullName">
            <Input />
          </Form.Item>
          <Form.Item label={t("Ruoli")} name="roles" rules={[{ required: true, type: "array", min: 1, message: t("Seleziona almeno un ruolo") }]}>
            <Checkbox.Group options={ROLE_OPTIONS} />
          </Form.Item>
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setInviting(false)}>{t("Annulla")}</Button>
            <Button type="primary" htmlType="submit" icon={<MailOutlined />} loading={saving}>
              {t("Invia invito")}
            </Button>
          </Flex>
        </Form>
      </Drawer>
    </>
  );
}

export default TeamPage;
