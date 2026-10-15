import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { getErrorMessage } from "@/lib/errors";

type Role = "starter" | "sub" | "out";

type PlayerRow = {
  player_id: number;
  first_name: string;
  last_name: string;
  default_jersey_number: number;
  role: Role;
  jersey_number_match: number | null; // null => použije se default při uložení
};

type LineupEditorResponse = {
  match_id: number;
  taken_numbers: number[];
  players: PlayerRow[];
};

function roleText(role: Role) {
  if (role === "starter") return "Hraje";
  if (role === "sub") return "Střídá";
  return "Nehraje";
}

export default function LineupPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const isCoach = auth.user?.role === "coach";

  const id = Number(matchId);
  const isValidId = Number.isFinite(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await api.get<LineupEditorResponse>(`/matches/${id}/lineup-editor`);

        const sorted = [...res.data.players].sort((a, b) => {
          const d = a.default_jersey_number - b.default_jersey_number;
          if (d !== 0) return d;
          const an = `${a.last_name} ${a.first_name}`.toLowerCase();
          const bn = `${b.last_name} ${b.first_name}`.toLowerCase();
          return an.localeCompare(bn);
        });

        setRows(sorted);
      } catch (e: unknown) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    }

    if (!isValidId) {
      setLoading(false);
      setRows([]);
      setError("Invalid match id");
      return;
    }

    load();
  }, [id, isValidId]);

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

    setRows((prev) =>
      prev.map((r) =>
        r.player_id === playerId ? { ...r, jersey_number_match: safe } : r
      )
    );
  }

  function trySetRole(playerId: number, role: Role) {
    setRows((prev) => {
      const current = prev.find((p) => p.player_id === playerId);
      if (!current) return prev;
      if (current.role === role) return prev;

      const starters = prev.filter((p) => p.role === "starter").length;
      const subs = prev.filter((p) => p.role === "sub").length;

      if (role === "starter" && starters >= 11) {
        setError("V základu může být max 11 hráčů.");
        return prev;
      }
      if (role === "sub" && subs >= 5) {
        setError("Na lavičce může být max 5 hráčů.");
        return prev;
      }

      setError(null);
      return prev.map((p) => (p.player_id === playerId ? { ...p, role } : p));
    });
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);

    if (!canSave) {
      setError("Oprav duplicitní čísla dresů nebo match id.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        items: rows
          .filter((r) => r.role !== "out")
          .map((r) => ({
            player_id: r.player_id,
            role: r.role,
            jersey_number_match: r.jersey_number_match ?? r.default_jersey_number,
          })),
      };

      await api.put(`/matches/${id}/lineup`, payload);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function goToLive() {
    setError(null);
    save()
      .then(() => {
        navigate(`/matches/${id}/live`);
      })
      .catch(() => {
        // Error already set in save()
      });
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
          <Button onClick={save} disabled={!isCoach || !canSave || saving}>
            Uložit
          </Button>
          <Button onClick={goToLive} disabled={!isCoach || !canSave || saving}>
            Přejít na Live
          </Button>
        </div>
      </div>

      {error && (
        <Card className="rounded-2xl border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
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
                        />
                      </div>

                      {isDup && <div className="text-xs text-destructive">dup číslo</div>}

                      <Button
                        type="button"
                        variant={r.role === "starter" ? "default" : "outline"}
                        onClick={() => trySetRole(r.player_id, "starter")}
                      >
                        Hraje
                      </Button>

                      <Button
                        type="button"
                        variant={r.role === "sub" ? "default" : "outline"}
                        onClick={() => trySetRole(r.player_id, "sub")}
                      >
                        Střídá
                      </Button>

                      <Button
                        type="button"
                        variant={r.role === "out" ? "default" : "outline"}
                        onClick={() => trySetRole(r.player_id, "out")}
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