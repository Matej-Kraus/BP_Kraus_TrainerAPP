import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthContext";
import {
  exportMatchEventsCsv,
  listMatches,
  createMatch,
  deleteMatch,
  type MatchDto,
} from "@/api/matches";
import { listSeasons } from "@/api/seasons";
import { getActiveSeasonId, onActiveSeasonChange, setActiveSeasonId } from "@/state/season";
import { downloadBlob } from "@/utils/download";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, matchStatusLabel } from "@/lib/format";

function getNowLocalDateTimeInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoDateTime(value: string): string {
  // datetime-local input provides "YYYY-MM-DDTHH:mm"; backend accepts ISO-like datetime.
  return value.length === 16 ? `${value}:00` : value;
}

export default function MatchesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const auth = useAuth();
  const isCoach = auth.user?.role === "coach";


  const [opponent, setOpponent] = useState("Sparta");
  const [competition, setCompetition] = useState("Liga");
  const [matchDate, setMatchDate] = useState(getNowLocalDateTimeInputValue);
  const [seasonId, setSeasonId] = useState<number>(() => getActiveSeasonId() ?? 1);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MatchDto | null>(null);

  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: listSeasons,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const unsub = onActiveSeasonChange((sid) => setSeasonId(sid));
    return unsub;
  }, []);

  useEffect(() => {
    if (!seasonsQuery.data || seasonsQuery.data.length === 0) return;
    const active = getActiveSeasonId();
    if (active && seasonsQuery.data.some((s) => s.id === active)) {
      setSeasonId(active);
      return;
    }
    const fallback = seasonsQuery.data[0].id;
    setSeasonId(fallback);
    setActiveSeasonId(fallback);
  }, [seasonsQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: deleteMatch,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matches", seasonId] });
      void qc.invalidateQueries({ queryKey: ["team-stats"] });
      void qc.invalidateQueries({ queryKey: ["team-matches-breakdown"] });
      void qc.invalidateQueries({ queryKey: ["leaderboards"] });
    },
  });

  const { data: matches, isLoading } = useQuery({
    queryKey: ["matches", seasonId],
    queryFn: () => listMatches(seasonId),
  });
  const allMatchesQuery = useQuery({
    queryKey: ["matches", "all"],
    queryFn: () => listMatches(),
    refetchOnWindowFocus: false,
  });

  const sorted = useMemo(() => {
    return [...(matches ?? [])].sort((a, b) => b.id - a.id);
  }, [matches]);
  const seasonMatchCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of allMatchesQuery.data ?? []) {
      counts.set(m.season_id, (counts.get(m.season_id) ?? 0) + 1);
    }
    return counts;
  }, [allMatchesQuery.data]);
  const suggestedSeason = useMemo(() => {
    const seasons = seasonsQuery.data ?? [];
    return seasons.find((s) => (seasonMatchCounts.get(s.id) ?? 0) > 0) ?? null;
  }, [seasonMatchCounts, seasonsQuery.data]);

  async function handleCreateMatch() {
    try {
      setErr(null);
      setCreating(true);
      const created = await createMatch({
        season_id: seasonId,
        opponent,
        competition,
        match_date: toIsoDateTime(matchDate),
      });
      const newId = created.id;
      if (!Number.isFinite(newId)) {
        setErr(`Backend nevrátil id. Odpověď: ${JSON.stringify(created)}`);
        return;
      }
      navigate(`/matches/${newId}/lineup`);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Zápasy</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {err && (
            <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
              {err}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Soupeř</div>
              <Input value={opponent} onChange={(e) => setOpponent(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Soutěž</div>
              <Input value={competition} onChange={(e) => setCompetition(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Datum/čas</div>
              <Input
                type="datetime-local"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Sezóna</div>
              <select
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
                value={seasonId}
                onChange={(e) => {
                  const sid = Number(e.target.value || 1);
                  setSeasonId(sid);
                  setActiveSeasonId(sid);
                }}
              >
                {(seasonsQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (id {s.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreateMatch} disabled={!isCoach || creating}>
              Vytvořit zápas → Sestava
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Seznam zápasů</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Načítám…</div>
          ) : sorted.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed p-4">
              <div className="text-sm text-muted-foreground">
                V této sezóně zatím nejsou žádné zápasy.
              </div>
              {suggestedSeason && suggestedSeason.id !== seasonId && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    V sezóně <strong>{suggestedSeason.name}</strong> je{" "}
                    {seasonMatchCounts.get(suggestedSeason.id) ?? 0} zápasů.
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSeasonId(suggestedSeason.id);
                      setActiveSeasonId(suggestedSeason.id);
                    }}
                  >
                    Přepnout na sezónu s daty
                  </Button>
                </div>
              )}
            </div>
          ) : (
            sorted.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    #{m.id} vs {m.opponent}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[m.competition, formatDateTime(m.match_date), matchStatusLabel(m.status)]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate(`/matches/${m.id}/lineup`)}>
                    Sestava
                  </Button>
                  <Button
                    onClick={() =>
                      navigate(
                        m.status === "finished"
                          ? `/matches/${m.id}/evaluation`
                          : `/matches/${m.id}/live`,
                      )
                    }
                  >
                    {m.status === "finished" ? "Vyhodnocení" : "Live"}
                  </Button>
                  {isCoach && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const blob = await exportMatchEventsCsv(m.id);
                        downloadBlob(blob, `match_${m.id}_events.csv`);
                      }}
                    >
                      Export events
                    </Button>
                  )}
                  {isCoach && (
                    <Button
                      variant="destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteTarget(m)}
                    >
                      Smazat
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Smazat zápas?"
        description={
          deleteTarget
            ? `Opravdu smazat zápas #${deleteTarget.id} vs ${deleteTarget.opponent}? Tato akce odstraní i události, statistiky, sestavu, střídání a hodnocení.`
            : undefined
        }
        confirmLabel="Smazat"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            setErr(null);
            await deleteMutation.mutateAsync(deleteTarget.id);
            toast.success("Zápas smazán");
          } catch (e: unknown) {
            setErr(getErrorMessage(e));
          } finally {
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}