import { supabase } from "../../lib/supabase";

export interface PublicTenant {
  name: string;
  slug: string;
  timezone: string;
  accepting_bookings: boolean;
}

/** Resolves the company behind a public booking link. Works while signed out. */
export async function getPublicTenant(slug: string): Promise<PublicTenant | null> {
  const { data, error } = await supabase.rpc("get_public_tenant", { p_slug: slug });
  if (error) throw error;
  return data?.[0] ?? null;
}

export interface PublicBookingInput {
  slug: string;
  guideName: string;
  guidePhone: string;
  guideEmail?: string;
  radiosCount: number;
  deliveryAt: string; // ISO
  deliveryAddress: string;
  pickupAt?: string | null; // ISO
  pickupAddress?: string | null;
  notes?: string | null;
}

export async function createPublicBooking(input: PublicBookingInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_public_order", {
    p_slug: input.slug,
    p_guide_name: input.guideName,
    p_guide_phone: input.guidePhone,
    p_guide_email: input.guideEmail as string,
    p_radios_count: input.radiosCount,
    p_delivery_at: input.deliveryAt,
    p_delivery_address: input.deliveryAddress,
    p_pickup_at: input.pickupAt as string,
    p_pickup_address: input.pickupAddress as string,
    p_notes: input.notes as string,
  });
  if (error) throw error;
  return data;
}
