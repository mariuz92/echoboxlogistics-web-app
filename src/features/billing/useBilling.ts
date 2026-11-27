import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "../../providers/current-user";
import { getCompanyBilling } from "./api";

/**
 * Billing data for company admins. Quiet on purpose: if the database has not been updated yet
 * (no billing functions) the query simply fails and nothing is shown.
 */
export function useCompanyBilling() {
  const { profile, isAdmin } = useCurrentUser();
  return useQuery({
    queryKey: ["company-billing", profile?.id],
    queryFn: getCompanyBilling,
    enabled: isAdmin && !!profile,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}
