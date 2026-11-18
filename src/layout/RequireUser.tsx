import { useEffect, type ReactNode } from "react";
import { setLoginNotice } from "../features/auth/session";
import { useCurrentUser } from "../providers/current-user";
import { FullPageSpinner } from "../shared/components/Screens";

/**
 * Renders the signed-in app only while the current user is valid.
 *
 * The user can stop being valid while the app is open (an admin deactivates the account, the
 * session is signed out in another tab…). Pages that need the profile would then throw and blank
 * the whole screen. Instead the user is sent to the right place, with an explanation when there is one.
 *
 * This is a deliberate hard redirect (not a router <Navigate>): Refine keeps its own cached
 * "authenticated" answer for the public routes, and a soft navigation ping-pongs between the two
 * (login → app → login …) until React gives up with "Maximum update depth exceeded".
 * A full page load resets every cache.
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const { result, loading } = useCurrentUser();
  const kind = result?.kind;
  const ready = kind === "ready";

  useEffect(() => {
    if (loading || !result || ready) return;
    if (result.kind === "blocked") setLoginNotice(result.code ?? "error");
    window.location.replace(result.kind === "needs_company" ? "/onboarding" : "/login");
  }, [loading, result, ready]);

  return ready ? <>{children}</> : <FullPageSpinner />;
}
