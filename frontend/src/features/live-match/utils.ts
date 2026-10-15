import type { RosterWithStatsRow } from "@/api/types";

export function playerName(p: { first_name: string; last_name: string } | RosterWithStatsRow) {
  return `${p.first_name} ${p.last_name}`;
}

