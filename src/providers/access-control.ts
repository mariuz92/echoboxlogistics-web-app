import type { AccessControlProvider } from "@refinedev/core";
import { loadCurrentUser } from "../features/auth/session";
import { t } from "../i18n";

/** Resources only tenant admins may open. Riders see "orders" and "profile". */
const ADMIN_ONLY = new Set(["dashboard", "calendar", "riders", "guides", "settings"]);

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource }) => {
    const current = await loadCurrentUser();
    if (current.kind !== "ready") {
      return { can: false, reason: t("Non autenticato") };
    }
    if (resource && ADMIN_ONLY.has(resource) && !current.profile.roles.includes("admin")) {
      return { can: false, reason: t("Riservato agli amministratori") };
    }
    return { can: true };
  },
  options: {
    buttons: { enableAccessControl: true, hideIfUnauthorized: true },
  },
};
