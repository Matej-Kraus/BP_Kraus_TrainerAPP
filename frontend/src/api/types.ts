export type PlayerStats = {
    goals: number;
    assists: number;
    errors: number;
    won_balls: number;
    lost_balls: number;
    fouls: number;
    passes: number;
    passes_failed: number;
    won_duels: number;
    lost_duels: number;
    shots_on_goal: number;
    shots_off_goal: number;
    yellow_cards: number;
    red_cards: number;
    penalties: number;
  };
  
  export type RosterWithStatsRow = {
    player_id: number;
    first_name: string;
    last_name: string;
    role: "starter" | "sub";
    jersey_number_match: number;
    stats: PlayerStats;
    /** Computed by the backend (single source of truth). */
    auto_rating: number;
    coach_rating: number | null;
    final_rating: number;
    on_field?: boolean;
  };

export type MatchEvent = {
  id: number;
  match_id: number;
  player_id: number;
  event_type: string;
  delta: number;
  half: 1 | 2;
  second_in_match: number;
  client_event_id?: string | null;
  created_by_email?: string | null;
};