import { api } from "./client";

export type RatingRow = {
  id: number;
  match_id: number;
  user_id: number;
  player_id: number;
  rating: number;
  note?: string | null;
};

export async function listRatings(matchId: number) {
  const res = await api.get<RatingRow[]>(`/matches/${matchId}/ratings`);
  return res.data;
}

export async function saveRatings(matchId: number, items: Array<{ player_id: number; rating: number; note?: string | null }>) {
  const res = await api.put<RatingRow[]>(`/matches/${matchId}/ratings`, { items });
  return res.data;
}

export type RatingConfig = { auto_weight: number; coach_weight: number };

export async function getRatingConfig() {
  const res = await api.get<RatingConfig>("/rating-config");
  return res.data;
}
