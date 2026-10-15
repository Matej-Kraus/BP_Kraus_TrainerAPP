import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getLineupEditor,
  saveLineup,
  type LineupEditorPlayer,
  type LineupEditorRole,
  type LineupItem,
} from "@/api/lineup";
import { getMatch } from "@/api/matches";
import { useAuth } from "@/auth/AuthContext";
import { getErrorMessage } from "@/lib/errors";

type Role = LineupEditorRole;
type PlayerRow = LineupEditorPlayer;

const NO_ROWS: PlayerRow[] = [];

function roleText(role: Role) {
  if (role === "starter") return "Hraje";
  if (role === "sub") return "Střídá";
  return "Nehraje";
}

function sortPlayers(players: PlayerRow[]): PlayerRow[] {
  return [...players].sort((a, b) => {
    const d = a.default_jersey_number - b.default_jersey_number;
    if (d !== 0) return d;
    const an = `${a.last_name} ${a.first_name}`.toLowerCase();
    const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
    return an.localeCompare(bn);
  });
}

export default function LineupPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const isCoach = auth.user?.role === "coach";

  const id = Number(matchId);
  const isValidId = Number.isFinite(id);

  const lineupQuery = useQuery({
    queryKey: ["lineup-editor", id],
    queryFn: async () => sortPlayers((await getLineupEditor(id)).players),
    enabled: isValidId,
    refetchOnWindowFocus: false,
  });

  const matchQuery = useQuery({
    queryKey: ["match", id],
    queryFn: () => getMatch(id),
    enabled: isValidId,
    refetchOnWindowFocus: false,
  });
  // The lineup is locked once the match has started (backend enforces the same).
  const readOnly = matchQuery.data != null && matchQuery.data.status !== "planned";
  const canEdit = isCoach && !readOnly;

  // Local edits; null = untouched, so the server data is shown.
  const [draft, setDraft] = useState<PlayerRow[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const serverRows = lineupQuery.data ?? NO_ROWS;
  const rows = draft ?? serverRows;
  const loading = lineupQuery.isLoading;
  const error =
    actionError ??
    (!isValidId ? "Invalid match id" : lineupQuery.isError ? getErrorMessage(lineupQuery.error) : null);

  const saveMutation = useMutation({
    mutationFn: (items: LineupItem[]) => saveLineup(id, items),
    onSuccess: async () => {
      toast.success("Sestava uložena");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["lineup-editor", id] }),
        qc.invalidateQueries({ queryKey: ["roster-with-stats", id] }),
      ]);
    },
  });

  const saving = saveMutation.isPending;

  const startersCount = useMemo(
    () => rows.filter((r) => r.role === "starter").length,
    [rows]
  );
  const subsCount = useMemo(
    () => rows.filter((r) => r.role === "sub").length,
    [rows]
  );

  const duplicateNumbers = useMemo(() => {
    const counts = new Map<number, number>();
    rows.forEach((r) => {
      const effective = r.jersey_number_match ?? r.default_jersey_number;
      if (Number.isFinite(effective)) {
        counts.set(effective, (counts.get(effective) ?? 0) + 1);
      }
    });
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n));
  }, [rows]);

  const canSave = isValidId && duplicateNumbers.size === 0;

  function setJersey(playerId: number, value: string) {
    const t = value.trim();
    const n = t === "" ? null : Number(t);
    const safe = n !== null && Number.isFinite(n) ? n : null;

    setDraft((prev) =>
      (prev ?? serverRows).map((r) =>
        r.player_id === playerId ? { ...r, jersey_number_match: safe } : r
      )
    );
  }

  function trySetRole(playerId: number, role: Role) {
    const current = rows.find((p) => p.player_id === playerId);
    if (!current || current.role === role) return;

    const starters = rows.filter((p) => p.role === "starter").length;
    const subs = rows.filter((p) => p.role === "sub").length;

    if (role === "starter" && starters >= 11) {
      setActionError("V základu může být max 11 hráčů.");
      return;
    }
    if (role === "sub" && subs >= 5) {
      setActionError("Na lavičce může být max 5 hráčů.");
      return;
    }

    setActionError(null);
    setDraft(rows.map((p) => (p.player_id === playerId ? { ...p, role } : p)));
  }

  /** Resolves to true only when the lineup was actually saved. */
  async function save(): Promise<boolean> {
    setActionError(null);

    if (!canSave) {
      setActionError("Oprav duplicitní čísla dresů nebo match id.");
      return false;
    }

    try {
      const items: LineupItem[] = rows
        .filter((r): r is PlayerRow & { role: "starter" | "sub" } => r.role !== "out")
        .map((r) => ({
          player_id: r.player_id,
          role: r.role,
          jersey_number_match: r.jersey_number_match ?? r.default_jersey_number,
        }));
      await saveMutation.mutateAsync(items);
      return true;
    } catch (e: unknown) {
      setActionError(getErrorMessage(e));
      return false;
    }
  }

  async function goToLive() {
    if (readOnly || (await save())) {
      navigate(`/matches/${id}/live`);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Sestava</div>
          <div className="text-sm text-muted-foreground">
            {isValidId ? (
              <>
                Zápas ID: {id} • Hraje: {startersCount}/11 • Střídá: {subsCount}/5
              </>
            ) : (
              <>Invalid match id</>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/matches")}>
            Zpět
          </Button>
          <Button onClick={save} disabled={!canEdit || !canSave || saving}>
            Uložit
          </Button>
          <Button onClick={goToLive} disabled={readOnly ? false : !isCoach || !canSave || saving}>
            Přejít na Live
          </Button>
        </div>
      </div>

      {error && (
        <Card className="rounded-2xl border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {readOnly && (
        <Card className="rounded-2xl border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4 text-sm">
            Zápas už začal, sestavu nelze měnit.
          </CardContent>
        </Card>
      )}

      {duplicateNumbers.size > 0 && (
        <Card className="rounded-2xl border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            Duplicitní čísla dresu: {Array.from(duplicateNumbers).join(", ")}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Načítám…</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const effectiveJersey = r.jersey_number_match ?? r.default_jersey_number;
                const isDup = duplicateNumbers.has(effectiveJersey);

                return (
                  <div
                    key={r.player_id}
                    className="flex flex-col gap-2 rounded-xl border p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.first_name} {r.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Stav: {roleText(r.role)} • default #{r.default_jersey_number}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-28">
                        <Input
                          value={
                            r.jersey_number_match === null
                              ? ""
                              : String(r.jersey_number_match)
                          }
                          inputMode="numeric"
                          placeholder={`${r.default_jersey_number}`}
                          onChange={(e) => setJersey(r.player_id, e.target.value)}
                          disabled={!canEdit}
                        />
                      </div>

                      {isDup && <div className="text-xs text-destructive">dup číslo</div>}

                      <Button
                        type="button"
                        variant={r.role === "starter" ? "default" : "outline"}
                        onClick={() => trySetRole(r.player_id, "starter")}
                        disabled={!canEdit}
                      >
                        Hraje
                      </Button>

                      <Button
                        type="button"
                        variant={r.role === "sub" ? "default" : "outline"}
                        onClick={() => trySetRole(r.player_id, "sub")}
                        disabled={!canEdit}
                      >
                        Střídá
                      </Button>

                      <Button
                        type="button"
                        variant={r.role === "out" ? "default" : "outline"}
                        onClick={() => trySetRole(r.player_id, "out")}
                        disabled={!canEdit}
                      >
                        Nehraje
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}