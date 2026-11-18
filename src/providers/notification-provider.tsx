import { useMemo } from "react";
import { App } from "antd";
import type { NotificationProvider } from "@refinedev/core";

/**
 * Refine notification provider backed by antd's context-aware `notification`
 * API (replaces the one that used to ship with @refinedev/antd, which only
 * supports antd 5). Must be called below <AntdApp>.
 */
export function useNotificationProvider(): NotificationProvider {
  const { notification } = App.useApp();

  return useMemo<NotificationProvider>(
    () => ({
      open: ({ key, message, description, type }) => {
        notification.open({
          key,
          title: message, // antd 6 renamed `message` to `title`
          description,
          type: type === "progress" ? "info" : type,
          placement: "topRight",
        });
      },
      close: (key) => notification.destroy(key),
    }),
    [notification],
  );
}
