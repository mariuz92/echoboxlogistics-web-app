import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import {
  loadCurrentUser,
  resetCurrentUserCache,
  type CurrentUserResult,
} from "../features/auth/session";
import { hasRole, type Profile, type Tenant } from "../types/domain";
import { DEFAULT_TIMEZONE } from "../lib/dates";

interface CurrentUserContextValue {
  result: CurrentUserResult | null;
  loading: boolean;
  profile: Profile | null;
  tenant: Tenant | null;
  timezone: string;
  isAdmin: boolean;
  isRider: boolean;
  /** Reload profile + tenant (after editing them). */
  refresh: () => Promise<void>;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<CurrentUserResult | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  const load = useCallback(async (force = false) => {
    const next = await loadCurrentUser(force);
    setResult(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Never await Supabase calls inside this callback (it can deadlock the
      // auth client): defer the work to the next tick.
      setTimeout(() => {
        if (event === "SIGNED_OUT") {
          resetCurrentUserCache();
          lastUserId.current = null;
          setResult({ kind: "signed_out" });
          setLoading(false);
          return;
        }
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          const userId = session?.user.id ?? null;
          const force = event === "USER_UPDATED" || userId !== lastUserId.current;
          lastUserId.current = userId;
          void load(force).then((next) => {
            if (event === "SIGNED_IN" && next.kind === "ready") {
              void supabase.rpc("touch_login");
            }
          });
        }
        // TOKEN_REFRESHED / INITIAL_SESSION need no reload.
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [load]);

  const value = useMemo<CurrentUserContextValue>(() => {
    const ready = result?.kind === "ready" ? result : null;
    return {
      result,
      loading,
      profile: ready?.profile ?? null,
      tenant: ready?.tenant ?? null,
      timezone: ready?.tenant.timezone ?? DEFAULT_TIMEZONE,
      isAdmin: hasRole(ready?.profile, "admin"),
      isRider: hasRole(ready?.profile, "rider"),
      refresh: async () => {
        await load(true);
      },
    };
  }, [result, loading, load]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used inside <CurrentUserProvider>");
  return ctx;
}

/** For screens that only render for a fully loaded user. */
export function useReadyUser() {
  const { profile, tenant, timezone, isAdmin, isRider, refresh } = useCurrentUser();
  if (!profile || !tenant) {
    throw new Error("useReadyUser used outside an authenticated route");
  }
  return { profile, tenant, timezone, isAdmin, isRider, refresh };
}
