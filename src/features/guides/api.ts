import { supabase } from "../../lib/supabase";
import type { Guide } from "../../types/domain";

export async function listGuides(): Promise<Guide[]> {
  const { data, error } = await supabase
    .from("guides")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface GuideInput {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

const clean = (input: GuideInput) => ({
  full_name: input.full_name.trim(),
  phone: input.phone?.trim() || null,
  email: input.email?.trim().toLowerCase() || null,
  notes: input.notes?.trim() || null,
});

export async function createGuide(tenantId: string, input: GuideInput): Promise<Guide> {
  const { data, error } = await supabase
    .from("guides")
    .insert({ ...clean(input), tenant_id: tenantId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateGuide(id: string, input: GuideInput): Promise<void> {
  const { data, error } = await supabase.from("guides").update(clean(input)).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("write_not_applied");
}

export async function deleteGuide(id: string): Promise<void> {
  const { data, error } = await supabase.from("guides").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("write_not_applied");
}
