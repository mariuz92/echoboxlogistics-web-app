import { supabase } from "../../lib/supabase";
import type { BillingInterval, CompanyBilling } from "./types";

/** Plan, usage, estimate, invoices and plan-change request of the signed-in admin's company. */
export async function getCompanyBilling() {
  const { data, error } = await supabase.rpc("company_billing");
  if (error) throw error;
  return data as unknown as CompanyBilling;
}

export async function requestPlanChange(planCode: string, interval: BillingInterval, note: string) {
  const { error } = await supabase.rpc("request_plan_change", {
    p_plan_code: planCode,
    p_interval: interval,
    p_note: note.trim() || undefined,
  });
  if (error) throw error;
}

export async function cancelPlanChangeRequest() {
  const { error } = await supabase.rpc("cancel_plan_change_request");
  if (error) throw error;
}
