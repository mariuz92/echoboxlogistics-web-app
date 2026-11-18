import { useState } from "react";
import { App, Button, Card, Col, Descriptions, Flex, Form, Input, Row, Tag } from "antd";
import { getErrorMessage } from "../../lib/errors";
import { fmtDateTime } from "../../lib/dates";
import { useReadyUser } from "../../providers/current-user";
import { PageHeader } from "../../shared/components/PageHeader";
import { usePageTitle } from "../../shared/hooks/usePageTitle";
import { ROLE_LABELS } from "../../types/domain";
import { confirmPasswordRule, passwordRules, phoneRules } from "../auth/validators";
import { changePassword, updateOwnProfile } from "./api";

export function ProfilePage() {
  usePageTitle("Profilo");
  const { message } = App.useApp();
  const { profile, tenant, timezone, refresh } = useReadyUser();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordForm] = Form.useForm<{ password: string; confirm: string }>();

  const saveProfile = async (values: { full_name: string; phone?: string }) => {
    setSavingProfile(true);
    try {
      await updateOwnProfile(profile.id, {
        full_name: values.full_name.trim(),
        phone: values.phone?.trim() || null,
      });
      await refresh();
      void message.success("Profilo aggiornato");
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async ({ password }: { password: string }) => {
    setSavingPassword(true);
    try {
      await changePassword(password);
      passwordForm.resetFields();
      void message.success("Password aggiornata");
    } catch (error) {
      void message.error(getErrorMessage(error));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      <PageHeader title="Il mio profilo" subtitle={profile.email} />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Flex vertical gap={16}>
            <Card title="Dati personali">
              <Form
                layout="vertical"
                requiredMark="optional"
                onFinish={saveProfile}
                initialValues={{ full_name: profile.full_name, phone: profile.phone ?? "" }}
              >
                <Form.Item label="Email">
                  <Input value={profile.email} disabled />
                </Form.Item>
                <Form.Item
                  label="Nome e cognome"
                  name="full_name"
                  rules={[{ required: true, whitespace: true, message: "Inserisci il tuo nome" }]}
                >
                  <Input autoComplete="name" />
                </Form.Item>
                <Form.Item label="Telefono" name="phone" rules={phoneRules}>
                  <Input autoComplete="tel" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={savingProfile}>
                  Salva
                </Button>
              </Form>
            </Card>

            <Card title="Account">
              <Descriptions
                column={1}
                size="small"
                items={[
                  { key: "company", label: "Azienda", children: tenant.name },
                  {
                    key: "roles",
                    label: "Ruoli",
                    children: profile.roles.map((r) => (
                      <Tag key={r} color={r === "admin" ? "blue" : "default"}>
                        {ROLE_LABELS[r]}
                      </Tag>
                    )),
                  },
                  { key: "last", label: "Ultimo accesso", children: fmtDateTime(profile.last_login_at, timezone) },
                  { key: "since", label: "Iscritto dal", children: fmtDateTime(profile.created_at, timezone) },
                ]}
              />
            </Card>
          </Flex>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Cambia password">
            <Form form={passwordForm} layout="vertical" requiredMark={false} onFinish={savePassword}>
              <Form.Item label="Nuova password" name="password" rules={passwordRules} hasFeedback>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                label="Conferma password"
                name="confirm"
                dependencies={["password"]}
                rules={[{ required: true, message: "Conferma la password" }, confirmPasswordRule()]}
                hasFeedback
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={savingPassword}>
                Aggiorna password
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default ProfilePage;
