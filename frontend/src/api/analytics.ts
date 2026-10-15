import { api } from "./client";
import type { PlayerStats } from "./types";

export type PlayerPerformanceRow = {
  match_id: number;
  match_date: string;
  opponent: string;
  competition?: string | null;
  status: string;
  stats: { match_id: number; player_id: number } & PlayerStats;
  /** Coach's mark (if any). */
  rating?: number | null;
  note?: string | null;
  auto_rating: number;
  final_rating: number;
  /** Pass events with +1 (recorded) */
  passes_success: number;
  /** Pass events with −1 (correction / removed) */
  passes_unsuccess: number;
};

export type LeaderboardRow = {
  player_id: number;
  first_name: string;
  last_name: string;
  jersey_number: number;
  games: number;
  goals: number;
  assists: number;
  passes: number;
  yellow_cards: number;
  red_cards: number;
  avg_rating?: number | null;
};

export async function playerPerformance(playerId: number, seasonId?: number) {
  const res = await api.get<PlayerPerformanceRow[]>(`/players/${playerId}/performance`, {
    params: seasonId ? { season_id: seasonId } : undefined,
  });
  return res.data;
}

export async function seasonLeaderboards(seasonId: number) {
  const res = await api.get<LeaderboardRow[]>(`/seasons/${seasonId}/leaderboards`);
  return res.data;
}

export type TeamMatchBreakdownRow = {
  match_id: number;
  match_date: string;
  opponent: string;
  competition?: string | null;
  status: string;
  goals: number;
  assists: number;
  passes: number;
  passes_success: number;
  passes_unsuccess: number;
  shots_on_goal: number;
  shots_off_goal: number;
  won_duels: number;
  lost_duels: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
};

export async function teamMatchesBreakdown(seasonId: number) {
  const res = await api.get<TeamMatchBreakdownRow[]>(
    `/seasons/${seasonId}/team-matches-breakdown`
  );
  return res.data;
}

