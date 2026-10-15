import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPlayer,
  deletePlayer,
  exportPlayersCsv,
  importPlayersCsv,
  listPlayers,
  type ImportPlayersResult,
  type Player,
} from "../api/players";
import { useAuth } from "@/auth/AuthContext";
import { listSeasons } from "@/api/seasons";
import { getActiveSeasonId, setActiveSeasonId } from "@/state/season";
import { downloadBlob } from "@/utils/download";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PlayersPage() {
  const qc = useQueryClient();
  const auth = useAuth();
  const isCoach = auth.user?.role === "coach";
  const [seasonId, setSeasonId] = useState<number>(() => getActiveSeasonId() ?? 1);

  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: listSeasons,
    refetchOnWindowFocus: false,
  });

  const selectedSeasonId = useMemo(() => {
    const seasons = seasonsQuery.data ?? [];
    if (seasons.length === 0) return seasonId;
    if (seasons.some((s) => s.id === seasonId)) return seasonId;
    const active = getActiveSeasonId();
    if (active && seasons.some((s) => s.id === active)) return active;
    return seasons[0].id;
  }, [seasonId, seasonsQuery.data]);

  const playersQuery = useQuery({
    queryKey: ["players", selectedSeasonId],
    queryFn: () => listPlayers(selectedSeasonId),
    refetchOnWindowFocus: false,
    enabled: Number.isFinite(selectedSeasonId) && selectedSeasonId > 0,
  });

  const createMutation = useMutation({
    mutationFn: createPlayer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["players", selectedSeasonId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePlayer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["players", selectedSeasonId] }),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => importPlayersCsv(file, selectedSeasonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["players", selectedSeasonId] }),
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jersey, setJersey] = useState<string>("");
  const [position, setPosition] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);

  const jerseyNumber = useMemo(() => Number(jersey || "0"), [jersey]);
  const jerseyAlreadyUsed =
    Number.isFinite(jerseyNumber) &&
    jerseyNumber > 0 &&
    (playersQuery.data ?? []).some((p) => p.jersey_number === jerseyNumber);

  const canCreate =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    Number.isFinite(jerseyNumber) &&
    jerseyNumber > 0 &&
    jerseyNumber <= 99 &&
    !jerseyAlreadyUsed;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Hráči</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Sezóna</div>
            <select
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm md:w-80"
              value={selectedSeasonId}
              onChange={(e) => {
                const sid = Number(e.target.value);
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

          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Import hráčů (CSV)</div>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={!isCoach}
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
              <div className="text-xs text-muted-foreground">
                Hlavička: <code>first_name,last_name,jersey_number,position</code>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!isCoach || !csvFile || importMutation.isPending}
                onClick={() => csvFile && importMutation.mutate(csvFile)}
              >
                Importovat CSV
              </Button>
              <Button
                variant="outline"
                disabled={!isCoach}
                onClick={async () => {
                  const blob = await exportPlayersCsv();
                  downloadBlob(blob, "players.csv");
                }}
              >
                Export CSV
              </Button>
            </div>
          </div>

          {importMutation.isSuccess && (
            <div className="rounded-xl border p-3 text-sm">
              {(() => {
                const d = importMutation.data as ImportPlayersResult;
                return (
                  <>
                    Import hotový. Vytvořeno: {d.created}, upraveno: {d.updated}, chyby:{" "}
                    {d.errors.length}
                  </>
                );
              })()}
            </div>
          )}
          {importMutation.isError && (
            <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
              Import error: {(importMutation.error as Error).message}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-1">
              <div className="text-sm text-muted-foreground mb-1">Jméno</div>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>

            <div className="md:col-span-1">
              <div className="text-sm text-muted-foreground mb-1">Příjmení</div>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>

            <div className="md:col-span-1">
              <div className="text-sm text-muted-foreground mb-1">Default dres</div>
              <Input value={jersey} onChange={(e) => setJersey(e.target.value)} inputMode="numeric" />
            </div>

            <div className="md:col-span-1">
              <div className="text-sm text-muted-foreground mb-1">Pozice (volitelně)</div>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="FW/DF/GK..." />
            </div>

            <div className="md:col-span-1 flex items-end">
              <Button
                className="w-full"
                disabled={!isCoach || !canCreate || createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    jersey_number: jerseyNumber,
                    position: position.trim() || undefined,
                    season_id: selectedSeasonId,
                  })
                }
              >
                Přidat hráče
              </Button>
            </div>
          </div>
          {jerseyAlreadyUsed && (
            <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
              Hráč s tímto číslem dresu už v této sezóně existuje.
            </div>
          )}

          {playersQuery.isLoading && <div>Načítám…</div>}

          {playersQuery.isError && (
            <div className="text-red-600">
              Error: {(playersQuery.error as Error).message}
            </div>
          )}

          {playersQuery.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead>Hráč</TableHead>
                  <TableHead className="w-24">Dres</TableHead>
                  <TableHead className="w-28">Pozice</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playersQuery.data.map((p: Player) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.id}</TableCell>
                    <TableCell className="font-medium">
                      {p.first_name} {p.last_name}
                    </TableCell>
                    <TableCell>{p.jersey_number}</TableCell>
                    <TableCell>{p.position ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isCoach || deleteMutation.isPending}
                        onClick={() => setDeleteTarget(p)}
                      >
                        Smazat
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {playersQuery.data && playersQuery.data.length === 0 && (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              V této sezóně zatím nejsou žádní hráči. Přidej hráče ručně nebo importuj CSV.
            </div>
          )}

          {createMutation.isError && (
            <div className="text-red-600">
              Create error: {(createMutation.error as Error).message}
            </div>
          )}
          {deleteMutation.isError && (
            <div className="text-red-600">
              Delete error: {(deleteMutation.error as Error).message}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Smazat hráče?"
        description={
          deleteTarget
            ? `Opravdu smazat hráče #${deleteTarget.jersey_number} ${deleteTarget.first_name} ${deleteTarget.last_name}?`
            : undefined
        }
        confirmLabel="Smazat"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => toast.success("Hráč smazán"),
            onSettled: () => setDeleteTarget(null),
          });
        }}
      />
    </div>
  );
}