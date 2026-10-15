import { api } from "./client";

export type Player = {
  id: number;
  first_name: string;
  last_name: string;
  jersey_number: number;
  position?: string | null;
  archived_at?: string | null;
};

export type ImportPlayersResult = {
  ok: boolean;
  created: number;
  updated: number;
  assigned?: number;
  season_id?: number;
  errors: Array<{ line: number; error: string; row: Record<string, unknown> }>;
};

export async function listPlayers(seasonId?: number, includeArchived = false) {
  const params: Record<string, number | boolean> = {};
  if (seasonId != null) params.season_id = seasonId;
  if (includeArchived) params.include_archived = true;
  const res = await api.get<Player[]>("/players", { params });
  return res.data;
}

export async function createPlayer(payload: {
  first_name: string;
  last_name: string;
  jersey_number: number;
  position?: string;
  season_id?: number;
}) {
  const res = await api.post<Player>("/players", payload);
  return res.data;
}

export async function deletePlayer(playerId: number) {
  const res = await api.delete(`/players/${playerId}`);
  return res.data;
}

export async function importPlayersCsv(file: File, seasonId?: number) {
  const form = new FormData();
  form.append("file", file);
  if (seasonId != null) {
    form.append("season_id", String(seasonId));
  }
  const res = await api.post("/players/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data as ImportPlayersResult;
}

export async function exportPlayersCsv() {
  const res = await api.get("/export/players.csv", { responseType: "blob" });
  return res.data as Blob;
}

export async function archivePlayer(playerId: number) {
  const res = await api.post<Player>(`/players/${playerId}/archive`);
  return res.data;
}

export async function unarchivePlayer(playerId: number) {
  const res = await api.post<Player>(`/players/${playerId}/unarchive`);
  return res.data;
}

export async function removePlayerFromSeason(seasonId: number, playerId: number) {
  const res = await api.delete(`/seasons/${seasonId}/players/${playerId}`);
  return res.data;
}
