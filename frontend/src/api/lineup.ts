import { api } from "./client";

export type LineupRole = "starter" | "sub";
export type LineupEditorRole = LineupRole | "out";

export type LineupEditorPlayer = {
  player_id: number;
  first_name: string;
  last_name: string;
  default_jersey_number: number;
  role: LineupEditorRole;
  /** null => the default jersey number is used when saving */
  jersey_number_match: number | null;
};

export type LineupEditorResponse = {
  match_id: number;
  taken_numbers: number[];
  players: LineupEditorPlayer[];
};

export type LineupItem = {
  player_id: number;
  role: LineupRole;
  jersey_number_match: number;
};

export async function getLineupEditor(matchId: number) {
  const res = await api.get<LineupEditorResponse>(`/matches/${matchId}/lineup-editor`);
  return res.data;
}

export async function saveLineup(matchId: number, items: LineupItem[]) {
  const res = await api.put<{ ok: boolean; match_id: number; starters: number; subs: number }>(
    `/matches/${matchId}/lineup`,
    { items },
  );
  return res.data;
}
