import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { RosterWithStatsRow } from "@/api/types";
import type { SubstitutionDto } from "@/api/matches";
import { formatClock } from "@/lib/format";
import { playerName } from "@/features/live-match/utils";
import { useState } from "react";

type Props = {
  roster: RosterWithStatsRow[];
  substitutions: SubstitutionDto[];
  canSubstitute: boolean;
  isSubmitting: boolean;
  half: 1 | 2;
  clockSeconds: number;
  onCreate: (outId: number, inId: number, half: 1 | 2, secondInMatch: number) => Promise<void>;
};

export function SubstitutionsCard({
  roster,
  substitutions,
  canSubstitute,
  isSubmitting,
  half,
  clockSeconds,
  onCreate,
}: Props) {
  const onField = roster.filter((r) => r.on_field === true);
  /** Only substitutes who have not yet entered can be selected as "in" (backend enforces same). */
  const benchAvailableToEnter = roster.filter(
    (r) => r.role === "sub" && r.on_field !== true
  );

  const [outId, setOutId] = useState<number | null>(null);
  const [inId, setInId] = useState<number | null>(null);

  const canSubmit =
    canSubstitute &&
    !isSubmitting &&
    onField.length > 0 &&
    benchAvailableToEnter.length > 0 &&
    outId != null &&
    inId != null &&
    outId !== inId;

  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <CardTitle>Střídání</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="text-sm font-semibold text-foreground">Aktuálně na hřišti ({onField.length})</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {onField.length === 0 ? (
              <span className="text-xs text-muted-foreground">Žádní hráči na hřišti.</span>
            ) : (
              onField.map((p) => (
                <span
                  key={p.player_id}
                  className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium"
                >
                  #{p.jersey_number_match} {playerName(p)}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Hráč ven (na hřišti)</div>
            <select
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
              disabled={!canSubstitute || isSubmitting || onField.length === 0}
              value={outId ?? ""}
              onChange={(e) => setOutId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Vyber hráče</option>
              {onField.map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  #{p.jersey_number_match} {playerName(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Hráč dovnitř (lavička)</div>
            <select
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
              disabled={!canSubstitute || isSubmitting || benchAvailableToEnter.length === 0}
              value={inId ?? ""}
              onChange={(e) => setInId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Vyber hráče (lavička)</option>
              {benchAvailableToEnter.map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  #{p.jersey_number_match} {playerName(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button
              className="h-10 px-4"
              disabled={!canSubmit}
              onClick={async () => {
                if (outId == null || inId == null) return;
                await onCreate(outId, inId, half, clockSeconds);
                setOutId(null);
                setInId(null);
              }}
            >
              Potvrdit střídání
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-foreground">Historie střídání</div>
          {substitutions.length === 0 ? (
            <div className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Zatím žádná střídání. Každé provedené střídání se zde zobrazí s časem a jmény.
            </div>
          ) : (
            <div className="space-y-2">
              {[...substitutions].reverse().map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted-foreground">
                      {formatClock(s.second_in_match)} — poločas {s.half}
                    </span>
                    <span className="text-xs text-muted-foreground">#{s.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.player_out_name}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{s.player_in_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

