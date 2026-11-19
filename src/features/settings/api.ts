import { supabase } from "../../lib/supabase";
import type { Profile, Tenant } from "../../types/domain";

export interface TenantPatch {
  name?: string;
  description?: string | null;
  timezone?: string;
  channel_min?: number;
  channel_max?: number;
  channels_exclusive?: boolean;
  disabled_channels?: number[];
  public_booking_enabled?: boolean;
}

export async function updateTenant(id: string, patch: TenantPatch): Promise<Tenant> {
  const { data, error } = await supabase
    .from("tenants")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export interface ProfilePatch {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
}

export async function updateOwnProfile(id: string, patch: ProfilePatch): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function changePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
