import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { EventType } from "@/api/matches";
import type { RosterWithStatsRow } from "@/api/types";

import { playerName } from "@/features/live-match/utils";
import { EVENT_LABELS, EVENT_ORDER, EVENT_TO_STATS_KEY } from "@/lib/events";

const EVENT_TONE: Record<EventType, string> = {
  goal: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
  assist: "border-lime-200 bg-lime-50/70 dark:border-lime-900 dark:bg-lime-950/30",
  shot_on_goal: "border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30",
  shot_off_goal: "border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/30",
  penalty: "border-cyan-200 bg-cyan-50/70 dark:border-cyan-900 dark:bg-cyan-950/30",
  pass: "border-indigo-200 bg-indigo-50/70 dark:border-indigo-900 dark:bg-indigo-950/30",
  pass_failed: "border-purple-200 bg-purple-50/70 dark:border-purple-900 dark:bg-purple-950/30",
  won_ball: "border-violet-200 bg-violet-50/70 dark:border-violet-900 dark:bg-violet-950/30",
  lost_ball: "border-fuchsia-200 bg-fuchsia-50/70 dark:border-fuchsia-900 dark:bg-fuchsia-950/30",
  won_duel: "border-orange-200 bg-orange-50/70 dark:border-orange-900 dark:bg-orange-950/30",
  lost_duel: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
  foul: "border-zinc-300 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40",
  yellow_card: "border-yellow-300 bg-yellow-50/90 dark:border-yellow-800 dark:bg-yellow-950/30",
  red_card: "border-red-300 bg-red-50/90 dark:border-red-800 dark:bg-red-950/30",
  error: "border-rose-300 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/30",
};

type Props = {
  roster: RosterWithStatsRow[];
  isCoach: boolean;
  isLoading: boolean;
  onDelta: (playerId: number, eventType: EventType, delta: 1 | -1) => Promise<void>;
  /** When false, event buttons are disabled (e.g. player not on field) */
  canRecordForPlayer?: (row: RosterWithStatsRow) => boolean;
};

export function RosterEventsCard({
  roster,
  isCoach,
  isLoading,
  onDelta,
  canRecordForPlayer,
}: Props) {
  const canRecordFor = canRecordForPlayer ?? (() => true);
  const activeRoster = roster.filter((p) => p.on_field === true);

  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <CardTitle>Hráči a události</CardTitle>
      </CardHeader>
      <CardContent className="w-full p-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Načítám sestavu…</div>
        ) : roster.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Sestava pro zápas je prázdná. Nastav ji v „Sestava“ u zápasu.
          </div>
        ) : activeRoster.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Na hřišti aktuálně není žádný hráč k záznamu.
          </div>
        ) : (
          <div className="w-full space-y-3">
            {activeRoster.map((p) => {
              const canRecordThis = isCoach && canRecordFor(p);
              return (
                <div
                  key={p.player_id}
                  className="w-full rounded-xl border bg-card px-2.5 py-2"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold truncate block">
                        #{p.jersey_number_match} {playerName(p)}
                      </span>
                      <span
                        className={
                          p.on_field === true
                            ? "text-[10px] font-medium text-green-700 dark:text-green-400"
                            : "text-[10px] text-muted-foreground"
                        }
                      >
                        {p.on_field === true
                          ? "Na hristi"
                          : p.role === "starter"
                            ? "Vystridan"
                            : "Na lavicce"}
                      </span>
                    </div>
                    <div />
                  </div>

                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 md:grid-cols-7">
                    {EVENT_ORDER.map((event) => {
                      const value = p.stats[EVENT_TO_STATS_KEY[event]] ?? 0;
                      return (
                        <div
                          key={event}
                          className={`rounded border p-0.5 ${EVENT_TONE[event]}`}
                          title={EVENT_LABELS[event]}
                        >
                          <div className="h-4 truncate text-center text-[9px] font-semibold leading-tight">
                            {EVENT_LABELS[event]}
                          </div>
                          <div className="mb-0.5 text-center tabular-nums text-[9px] font-semibold text-muted-foreground">
                            {value}
                          </div>
                          <div className="grid grid-cols-2 items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="secondary"
                              className="h-8 w-full min-h-8 touch-manipulation text-xl font-bold"
                              disabled={!canRecordThis || isLoading || value <= 0}
                              onClick={() => onDelta(p.player_id, event, -1)}
                            >
                              −
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="secondary"
                              className="h-8 w-full min-h-8 touch-manipulation text-xl font-bold"
                              disabled={!canRecordThis || isLoading}
                              onClick={() => onDelta(p.player_id, event, 1)}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

