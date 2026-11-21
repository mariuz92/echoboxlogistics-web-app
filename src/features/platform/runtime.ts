import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Settings } from "./api";

const DEFAULTS: Settings = { operator_only_companies: true, booking_paused: false, notice: "" };

export function usePlatformSettings() {
  const { data, isPending } = useQuery({
    queryKey: ["platform-runtime-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_runtime_settings");
      if (error) throw error;
      return data as unknown as Settings;
    },
    retry: false,
    refetchInterval: 60_000,
  });
  return { settings: data ?? DEFAULTS, isPending };
}

export async function reportWebIssue(area: string, fallback: string, error?: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const safeCode = typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code) ? code : fallback;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.rpc("report_platform_issue", {
      p_source: "web",
      p_area: area,
      p_code: safeCode,
      p_build: import.meta.env.VITE_BUILD_REVISION || undefined,
    });
  } catch {
    // Reporting is best effort. A telemetry outage must not break the app.
  }
}
