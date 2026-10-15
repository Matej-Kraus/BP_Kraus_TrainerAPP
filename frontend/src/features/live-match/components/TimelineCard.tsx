import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { MatchEvent, RosterWithStatsRow } from "@/api/types";
import type { EventType } from "@/api/matches";

import { EVENT_LABELS } from "@/lib/events";
import { formatClock } from "@/lib/format";
import { playerName } from "@/features/live-match/utils";

type Props = {
  events: MatchEvent[];
  roster: RosterWithStatsRow[];
};

export function TimelineCard({ events, roster }: Props) {
  if (events.length === 0) {
    return (
      <Card className="w-full rounded-2xl">
        <CardHeader>
          <CardTitle>Timeline (poslední události)</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Zatím žádné události.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <CardTitle>Timeline (poslední události)</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-2">
          {events.map((ev) => {
            const who = roster.find((r) => r.player_id === ev.player_id);
            const label = EVENT_LABELS[ev.event_type as EventType] ?? ev.event_type;
            return (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {label} ({ev.delta > 0 ? "+" : ""}
                    {ev.delta})
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatClock(ev.second_in_match)} • poločas {ev.half} •{" "}
                    {who ? `#${who.jersey_number_match} ${playerName(who)}` : `player_id=${ev.player_id}`}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">#{ev.id}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

