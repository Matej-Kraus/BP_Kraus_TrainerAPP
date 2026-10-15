import type { EventType } from "@/api/matches";
import type { PlayerStats } from "@/api/types";

/** Czech labels for every event type (single source for roster, timeline, reports). */
export const EVENT_LABELS: Record<EventType, string> = {
  goal: "Gól",
  assist: "Asistence",
  shot_on_goal: "Střela na bránu",
  shot_off_goal: "Střela mimo",
  penalty: "Penalta",
  pass: "Přihrávka",
  error: "Chyba",
  won_ball: "Zisk míče",
  lost_ball: "Ztráta míče",
  won_duel: "Souboj vyhraný",
  lost_duel: "Souboj prohraný",
  foul: "Faul",
  yellow_card: "Žlutá karta",
  red_card: "Červená karta",
};

/** Order in which event buttons are shown for each player. */
export const EVENT_ORDER: EventType[] = [
  "goal",
  "assist",
  "shot_on_goal",
  "shot_off_goal",
  "penalty",
  "pass",
  "error",
  "won_ball",
  "lost_ball",
  "won_duel",
  "lost_duel",
  "foul",
  "yellow_card",
  "red_card",
];

/** Which aggregated stat column an event type increments. */
export const EVENT_TO_STATS_KEY = {
  goal: "goals",
  assist: "assists",
  error: "errors",
  won_ball: "won_balls",
  lost_ball: "lost_balls",
  foul: "fouls",
  pass: "passes",
  won_duel: "won_duels",
  lost_duel: "lost_duels",
  shot_on_goal: "shots_on_goal",
  shot_off_goal: "shots_off_goal",
  yellow_card: "yellow_cards",
  red_card: "red_cards",
  penalty: "penalties",
} as const satisfies Record<EventType, keyof PlayerStats>;
