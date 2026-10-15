import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthContext";
import { useLiveMatchData } from "@/features/live-match/useLiveMatchData";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, matchStatusLabel } from "@/lib/format";
import type { PlayerStats } from "@/api/types";
import type { RatingRow } from "@/api/ratings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function computeAutoRating(stats: PlayerStats): number {
  const positive =
    stats.goals * 6.3 +
    stats.assists * 4.2 +
    stats.shots_on_goal * 2.2 +
    stats.shots_off_goal * 0.9 +
    stats.passes * 0.115 +
    stats.won_duels * 1.08 +
    stats.won_balls * 0.92 +
    stats.penalties * 3;

  const negative =
    stats.errors * 1.05 +
    stats.lost_balls * 0.22 +
    stats.lost_duels * 0.4 +
    stats.fouls * 0.24 +
    stats.yellow_cards * 0.85 +
    stats.red_cards * 2.7;

  // Small activity bonus so active players are not undervalued.
  const activity =
    stats.passes +
    stats.won_duels +
    stats.lost_duels +
    stats.shots_on_goal +
    stats.shots_off_goal +
    stats.won_balls +
    stats.lost_balls;
  const activityBonus = Math.min(1.95, activity * 0.035);

  // Slight uplift to avoid systematically low scores.
  const score = positive - negative + activityBonus + 1.2;

  // Map raw score into 1–10 range (soft caps).
  const rawMin = -8;
  const rawMax = 12;
  const norm = (score - rawMin) / (rawMax - rawMin);
  const scaled = 1 + 9 * clamp(norm, 0, 1);
  return Math.round(scaled * 10) / 10; // one decimal
}

function computeFinalRating(autoRating: number, coachRating?: number | null): number {
  if (
    coachRating == null ||
    !Number.isFinite(coachRating) ||
    coachRating < 1 ||
    coachRating > 10
  ) {
    return autoRating;
  }
  // Coach input should influence, not dominate.
  return Math.round((autoRating * 0.8 + coachRating * 0.2 + Number.EPSILON) * 10) / 10;
}

type RatingsDraft = Record<number, { rating: string; note: string }>;

type TimelineBucket = {
  bucketIndex: number;
  startMinute: number;
  endMinute: number;
  minute: number;
  label: string;
  total: number;
  passesSuccess: number;
  passesUnsuccess: number;
  shotsOn: number;
  shotsOff: number;
  duels: number;
  wonBalls: number;
  lostBalls: number;
  fouls: number;
  goals: number;
  yellowCards: number;
  redCards: number;
};

export default function MatchEvaluationPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const isCoach = auth.user?.role === "coach";

  const { matchId: matchIdParam } = useParams();
  const matchId = Number(matchIdParam);
  const isValidMatchId = Number.isFinite(matchId) && matchId > 0;

  const [error, setError] = useState<string | null>(null);
  const [ratingsDraft, setRatingsDraft] = useState<RatingsDraft>({});

  const {
    match,
    roster,
    ratings,
    substitutions,
    ratingsQuery,
    saveRatingsMutation,
    eventsQuery,
  } = useLiveMatchData(matchId, isValidMatchId);

  // Determine which players actually played: starters + any player who ever came in as a substitute.
  const { playedRoster, autoRatings, playedIds } = useMemo(() => {
    const starters = roster.filter((r) => r.role === "starter");
    const played = new Set<number>(starters.map((r) => r.player_id));
    substitutions.forEach((s) => {
      played.add(s.player_in_id);
    });

    const pr = roster.filter((r) => played.has(r.player_id));
    const auto: Record<number, number> = {};
    pr.forEach((p) => {
      auto[p.player_id] = computeAutoRating(p.stats);
    });
    return { playedRoster: pr, autoRatings: auto, playedIds: played };
  }, [roster, substitutions]);

  const teamTotals = useMemo(() => {
    const base = {
      goals: 0,
      assists: 0,
      errors: 0,
      won_balls: 0,
      lost_balls: 0,
      fouls: 0,
      passes: 0,
      won_duels: 0,
      lost_duels: 0,
      shots_on_goal: 0,
      shots_off_goal: 0,
      yellow_cards: 0,
      red_cards: 0,
      penalties: 0,
    };

    roster.forEach((r) => {
      const s = r.stats;
      base.goals += s.goals;
      base.assists += s.assists;
      base.errors += s.errors;
      base.won_balls += s.won_balls;
      base.lost_balls += s.lost_balls;
      base.fouls += s.fouls;
      base.passes += s.passes;
      base.won_duels += s.won_duels;
      base.lost_duels += s.lost_duels;
      base.shots_on_goal += s.shots_on_goal;
      base.shots_off_goal += s.shots_off_goal;
      base.yellow_cards += s.yellow_cards;
      base.red_cards += s.red_cards;
      base.penalties += s.penalties;
    });

    const shotsTotal = base.shots_on_goal + base.shots_off_goal;
    const duelsTotal = base.won_duels + base.lost_duels;
    const shotAccuracy = shotsTotal > 0 ? base.shots_on_goal / shotsTotal : null;
    const duelSuccess = duelsTotal > 0 ? base.won_duels / duelsTotal : null;
    const teamActionsForShare =
      base.passes +
      shotsTotal +
      duelsTotal +
      base.won_balls +
      base.lost_balls +
      base.fouls;

    return {
      ...base,
      shotsTotal,
      duelsTotal,
      shotAccuracy,
      duelSuccess,
      teamActionsForShare,
    };
  }, [roster]);

  const passSummary = useMemo(() => {
    const events = eventsQuery.data ?? [];
    let success = 0;
    let unsuccess = 0;
    events.forEach((ev) => {
      if (ev.event_type !== "pass") return;
      if (ev.delta > 0) success += 1;
      if (ev.delta < 0) unsuccess += 1;
    });
    const total = success + unsuccess;
    const accuracy = total > 0 ? success / total : null;
    return { success, unsuccess, total, accuracy };
  }, [eventsQuery.data]);

  const playerPassMap = useMemo(() => {
    const map = new Map<number, { success: number; unsuccess: number }>();
    const events = eventsQuery.data ?? [];
    events.forEach((ev) => {
      if (ev.event_type !== "pass") return;
      const cur = map.get(ev.player_id) ?? { success: 0, unsuccess: 0 };
      if (ev.delta > 0) cur.success += 1;
      if (ev.delta < 0) cur.unsuccess += 1;
      map.set(ev.player_id, cur);
    });
    return map;
  }, [eventsQuery.data]);

  const timeline = useMemo(() => {
    const BUCKET_SECONDS = 5 * 60;
    const events = eventsQuery.data ?? [];

    if (!events || events.length === 0) {
      return [] as TimelineBucket[];
    }

    let maxBucketIndex = -1;
    events.forEach((ev) => {
      // Only count +1 events; -1 is typically undo in UI
      if (ev.delta <= 0) return;
      const idx = Math.floor(ev.second_in_match / BUCKET_SECONDS);
      if (idx > maxBucketIndex) maxBucketIndex = idx;
    });

    if (maxBucketIndex < 0) {
      return [] as TimelineBucket[];
    }

    const buckets: TimelineBucket[] = [];
    for (let i = 0; i <= maxBucketIndex; i += 1) {
      const startMinute = (i * BUCKET_SECONDS) / 60;
      const endMinute = ((i + 1) * BUCKET_SECONDS) / 60;
      buckets.push({
        bucketIndex: i,
        startMinute,
        endMinute,
        minute: startMinute,
        label: `${startMinute}-${endMinute}'`,
        total: 0,
        passesSuccess: 0,
        passesUnsuccess: 0,
        shotsOn: 0,
        shotsOff: 0,
        duels: 0,
        wonBalls: 0,
        lostBalls: 0,
        fouls: 0,
        goals: 0,
        yellowCards: 0,
        redCards: 0,
      });
    }

    events.forEach((ev) => {
      const idx = Math.floor(ev.second_in_match / BUCKET_SECONDS);
      const bucket = buckets[idx];
      if (!bucket) return;

      if (ev.event_type === "pass") {
        if (ev.delta > 0) {
          bucket.total += 1;
          bucket.passesSuccess += 1;
        } else if (ev.delta < 0) {
          bucket.passesUnsuccess += 1;
        }
        return;
      }
      if (ev.delta <= 0) return;
      bucket.total += 1;
      switch (ev.event_type) {
        case "shot_on_goal":
          bucket.shotsOn += 1;
          break;
        case "shot_off_goal":
          bucket.shotsOff += 1;
          break;
        case "won_duel":
        case "lost_duel":
          bucket.duels += 1;
          break;
        case "foul":
          bucket.fouls += 1;
          break;
        case "won_ball":
          bucket.wonBalls += 1;
          break;
        case "lost_ball":
          bucket.lostBalls += 1;
          break;
        case "goal":
          bucket.goals += 1;
          break;
        case "yellow_card":
          bucket.yellowCards += 1;
          break;
        case "red_card":
          bucket.redCards += 1;
          break;
        default:
          break;
      }
    });

    return buckets;
  }, [eventsQuery.data]);

  const topPerformers = useMemo(() => {
    if (roster.length === 0) {
      return {
        mostPasses: null as (typeof roster)[number] | null,
        mostDuelsWon: null as (typeof roster)[number] | null,
        mostShots: null as (typeof roster)[number] | null,
      };
    }

    const mostPasses = [...roster].sort(
      (a, b) => b.stats.passes - a.stats.passes,
    )[0];

    const mostDuelsWon = [...roster].sort(
      (a, b) => b.stats.won_duels - a.stats.won_duels,
    )[0];

    const mostShots = [...roster].sort(
      (a, b) =>
        b.stats.shots_on_goal +
        b.stats.shots_off_goal -
        (a.stats.shots_on_goal + a.stats.shots_off_goal),
    )[0];

    return { mostPasses, mostDuelsWon, mostShots };
  }, [roster]);

  const playerEvaluationRows = useMemo(() => {
    return playedRoster.map((p) => {
      const auto = autoRatings[p.player_id] ?? 0;
      const draft = ratingsDraft[p.player_id] ?? { rating: "", note: "" };
      const manualNum = Number(draft.rating);
      const hasManual = Number.isFinite(manualNum) && manualNum >= 1 && manualNum <= 10;
      const finalRating = computeFinalRating(auto, hasManual ? manualNum : null);
      const shots = p.stats.shots_on_goal + p.stats.shots_off_goal;
      const passCounts = playerPassMap.get(p.player_id) ?? {
        success: p.stats.passes,
        unsuccess: 0,
      };
      const teamShare =
        teamTotals.teamActionsForShare > 0
          ? ((p.stats.passes +
              p.stats.shots_on_goal +
              p.stats.shots_off_goal +
              p.stats.won_duels +
              p.stats.lost_duels +
              p.stats.won_balls +
              p.stats.lost_balls +
              p.stats.fouls) /
              teamTotals.teamActionsForShare) *
            100
          : null;
      return {
        player: p,
        auto,
        manualNum,
        hasManual,
        finalRating,
        shots,
        passesSuccess: passCounts.success,
        passesUnsuccess: passCounts.unsuccess,
        teamShare,
      };
    });
  }, [playedRoster, autoRatings, ratingsDraft, teamTotals.teamActionsForShare, playerPassMap]);

  const ratingOverview = useMemo(() => {
    if (playerEvaluationRows.length === 0) {
      return { ratedCount: 0, avgFinal: null };
    }
    const manualRows = playerEvaluationRows.filter((r) => r.hasManual);
    const finalSum = playerEvaluationRows.reduce((sum, r) => sum + r.finalRating, 0);
    return {
      ratedCount: manualRows.length,
      avgFinal: finalSum / playerEvaluationRows.length,
    };
  }, [playerEvaluationRows]);

  // Initialize manual ratings draft from existing ratings (only for players who actually played).
  useEffect(() => {
    if (!isValidMatchId) return;
    if (playedRoster.length === 0) return;
    if (Object.keys(ratingsDraft).length > 0) return;

    const existing = new Map<number, { rating: number; note?: string | null }>();
    (ratings as RatingRow[] | undefined)?.forEach((r) =>
      existing.set(r.player_id, { rating: r.rating, note: r.note ?? null }),
    );

    const init: RatingsDraft = {};
    playedRoster.forEach((p) => {
      const found = existing.get(p.player_id);
      init[p.player_id] = {
        rating: found ? String(found.rating) : "",
        note: found?.note ?? "",
      };
    });
    setRatingsDraft(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidMatchId, playedRoster, ratings, autoRatings]);

  // Coach rating is optional; no automatic rating write on page open.

  if (!isValidMatchId) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-lg font-semibold">Hodnocení zápasu</div>
        <div className="text-sm text-muted-foreground">
          Chybí nebo je špatný parametr <code>match_id</code> v URL.
        </div>
        <Button variant="secondary" onClick={() => navigate("/matches")}>
          Zpět na zápasy
        </Button>
      </div>
    );
  }

  if (match && match.status !== "finished") {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Hodnocení zápasu</div>
            <div className="text-sm text-muted-foreground">
              {match.opponent} • {formatDateTime(match.match_date)} • ID {match.id}
            </div>
            <div className="text-sm text-muted-foreground">
              Zápas ještě není ukončen. Nejprve ukonči zápas na obrazovce Live.
            </div>
          </div>
          <Button onClick={() => navigate(`/matches/${match.id}/live`)}>Přejít na Live</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen px-4 py-4 space-y-6 md:px-6 md:py-6 max-w-7xl mx-auto">
      <Card className="rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-slate-50">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">Vyhodnocení zápasu</div>
              <div className="text-sm text-slate-200/90 mt-1">
                {match?.opponent ?? "Soupeř"} • {formatDateTime(match?.match_date)} • ID {matchId}
              </div>
              <div className="text-xs text-slate-300/90 mt-0.5">
                Stav: {matchStatusLabel(match?.status)}
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate("/matches")}>
              Zpět na zápasy
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="w-full rounded-2xl border-destructive bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl border-emerald-500/50 bg-emerald-500/10">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Útok
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-800 dark:text-emerald-200">
              {teamTotals.goals} G
            </div>
            <div className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
              {teamTotals.assists} A • {teamTotals.shots_on_goal + teamTotals.shots_off_goal} střel
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-violet-500/50 bg-violet-500/10">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-violet-700 dark:text-violet-300">
              Střelba
            </div>
            <div className="mt-1 text-2xl font-semibold text-violet-800 dark:text-violet-200">
              {teamTotals.shots_on_goal} / {teamTotals.shots_off_goal}
            </div>
            <div className="text-xs text-violet-700/90 dark:text-violet-300/90">
              na bránu / mimo •{" "}
              {teamTotals.shotAccuracy == null
                ? "bez střel"
                : `${Math.round(teamTotals.shotAccuracy * 100)} % přesnost`}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-blue-500/50 bg-blue-500/10">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Přihrávky a souboje
            </div>
            <div className="mt-1 text-2xl font-semibold text-blue-800 dark:text-blue-200">
              {passSummary.success} / {passSummary.unsuccess}
            </div>
            <div className="text-xs text-blue-700/90 dark:text-blue-300/90">
              úspěšné / neúspěšné • {teamTotals.won_duels}/{teamTotals.lost_duels} souboje
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Disciplína
            </div>
            <div className="mt-1 text-2xl font-semibold text-amber-800 dark:text-amber-200">
              {teamTotals.fouls}
            </div>
            <div className="text-xs text-amber-700/90 dark:text-amber-300/90">
              fauly • {teamTotals.yellow_cards} ŽK • {teamTotals.red_cards} ČK
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="w-full rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle>Časový průběh výkonu</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {eventsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Načítám časovou osu…</div>
          ) : timeline.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Pro tento zápas zatím nejsou žádné zaznamenané události.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Útok: góly a střely
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeline}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="minute" tickFormatter={(v) => `${v}'`} allowDecimals={false} />
                      <YAxis allowDecimals={false} />
                      <Tooltip labelFormatter={(v) => `${v}.–${v + 5}. minuta`} />
                      <Legend />
                      <Bar dataKey="goals" name="Góly" fill="#16a34a" radius={[2, 2, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="shotsOn" name="Střely na bránu" fill="#2563eb" radius={[2, 2, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="shotsOff" name="Střely mimo" fill="#7c3aed" radius={[2, 2, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Souboje a disciplína
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeline}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="minute" tickFormatter={(v) => `${v}'`} allowDecimals={false} />
                      <YAxis allowDecimals={false} />
                      <Tooltip labelFormatter={(v) => `${v}.–${v + 5}. minuta`} />
                      <Legend />
                      <Bar dataKey="duels" name="Souboje" fill="#2563eb" radius={[2, 2, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="fouls" name="Fauly" fill="#16a34a" radius={[2, 2, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="yellowCards" name="Žluté karty" fill="#eab308" radius={[2, 2, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="redCards" name="Červené karty" fill="#dc2626" radius={[2, 2, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border p-3 xl:col-span-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Přihrávky a ostatní
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeline}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="minute" tickFormatter={(v) => `${v}'`} allowDecimals={false} />
                      <YAxis allowDecimals={false} />
                      <Tooltip labelFormatter={(v) => `${v}.–${v + 5}. minuta`} />
                      <Legend />
                      <Bar dataKey="passesSuccess" name="Přihrávky úspěšné" fill="#2563eb" radius={[2, 2, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="passesUnsuccess" name="Přihrávky neúspěšné" fill="#7c3aed" radius={[2, 2, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="wonBalls" name="Zisky míče" fill="#0f766e" radius={[2, 2, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="lostBalls" name="Ztráty míče" fill="#64748b" radius={[2, 2, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Intervaly po 5 minutách; u přihrávek se zobrazují zvlášť úspěšné (+1) a neúspěšné (−1) záznamy.
          </div>
        </CardContent>
      </Card>

      <Card className="w-full rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle>Týmový výkon podle oblastí</CardTitle>
        </CardHeader>
        <CardContent className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Útok
            </div>
            <div className="mt-2 text-sm">
              <div className="flex justify-between"><span>Góly</span><span className="font-semibold">{teamTotals.goals}</span></div>
              <div className="flex justify-between"><span>Asistence</span><span className="font-semibold">{teamTotals.assists}</span></div>
              <div className="flex justify-between"><span>Penalty</span><span className="font-semibold">{teamTotals.penalties}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              Střelba
            </div>
            <div className="mt-2 text-sm">
              <div className="flex justify-between"><span>Na bránu</span><span className="font-semibold">{teamTotals.shots_on_goal}</span></div>
              <div className="flex justify-between"><span>Mimo bránu</span><span className="font-semibold">{teamTotals.shots_off_goal}</span></div>
              <div className="flex justify-between"><span>Přesnost</span><span className="font-semibold">{teamTotals.shotAccuracy == null ? "—" : `${Math.round(teamTotals.shotAccuracy * 100)} %`}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Přihrávky a souboje
            </div>
            <div className="mt-2 text-sm">
              <div className="flex justify-between"><span>Přihrávky úspěšné</span><span className="font-semibold">{passSummary.success}</span></div>
              <div className="flex justify-between"><span>Přihrávky neúspěšné</span><span className="font-semibold">{passSummary.unsuccess}</span></div>
              <div className="flex justify-between"><span>Souboje +/−</span><span className="font-semibold">{teamTotals.won_duels} / {teamTotals.lost_duels}</span></div>
              <div className="flex justify-between"><span>Úspěšnost přihrávek</span><span className="font-semibold">{passSummary.accuracy == null ? "—" : `${Math.round(passSummary.accuracy * 100)} %`}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Disciplína a míč
            </div>
            <div className="mt-2 text-sm">
              <div className="flex justify-between"><span>Fauly</span><span className="font-semibold">{teamTotals.fouls}</span></div>
              <div className="flex justify-between"><span>Karty (ŽK/ČK)</span><span className="font-semibold">{teamTotals.yellow_cards} / {teamTotals.red_cards}</span></div>
              <div className="flex justify-between"><span>Zisky / ztráty</span><span className="font-semibold">{teamTotals.won_balls} / {teamTotals.lost_balls}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle>Výkon hráčů (rychlý přehled)</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {playerEvaluationRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Zatím nejsou k dispozici žádné statistiky. Ujisti se, že byla nastavena sestava a
              zaznamenány události.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                {topPerformers.mostPasses && (
                  <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Nejvíce přihrávek</div>
                    <div className="mt-1 font-medium">#{topPerformers.mostPasses.jersey_number_match} {topPerformers.mostPasses.first_name} {topPerformers.mostPasses.last_name}</div>
                    <div className="text-xs text-muted-foreground">{topPerformers.mostPasses.stats.passes} přihrávek</div>
                  </div>
                )}
                {topPerformers.mostDuelsWon && (
                  <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">Nejvíce vyhraných soubojů</div>
                    <div className="mt-1 font-medium">#{topPerformers.mostDuelsWon.jersey_number_match} {topPerformers.mostDuelsWon.first_name} {topPerformers.mostDuelsWon.last_name}</div>
                    <div className="text-xs text-muted-foreground">{topPerformers.mostDuelsWon.stats.won_duels} vyhraných soubojů</div>
                  </div>
                )}
                {topPerformers.mostShots && (
                  <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Nejvíce střel</div>
                    <div className="mt-1 font-medium">#{topPerformers.mostShots.jersey_number_match} {topPerformers.mostShots.first_name} {topPerformers.mostShots.last_name}</div>
                    <div className="text-xs text-muted-foreground">{topPerformers.mostShots.stats.shots_on_goal + topPerformers.mostShots.stats.shots_off_goal} střel</div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hráč</TableHead>
                      <TableHead className="text-right">Útok (G/A/Stř.)</TableHead>
                      <TableHead className="text-right">Přihrávky (+/−)</TableHead>
                      <TableHead className="text-right">Souboje (+/−)</TableHead>
                      <TableHead className="text-right">Karty (ŽK/ČK)</TableHead>
                      <TableHead className="text-right">Podíl na akcích</TableHead>
                      <TableHead className="text-right">Finální hodnocení</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {playerEvaluationRows.map((r) => (
                      <TableRow key={r.player.player_id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              #{r.player.jersey_number_match} {r.player.first_name} {r.player.last_name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.player.role === "starter" ? "Základní sestava" : "Střídající"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.player.stats.goals}/{r.player.stats.assists}/{r.shots}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.passesSuccess} / {r.passesUnsuccess}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.player.stats.won_duels}/{r.player.stats.lost_duels}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.player.stats.yellow_cards}/{r.player.stats.red_cards}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.teamShare == null ? "—" : `${r.teamShare.toFixed(1)} %`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{r.finalRating.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isCoach && playedRoster.length > 0 && (
        <Card id="coach-ratings" className="w-full rounded-2xl border-sky-500/40">
          <CardHeader className="pb-3">
            <CardTitle>Hodnocení trenéra</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-sky-500/10 p-3">
                <div className="text-xs uppercase tracking-wide text-sky-700 dark:text-sky-300">Hodnoceno</div>
                <div className="text-xl font-semibold">{ratingOverview.ratedCount}/{playerEvaluationRows.length}</div>
              </div>
              <div className="rounded-xl border bg-indigo-500/10 p-3">
                <div className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Průměr finální</div>
                <div className="text-xl font-semibold">{ratingOverview.avgFinal == null ? "—" : ratingOverview.avgFinal.toFixed(2)}</div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Hodnocení trenéra je volitelné. Pokud je vyplněné, finální hodnocení upraví jen
              částečně (20 % trenér, 80 % systém).
            </div>

            <div className="rounded-xl border">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hráč</TableHead>
                      <TableHead className="text-right">Finální</TableHead>
                      <TableHead className="text-right">Trenér</TableHead>
                      <TableHead>Poznámka trenéra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {playedRoster.map((p) => {
                      const auto = autoRatings[p.player_id] ?? 0;
                      const v = ratingsDraft[p.player_id] ?? { rating: "", note: "" };
                      const manualNum = Number(v.rating);
                      const hasManual =
                        Number.isFinite(manualNum) && manualNum >= 1 && manualNum <= 10;
                      const final = computeFinalRating(auto, hasManual ? manualNum : null);

                      return (
                        <TableRow key={p.player_id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                #{p.jersey_number_match} {p.first_name} {p.last_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {p.role === "starter" ? "Základní sestava" : "Střídající"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{final.toFixed(1)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              className="w-20 text-right"
                              inputMode="numeric"
                              placeholder="1–10"
                              value={v.rating}
                              onChange={(e) =>
                                setRatingsDraft((prev) => ({
                                  ...prev,
                                  [p.player_id]: { ...v, rating: e.target.value },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-44 md:w-72"
                              placeholder="Krátká poznámka"
                              value={v.note}
                              onChange={(e) =>
                                setRatingsDraft((prev) => ({
                                  ...prev,
                                  [p.player_id]: { ...v, note: e.target.value },
                                }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  setError(null);
                  try {
                    const items = Object.entries(ratingsDraft)
                      .filter(([playerId]) => playedIds.has(Number(playerId)))
                      .map(([playerId, v]) => ({
                        player_id: Number(playerId),
                        rating: Number(v.rating),
                        note: v.note.trim() || null,
                      }))
                      .filter(
                        (x) =>
                          Number.isFinite(x.rating) &&
                          x.rating >= 1 &&
                          x.rating <= 10,
                      );
                    await saveRatingsMutation.mutateAsync(items);
                  } catch (e: unknown) {
                    setError(getErrorMessage(e));
                  }
                }}
                disabled={ratingsQuery.isLoading || saveRatingsMutation.isPending}
              >
                Uložit hodnocení trenéra
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

