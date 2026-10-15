import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { listSeasons } from "@/api/seasons";
import { teamStatsSeason } from "@/api/reports";
import {
  seasonLeaderboards,
  playerPerformance,
  teamMatchesBreakdown,
} from "@/api/analytics";
import { listPlayers } from "@/api/players";
import { formatDate } from "@/lib/format";
import { getActiveSeasonId, onActiveSeasonChange, setActiveSeasonId } from "@/state/season";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function shortOpp(name: string, max = 14) {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function computeAutoRatingFromStats(stats: {
  goals: number;
  assists: number;
  shots_on_goal: number;
  shots_off_goal: number;
  passes: number;
  won_duels: number;
  lost_duels: number;
  won_balls: number;
  errors: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
  penalties: number;
}) {
  const positive =
    stats.goals * 5 +
    stats.assists * 3 +
    stats.shots_on_goal * 1.5 +
    stats.shots_off_goal * 0.5 +
    stats.passes * 0.05 +
    stats.won_duels * 0.7 +
    stats.won_balls * 0.5 +
    stats.penalties * 2;
  const negative =
    stats.errors * 2 +
    stats.lost_duels * 0.7 +
    stats.fouls * 0.5 +
    stats.yellow_cards * 1.5 +
    stats.red_cards * 4;
  const score = positive - negative;
  const norm = (score - -5) / (15 - -5);
  const scaled = 1 + 9 * clamp(norm, 0, 1);
  return Math.round(scaled * 10) / 10;
}

const COL = {
  goals: "hsl(var(--chart-1))",
  shotsOn: "hsl(var(--chart-2))",
  shotsOff: "hsl(var(--chart-3))",
  duelsWon: "hsl(var(--chart-1))",
  duelsLost: "hsl(var(--chart-4))",
  yellow: "#eab308",
  red: "#ef4444",
  fouls: "#64748b",
  passSuccess: "hsl(var(--chart-2))",
  passFail: "hsl(var(--chart-4))",
  assists: "hsl(var(--chart-3))",
};

export default function AnalyticsPage() {
  const seasonsQuery = useQuery({
    queryKey: ["seasons"],
    queryFn: listSeasons,
    refetchOnWindowFocus: false,
  });

  const [seasonId, setSeasonId] = useState<number>(() => getActiveSeasonId() ?? 1);
  const [playerId, setPlayerId] = useState<number>(1);
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

  useEffect(() => {
    const unsub = onActiveSeasonChange((sid) => setSeasonId(sid));
    return unsub;
  }, []);

  useEffect(() => {
    if (selectedSeasonId > 0) {
      setActiveSeasonId(selectedSeasonId);
    }
  }, [selectedSeasonId]);

  const selectedPlayerId = useMemo(() => {
    const players = playersQuery.data ?? [];
    if (players.length === 0) return 0;
    if (players.some((p) => p.id === playerId)) return playerId;
    return players[0].id;
  }, [playerId, playersQuery.data]);

  const teamStatsQuery = useQuery({
    queryKey: ["team-stats", selectedSeasonId],
    queryFn: () => teamStatsSeason(selectedSeasonId),
    enabled: Number.isFinite(selectedSeasonId) && selectedSeasonId > 0,
    refetchOnWindowFocus: false,
  });

  const teamBreakdownQuery = useQuery({
    queryKey: ["team-matches-breakdown", selectedSeasonId],
    queryFn: () => teamMatchesBreakdown(selectedSeasonId),
    enabled: Number.isFinite(selectedSeasonId) && selectedSeasonId > 0,
    refetchOnWindowFocus: false,
  });

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboards", selectedSeasonId],
    queryFn: () => seasonLeaderboards(selectedSeasonId),
    enabled: Number.isFinite(selectedSeasonId) && selectedSeasonId > 0,
    refetchOnWindowFocus: false,
  });

  const perfQuery = useQuery({
    queryKey: ["player-performance", selectedPlayerId, selectedSeasonId],
    queryFn: () => playerPerformance(selectedPlayerId, selectedSeasonId),
    enabled:
      Number.isFinite(selectedPlayerId) &&
      selectedPlayerId > 0 &&
      Number.isFinite(selectedSeasonId) &&
      selectedSeasonId > 0,
    refetchOnWindowFocus: false,
  });

  const teamChartData = useMemo(() => {
    return (teamBreakdownQuery.data ?? []).map((r, i) => ({
      key: `${r.match_id}-${i}`,
      label: shortOpp(r.opponent, 12),
      date: formatDate(r.match_date),
      goals: r.goals,
      assists: r.assists,
      shots_on_goal: r.shots_on_goal,
      shots_off_goal: r.shots_off_goal,
      passes: r.passes,
      passes_success: r.passes_success,
      passes_unsuccess: r.passes_unsuccess,
      won_duels: r.won_duels,
      lost_duels: r.lost_duels,
      fouls: r.fouls,
      yellow_cards: r.yellow_cards,
      red_cards: r.red_cards,
    }));
  }, [teamBreakdownQuery.data]);

  const statTiles: { k: string; v: number; hint?: string }[] = teamStatsQuery.data
    ? [
        {
          k: "Zápasy v sezóně",
          v: teamStatsQuery.data.season_matches_total,
          hint: "Počet zápasů zapsaných v této sezóně (všechny stavy).",
        },
        { k: "Góly (tým)", v: teamStatsQuery.data.goals },
        { k: "Asistence (tým)", v: teamStatsQuery.data.assists },
        { k: "Střely na bránu (tým)", v: teamStatsQuery.data.shots_on_goal },
        { k: "Střely mimo bránu (tým)", v: teamStatsQuery.data.shots_off_goal },
        { k: "Přihrávky úspěšné", v: teamStatsQuery.data.passes_success },
        { k: "Přihrávky neúspěšné", v: teamStatsQuery.data.passes_unsuccess },
        { k: "Přihrávky celkem (netto)", v: teamStatsQuery.data.passes },
        { k: "Fauly", v: teamStatsQuery.data.fouls },
        { k: "Žluté karty", v: teamStatsQuery.data.yellow_cards },
        { k: "Červené karty", v: teamStatsQuery.data.red_cards },
        { k: "Penalty", v: teamStatsQuery.data.penalties },
        { k: "Souboje vyhrané", v: teamStatsQuery.data.won_duels },
        { k: "Souboje prohrané", v: teamStatsQuery.data.lost_duels },
        { k: "Chyby", v: teamStatsQuery.data.errors },
        { k: "Získané míče", v: teamStatsQuery.data.won_balls },
      ]
    : [];

  const playerSeasonRatingSummary = useMemo(() => {
    const rows = perfQuery.data ?? [];
    if (rows.length === 0) {
      return null;
    }

    const ratings = rows.map((row) => {
      const autoRating = computeAutoRatingFromStats(row.stats);
      return row.rating ?? autoRating;
    });

    const sum = ratings.reduce((acc, v) => acc + v, 0);
    const avg = sum / ratings.length;
    const best = Math.max(...ratings);
    const worst = Math.min(...ratings);

    return {
      matches: ratings.length,
      avg,
      best,
      worst,
    };
  }, [perfQuery.data]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto w-full">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Analytika</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Přehled sezóny, vývoj týmu po zápasech a detail výkonu vybraného hráče.
          Týmové součty sčítají statistiky všech hráčů; počet zápasů ukazuje celkový
          počet zápasů v sezóně.
        </p>
      </header>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Sezóna</div>
            {seasonsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Načítám…</div>
            ) : (
              <select
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
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
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Hráč (výkon v čase)
            </div>
            {playersQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Načítám…</div>
            ) : (
              <select
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
                value={selectedPlayerId}
                onChange={(e) => setPlayerId(Number(e.target.value))}
              >
                {(playersQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.jersey_number} {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Team season totals */}
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tým — součty sezóny</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Součty za celý tým (součet přes hráče). U zápasů jde o počet zápasů v sezóně
            v systému.
          </p>
        </CardHeader>
        <CardContent>
          {teamStatsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Načítám…</div>
          ) : teamStatsQuery.data ? (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {statTiles.map((t) => (
                <div
                  key={t.k}
                  className="rounded-xl border bg-card/50 p-3"
                  title={t.hint}
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">
                    {t.k}
                  </div>
                  <div className="text-lg font-semibold tabular-nums mt-1">{t.v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Bez dat.</div>
          )}
        </CardContent>
      </Card>

      {/* Team per-match charts */}
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tým — vývoj po zápasech</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Statistika je seskupena do tří logických grafů: útok, souboje/disciplína a
            přihrávky/ostatní.
          </p>
        </CardHeader>
        <CardContent>
          {teamBreakdownQuery.isLoading ? (
            <div className="text-sm text-muted-foreground h-64 flex items-center justify-center">
              Načítám graf…
            </div>
          ) : teamChartData.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Žádné zápasy se statistikami v této sezóně.
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Útok: góly a střely
                </div>
                <div className="h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={teamChartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="label"
                        angle={-35}
                        textAnchor="end"
                        height={56}
                        interval={0}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="goals" name="Góly" fill={COL.goals} radius={[2, 2, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="shots_on_goal" name="Střely na bránu" fill={COL.shotsOn} radius={[2, 2, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="shots_off_goal" name="Střely mimo" fill={COL.shotsOff} radius={[2, 2, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Souboje a disciplína
                </div>
                <div className="h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={teamChartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="label"
                        angle={-35}
                        textAnchor="end"
                        height={56}
                        interval={0}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="won_duels" name="Souboje vyhrané" fill={COL.duelsWon} radius={[2, 2, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="lost_duels" name="Souboje prohrané" fill={COL.duelsLost} radius={[2, 2, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="yellow_cards" name="Žluté karty" fill={COL.yellow} radius={[2, 2, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="red_cards" name="Červené karty" fill={COL.red} radius={[2, 2, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="fouls" name="Fauly" fill={COL.fouls} radius={[2, 2, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Přihrávky a ostatní
                </div>
                <div className="h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={teamChartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="label"
                        angle={-35}
                        textAnchor="end"
                        height={56}
                        interval={0}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="passes_success" name="Přihrávky úspěšné" fill={COL.passSuccess} radius={[2, 2, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="passes_unsuccess" name="Přihrávky neúspěšné" fill={COL.passFail} radius={[2, 2, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="assists" name="Asistence" fill={COL.assists} radius={[2, 2, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard table */}
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Žebříček hráčů (sezóna)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {leaderboardQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Načítám…</div>
          ) : (leaderboardQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Bez dat.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Hráč</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Záp.</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">G</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">A</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Přihr.</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">ŽK</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">ČK</th>
                  <th className="py-2 font-medium tabular-nums">Ø hodn.</th>
                </tr>
              </thead>
              <tbody>
                {(leaderboardQuery.data ?? []).map((r) => (
                  <tr key={r.player_id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                      #{r.jersey_number} {r.first_name} {r.last_name}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{r.games}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{r.goals}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{r.assists}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{r.passes}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{r.yellow_cards}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{r.red_cards}</td>
                    <td className="py-2.5 tabular-nums">
                      {r.avg_rating == null ? "—" : r.avg_rating.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Player performance — single combined table per match */}
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hráč — zápas po zápase</CardTitle>
          <p className="text-xs text-muted-foreground font-normal max-w-3xl">
            Jedna tabulka: u každého zápasu vidíte klíčové metriky najednou. Úspěšné a
            neúspěšné přihrávky jsou vedle sebe. Hodnocení je vždy jedna finální hodnota:
            trenérské hodnocení (pokud existuje), jinak automatický systémový rating.
          </p>
        </CardHeader>
        <CardContent>
          {playerSeasonRatingSummary && (
            <div className="mb-4 grid gap-2 grid-cols-2 sm:grid-cols-4">
              <div className="rounded-xl border bg-card/50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Zápasy</div>
                <div className="text-lg font-semibold tabular-nums mt-1">
                  {playerSeasonRatingSummary.matches}
                </div>
              </div>
              <div className="rounded-xl border bg-card/50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sezónní hodnocení (Ø)</div>
                <div className="text-lg font-semibold tabular-nums mt-1">
                  {playerSeasonRatingSummary.avg.toFixed(2)}
                </div>
              </div>
              <div className="rounded-xl border bg-card/50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Nejlepší zápas</div>
                <div className="text-lg font-semibold tabular-nums mt-1">
                  {playerSeasonRatingSummary.best.toFixed(1)}
                </div>
              </div>
              <div className="rounded-xl border bg-card/50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Nejslabší zápas</div>
                <div className="text-lg font-semibold tabular-nums mt-1">
                  {playerSeasonRatingSummary.worst.toFixed(1)}
                </div>
              </div>
            </div>
          )}

          {perfQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Načítám…</div>
          ) : (perfQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Pro tohoto hráče nejsou v sezóně žádné statistiky.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[920px] text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2.5 px-2 font-semibold whitespace-nowrap">Datum</th>
                    <th className="py-2.5 px-2 font-semibold min-w-[8rem]">Soupeř</th>
                    <th className="py-2.5 px-2 font-semibold tabular-nums text-center">G</th>
                    <th className="py-2.5 px-2 font-semibold tabular-nums text-center">A</th>
                    <th className="py-2.5 px-2 font-semibold tabular-nums text-center">
                      Stř. na
                    </th>
                    <th className="py-2.5 px-2 font-semibold tabular-nums text-center">
                      Stř. mimo
                    </th>
                    <th className="py-2.5 px-2 font-semibold tabular-nums text-center">
                      Přihr. úsp.
                    </th>
                    <th className="py-2.5 px-2 font-semibold tabular-nums text-center">
                      Přihr. neúsp.
                    </th>
                    <th className="py-2.5 px-2 font-semibold tabular-nums text-center">
                      Hodnoc.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(perfQuery.data ?? []).map((row) => {
                    const autoRating = computeAutoRatingFromStats(row.stats);
                    const finalRating = row.rating ?? autoRating;
                    return (
                      <tr
                        key={row.match_id}
                        className="border-b border-border/50 hover:bg-muted/20"
                      >
                        <td className="py-2.5 px-2 tabular-nums whitespace-nowrap text-muted-foreground">
                          {formatDate(row.match_date)}
                        </td>
                        <td className="py-2.5 px-2 font-medium">{row.opponent}</td>
                        <td className="py-2.5 px-2 tabular-nums text-center">
                          {row.stats.goals}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums text-center">
                          {row.stats.assists}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums text-center">
                          {row.stats.shots_on_goal}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums text-center">
                          {row.stats.shots_off_goal}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums text-center">
                          {row.passes_success}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums text-center">
                          {row.passes_unsuccess}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums text-center font-medium">
                          {finalRating.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
