import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventType } from "@/api/matches";

import { formatClock } from "@/lib/format";

const EVENT_LABEL: Record<EventType, string> = {
  goal: "Gól",
  assist: "Asistence",
  error: "Chyba",
  won_ball: "Získaný míč",
  lost_ball: "Ztráta míče",
  foul: "Faul",
  pass: "Přihrávka",
  won_duel: "Vyhraný souboj",
  lost_duel: "Prohraný souboj",
  shot_on_goal: "Střela na bránu",
  shot_off_goal: "Střela mimo",
  yellow_card: "Žlutá karta",
  red_card: "Červená karta",
  penalty: "Penalta",
};

type Props = {
  half: 1 | 2;
  onHalfChange: (half: 1 | 2) => void;
  secondInMatch: number;
  onSecondChange: (sec: number) => void;
  eventType: EventType;
  onEventTypeChange: (type: EventType) => void;
};

export function EventControlsCard({
  half,
  onHalfChange,
  secondInMatch,
  onSecondChange,
  eventType,
  onEventTypeChange,
}: Props) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Záznam událostí</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Poločas</div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={half === 1 ? "default" : "outline"}
                onClick={() => onHalfChange(1)}
              >
                1
              </Button>
              <Button
                type="button"
                variant={half === 2 ? "default" : "outline"}
                onClick={() => onHalfChange(2)}
              >
                2
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Čas (sekundy)</div>
            <Input
              value={String(secondInMatch)}
              inputMode="numeric"
              onChange={(e) => onSecondChange(Number(e.target.value || 0))}
            />
            <div className="text-xs text-muted-foreground">{formatClock(secondInMatch)}</div>
          </div>

          <div className="space-y-1 md:col-span-2">
            <div className="text-xs text-muted-foreground">Typ události</div>
            <select
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
              value={eventType}
              onChange={(e) => onEventTypeChange(e.target.value as EventType)}
            >
              {(Object.keys(EVENT_LABEL) as EventType[]).map((k) => (
                <option key={k} value={k}>
                  {EVENT_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { EVENT_LABEL };

