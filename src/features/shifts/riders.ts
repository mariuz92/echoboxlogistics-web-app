import { useMemo } from "react";
import { useMembers } from "../orders/hooks";
import type { Profile } from "../../types/domain";

export const nameOf = (m: Pick<Profile, "full_name" | "email">) => m.full_name?.trim() || m.email;

/** Riders to list: the active ones, plus anyone who has data in the period (e.g. disabled later). */
export function useRiders(extraIds: Iterable<string>): Profile[] {
  const { data: members = [] } = useMembers();
  const key = [...extraIds].join(",");
  return useMemo(() => {
    const extra = new Set(key ? key.split(",") : []);
    return members
      .filter((m) => (m.roles.includes("rider") && !m.disabled) || extra.has(m.id))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }, [members, key]);
}
