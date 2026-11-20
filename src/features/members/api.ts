import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { AppRole, Invitation, Profile, RiderActivity } from "../../types/domain";

/** Members of the company (admins see everyone; riders only themselves). */
export async function listMembers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface MemberPatch {
  fullName?: string;
  phone?: string; // "" clears it
  roles?: AppRole[];
  disabled?: boolean;
}

export async function updateMember(userId: string, patch: MemberPatch): Promise<Profile> {
  const { data, error } = await supabase.rpc("update_member", {
    p_user_id: userId,
    p_full_name: patch.fullName as string,
    p_phone: patch.phone as string,
    p_roles: patch.roles as AppRole[],
    p_disabled: patch.disabled as boolean,
  });
  if (error) throw error;
  return data;
}

export async function listRiderActivity(): Promise<RiderActivity[]> {
  const { data, error } = await supabase.from("rider_activity").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function listInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function revokeInvitation(id: string): Promise<void> {
  const { data, error } = await supabase.from("invitations").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("write_not_applied");
}

export interface InviteInput {
  email: string;
  fullName?: string;
  roles: AppRole[];
}

/**
 * Invites someone by email through the `invite-member` Edge Function (needs
 * the service role, so it cannot run in the browser).
 */
export async function inviteMember(input: InviteInput): Promise<void> {
  const { error } = await supabase.functions.invoke("invite-member", {
    body: { email: input.email, full_name: input.fullName, roles: input.roles },
  });

  if (!error) return;

  // Surface the machine-readable code returned by the function so that
  // getErrorMessage() can translate it.
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body.error) throw new Error(body.error);
    } catch (parsed) {
      if (parsed instanceof Error && parsed.message !== error.message) throw parsed;
    }
  }
  throw error;
}
