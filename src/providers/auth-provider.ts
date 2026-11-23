import type { AuthProvider } from "@refinedev/core";
import { supabase } from "../lib/supabase";
import { getErrorMessage, isAuthError } from "../lib/errors";
import {
  loadCurrentUser,
  resetCurrentUserCache,
  setLoginNotice,
  signOut,
} from "../features/auth/session";
import { t } from "../i18n";

const authError = (message: string, name = t("Operazione non riuscita")) => ({
  success: false as const,
  error: { name, message },
});

export interface LoginParams {
  email?: string;
  password?: string;
  providerName?: string;
}

export interface RegisterParams {
  email?: string;
  password?: string;
  companyName?: string;
  name?: string;
  phoneNumber?: string;
}

export const authProvider: AuthProvider = {
  login: async ({ email, password, providerName }: LoginParams) => {
    if (providerName === "google") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      return error ? authError(getErrorMessage(error), t("Accesso non riuscito")) : { success: true };
    }

    if (!email || !password) {
      return authError(t("Inserisci email e password."), t("Accesso non riuscito"));
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return authError(getErrorMessage(error), t("Accesso non riuscito"));

    const current = await loadCurrentUser(true);
    if (current.kind === "ready") {
      void supabase.rpc("touch_login");
      return { success: true, redirectTo: "/" };
    }
    if (current.kind === "needs_company") {
      return { success: true, redirectTo: "/onboarding" };
    }

    const message = current.kind === "blocked" ? current.message : t("Accesso non riuscito.");
    await signOut();
    return authError(message, t("Accesso non riuscito"));
  },

  register: async ({ email, password, companyName, name, phoneNumber }: RegisterParams) => {
    if (!email || !password || !companyName?.trim()) {
      return authError(t("Compila tutti i campi obbligatori."), t("Registrazione non riuscita"));
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: name?.trim() || undefined,
          phone: phoneNumber?.trim() || undefined,
          company_name: companyName.trim(),
        },
      },
    });
    if (error) return authError(getErrorMessage(error), t("Registrazione non riuscita"));

    // Email confirmation disabled (local development): the user is already signed in.
    if (data.session) {
      const current = await loadCurrentUser(true);
      if (current.kind === "ready") return { success: true, redirectTo: "/" };
      const message = current.kind === "blocked" ? current.message : t("Registrazione non riuscita.");
      await signOut();
      return authError(message, t("Registrazione non riuscita"));
    }

    return {
      success: true,
      redirectTo: "/login",
      successNotification: {
        message: t("Controlla la tua email"),
        description:
          t("Ti abbiamo inviato un link di conferma. Aprilo per attivare l'account, poi accedi."),
      },
    };
  },

  forgotPassword: async ({ email }: { email?: string }) => {
    if (!email) return authError(t("Inserisci la tua email."), t("Richiesta non riuscita"));

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (error) return authError(getErrorMessage(error), t("Richiesta non riuscita"));

    return {
      success: true,
      redirectTo: "/login",
      successNotification: {
        message: t("Email inviata"),
        description: t("Se l'indirizzo è registrato, riceverai un link per reimpostare la password."),
      },
    };
  },

  updatePassword: async ({ password }: { password?: string }) => {
    if (!password) return authError(t("Inserisci la nuova password."), t("Aggiornamento non riuscito"));

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return authError(getErrorMessage(error), t("Aggiornamento non riuscito"));

    return {
      success: true,
      redirectTo: "/",
      successNotification: { message: t("Password aggiornata"), description: "" },
    };
  },

  logout: async () => {
    try {
      await signOut();
    } catch (error) {
      return authError(getErrorMessage(error), t("Uscita non riuscita"));
    }
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const current = await loadCurrentUser();
    if (current.kind === "ready") return { authenticated: true };
    if (current.kind === "needs_company") {
      return { authenticated: false, redirectTo: "/onboarding" };
    }
    if (current.kind === "blocked") {
      // Refine performs its own logout redirect, which would drop a "?reason=" in the URL:
      // keep the reason (e.g. "company_exists" after confirming an email) as a one-shot
      // notice that the login page displays.
      setLoginNotice(current.code ?? "error");
      return {
        authenticated: false,
        logout: true,
        redirectTo: "/login",
        error: { name: t("Accesso non riuscito"), message: current.message },
      };
    }
    return {
      authenticated: false,
      redirectTo: "/login",
      error: { name: "Unauthenticated", message: t("Accedi per continuare.") },
    };
  },

  getIdentity: async () => {
    const current = await loadCurrentUser();
    if (current.kind !== "ready") return null;
    const { profile, tenant } = current;
    return {
      id: profile.id,
      name: profile.full_name || profile.email,
      email: profile.email,
      avatar: profile.avatar_url ?? undefined,
      roles: profile.roles,
      tenantId: tenant.id,
      tenantName: tenant.name,
    };
  },

  getPermissions: async () => {
    const current = await loadCurrentUser();
    return current.kind === "ready" ? current.profile.roles : [];
  },

  onError: async (error) => {
    if (isAuthError(error)) {
      resetCurrentUserCache();
      return { logout: true, redirectTo: "/login", error };
    }
    return { error };
  },
};
