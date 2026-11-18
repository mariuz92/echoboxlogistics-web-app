import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Drawer, Flex, Form, Input, Table, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { fmtDate } from "../../lib/dates";
import { getErrorMessage } from "../../lib/errors";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import type { Guide } from "../../types/domain";
import { queryKeys, useGuides } from "../orders/hooks";
import { createGuide, deleteGuide, updateGuide, type GuideInput } from "./api";

export function GuidesPage() {
  usePageTitle("Guide");
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { tenant, timezone } = useReadyUser();
  const { data: guides = [], isLoading } = useGuides();
  const [form] = Form.useForm<GuideInput>();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Guide | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter((g) =>
      [g.full_name, g.phone, g.email].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
    );
  }, [guides, search]);

  const open = (target: Guide | "new") => {
    setEditing(target);
    form.setFieldsValue(
      target === "new"
        ? { full_name: "", phone: "", email: "", notes: "" }
        : { full_name: target.full_name, phone: target.phone ?? "", email: target.email ?? "", notes: target.notes ?? "" },
    );
  };

  const save = async (values: GuideInput) => {
    setSaving(true);
    try {
      if (editing === "new") {
        await createGuide(tenant.id, values);
        void message.success("Guida aggiunta");
      } else if (editing) {
        await updateGuide(editing.id, values);
        void message.success("Guida aggiornata");
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.guides });
      setEditing(null);
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (guide: Guide) =>
    modal.confirm({
      title: `Eliminare ${guide.full_name}?`,
      content: "Gli ordini già registrati restano visibili con il nome della guida.",
      okText: "Elimina",
      okButtonProps: { danger: true },
      cancelText: "Annulla",
      onOk: async () => {
        try {
          await deleteGuide(guide.id);
          await queryClient.invalidateQueries({ queryKey: queryKeys.guides });
          void message.success("Guida eliminata");
        } catch (error) {
          void message.error(getErrorMessage(error));
        }
      },
    });

  return (
    <>
      <PageHeader
        title="Guide"
        subtitle="Rubrica delle guide e dei gruppi a cui noleggi le radioguide. Non hanno un account: servono solo per precompilare gli ordini."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open("new")}>
            Nuova guida
          </Button>
        }
      />

      <Card styles={{ body: { padding: 16 } }}>
        <Input.Search
          allowClear
          placeholder="Cerca per nome, telefono o email…"
          style={{ maxWidth: 360, marginBottom: 16 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Table<Guide>
          rowKey="id"
          loading={isLoading}
          dataSource={visible}
          scroll={{ x: 760 }}
          pagination={{ defaultPageSize: 25, showTotal: (t) => `${t} guide` }}
          locale={{ emptyText: "Nessuna guida in rubrica" }}
          columns={[
            {
              title: "Nome",
              dataIndex: "full_name",
              sorter: (a, b) => a.full_name.localeCompare(b.full_name, "it"),
              defaultSortOrder: "ascend",
              render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
            },
            { title: "Telefono", dataIndex: "phone", render: (v: string | null) => v ?? "—" },
            { title: "Email", dataIndex: "email", render: (v: string | null) => v ?? "—", ellipsis: true },
            { title: "Aggiunta il", dataIndex: "created_at", width: 120, render: (v: string) => fmtDate(v, timezone) },
            {
              title: "",
              width: 100,
              render: (_, guide) => (
                <Flex gap={4} justify="flex-end">
                  <Button type="text" aria-label="Modifica" icon={<EditOutlined />} onClick={() => open(guide)} />
                  <Button type="text" danger aria-label="Elimina" icon={<DeleteOutlined />} onClick={() => confirmDelete(guide)} />
                </Flex>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={editing === "new" ? "Nuova guida" : "Modifica guida"}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size={440}
        destroyOnHidden
      >
        <Form<GuideInput> form={form} layout="vertical" requiredMark="optional" onFinish={save}>
          <Form.Item
            label="Nome e cognome (o gruppo)"
            name="full_name"
            rules={[
              { required: true, whitespace: true, message: "Inserisci il nome" },
              { min: 2, message: "Almeno 2 caratteri" },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Telefono"
            name="phone"
            rules={[{ pattern: /^[0-9+\s()-]{6,20}$/, message: "Numero non valido" }]}
          >
            <Input placeholder="+39 333 1234567" />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ type: "email", message: "Email non valida" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Note" name="notes">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setEditing(null)}>Annulla</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              Salva
            </Button>
          </Flex>
        </Form>
      </Drawer>
    </>
  );
}

export default GuidesPage;
