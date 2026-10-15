import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { MatchEvent, RosterWithStatsRow } from "@/api/types";

import { playerName } from "@/features/live-match/utils";
import { EVENT_LABELS } from "@/lib/events";
import { formatClock } from "@/lib/format";
import type { EventType } from "@/api/matches";

type Props = {
  /** Newest first. */
  events: MatchEvent[];
  roster: RosterWithStatsRow[];
  canDelete?: boolean;
  onDelete?: (event: MatchEvent) => void;
};

export function TimelineCard({ events, roster, canDelete = false, onDelete }: Props) {
  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <CardTitle>Poslední události</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground">Zatím žádné události.</div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => {
              const who = roster.find((r) => r.player_id === ev.player_id);
              const label = EVENT_LABELS[ev.event_type as EventType] ?? ev.event_type;
              const pending = ev.id < 0; // not confirmed by the server yet
              return (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatClock(ev.second_in_match)} • poločas {ev.half} •{" "}
                      {who ? `#${who.jersey_number_match} ${playerName(who)}` : `hráč ${ev.player_id}`}
                      {ev.created_by_email ? ` • ${ev.created_by_email}` : ""}
                    </div>
                  </div>
                  {onDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canDelete || pending}
                      onClick={() => onDelete(ev)}
                    >
                      {pending ? "Odesílám…" : "Smazat"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
