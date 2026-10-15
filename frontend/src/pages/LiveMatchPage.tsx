import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LiveMatchHeader } from "@/features/live-match/components/LiveMatchHeader";
import { RosterEventsCard } from "@/features/live-match/components/RosterEventsCard";
import { RatingsCard } from "@/features/live-match/components/RatingsCard";
import { TimelineCard } from "@/features/live-match/components/TimelineCard";
import { SubstitutionsCard } from "@/features/live-match/components/SubstitutionsCard";
import { useLiveMatchData } from "@/features/live-match/useLiveMatchData";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/auth/AuthContext";
import type { RosterWithStatsRow } from "@/api/types";
import type { RatingRow } from "@/api/ratings";
import type { MatchStatus } from "@/api/matches";

export default function LiveMatchPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const queryClient = useQueryClient();

  const { matchId: matchIdParam } = useParams();
  const matchId = Number(matchIdParam);
  const isValidMatchId = Number.isFinite(matchId) && matchId > 0;

  const [error, setError] = useState<string | null>(null);
  const [substitutionSuccess, setSubstitutionSuccess] = useState<string | null>(null);

  const refreshLiveData = () => {
    if (!isValidMatchId) return;
    void queryClient.invalidateQueries({ queryKey: ["match", matchId] });
    void queryClient.invalidateQueries({ queryKey: ["roster-with-stats", matchId] });
    void queryClient.invalidateQueries({ queryKey: ["events", matchId] });
    void queryClient.invalidateQueries({ queryKey: ["substitutions", matchId] });
  };

  const {
    match,
    roster,
    ratings,
    rosterQuery,
    // eventsQuery, // not used directly in this component
    ratingsQuery,
    startMutation,
    halfTimeMutation,
    startSecondHalfMutation,
    finishMutation,
    enqueueAddEvent,
    enqueueUndoEvent,
    deleteEventMutation,
    lastEvents,
    pendingEventCount,
    eventSyncError,
    saveRatingsMutation,
    substitutions,
    createSubstitutionMutation,
  } = useLiveMatchData(matchId, isValidMatchId);

  const [ratingsDraft, setRatingsDraft] = useState<
    Record<number, { rating: string; note: string }>
  >({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const isLive =
    match?.status === "live_half_1" || match?.status === "live_half_2";

  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [isLive]);

  // Timer: 00:00 until Start is pressed; only count up when status is live_half_1 or live_half_2.
  // Treat live_started_at as UTC (server sends naive datetime from SQLite; without Z, JS parses as local and shows wrong elapsed).
  const totalSeconds = (() => {
    if (!match) return 0;
    if (match.status === "planned") return 0;
    if (match.status === "half_time" || match.status === "finished") {
      return match.seconds_before_live ?? 0;
    }
    if (match.status === "live_half_1" || match.status === "live_half_2") {
      const base = match.seconds_before_live ?? 0;
      if (!match.live_started_at) return base;
      const raw = String(match.live_started_at).trim();
      const asUtc = raw.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw + "Z";
      const started = new Date(asUtc).getTime();
      const delta = Math.max(0, Math.floor((nowMs - started) / 1000));
      return base + delta;
    }
    return 0;
  })();

  const half: 1 | 2 =
    (match?.status as MatchStatus | undefined) === "live_half_2" ||
    match?.status === "half_time" ||
    match?.status === "finished"
      ? 2
      : 1;

  const canRecord =
    match?.status === "live_half_1" || match?.status === "live_half_2";
  // Events can also be corrected during the half-time break.
  const canEditEvents = canRecord || match?.status === "half_time";

  /** Compute match time (total seconds) at a given moment. Used so each event stores the exact timestamp when the user clicked. */
  const getMatchSecondsAt = (atMs: number): number => {
    if (!match) return 0;
    if (match.status === "planned") return 0;
    if (match.status === "half_time" || match.status === "finished") {
      return match.seconds_before_live ?? 0;
    }
    if ((match.status === "live_half_1" || match.status === "live_half_2") && match.live_started_at) {
      const base = match.seconds_before_live ?? 0;
      const raw = String(match.live_started_at).trim();
      const asUtc = raw.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw + "Z";
      const started = new Date(asUtc).getTime();
      const delta = Math.max(0, Math.floor((atMs - started) / 1000));
      return base + delta;
    }
    return match.seconds_before_live ?? 0;
  };

  useEffect(() => {
    if (!isValidMatchId) return;
    if (roster.length === 0) return;
    if (Object.keys(ratingsDraft).length > 0) return;
    const existing = new Map<number, { rating: number; note?: string | null }>();
    (ratings as RatingRow[] | undefined)?.forEach((r) =>
      existing.set(r.player_id, { rating: r.rating, note: r.note ?? null }),
    );
    const init: Record<number, { rating: string; note: string }> = {};
    roster.forEach((p) => {
      const r = existing.get(p.player_id);
      init[p.player_id] = {
        rating: r ? String(r.rating) : "",
        note: r?.note ?? "",
      };
    });
    setRatingsDraft(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidMatchId, roster, ratings]);

  // If match is finished, redirect away from live interface to evaluation page.
  useEffect(() => {
    if (!isValidMatchId) return;
    if (match?.status === "finished") {
      navigate(`/matches/${matchId}/evaluation`, { replace: true });
    }
  }, [isValidMatchId, match?.status, matchId, navigate]);

  useEffect(() => {
    if (eventSyncError) {
      setError(eventSyncError);
    }
  }, [eventSyncError]);

  if (!isValidMatchId) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-lg font-semibold">Live zápas</div>
        <div className="text-sm text-muted-foreground">
          Chybí nebo je špatný parametr <code>match_id</code> v URL.
        </div>
        <Button variant="secondary" onClick={() => navigate("/matches")}>
          Zpět na zápasy
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen px-4 py-4 space-y-4">
      <LiveMatchHeader
        matchId={matchId}
        status={match?.status ?? null}
        half={half}
        clockSeconds={totalSeconds}
        onBack={() => navigate("/matches")}
        onRefresh={refreshLiveData}
        onStart={() => startMutation.mutateAsync()}
        onHalfTime={() => halfTimeMutation.mutateAsync()}
        onStartSecondHalf={() => startSecondHalfMutation.mutateAsync()}
        onFinish={() => finishMutation.mutateAsync()}
        starting={startMutation.isPending}
        halfTiming={halfTimeMutation.isPending}
        startingSecond={startSecondHalfMutation.isPending}
        finishing={finishMutation.isPending}
        setError={setError}
        getErrorMessage={getErrorMessage}
      />

      {error && (
        <Card className="w-full rounded-2xl border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}
      {pendingEventCount > 0 && (
        <Card className="w-full rounded-2xl border-blue-500/40 bg-blue-500/10">
          <CardContent className="p-3 text-sm text-blue-900 dark:text-blue-100">
            Synchronizuji události… Ve frontě: {pendingEventCount}
          </CardContent>
        </Card>
      )}

      {!canRecord && match?.status === "planned" && (
        <Card className="w-full rounded-2xl border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4 text-sm">
            Zápas ještě neběží. Spusť zápas pro záznam událostí.
          </CardContent>
        </Card>
      )}

      <RosterEventsCard
        roster={roster}
        isCoach={canRecord}
        isLoading={rosterQuery.isLoading}
        canRecordForPlayer={(row) => row.on_field === true}
        onDelta={async (playerId, type, delta) => {
          setError(null);
          if (delta === 1) {
            enqueueAddEvent({
              playerId,
              eventType: type,
              half,
              secondInMatch: getMatchSecondsAt(Date.now()),
            });
          } else {
            // "-" removes the most recent event of this type for the player.
            enqueueUndoEvent({ playerId, eventType: type });
          }
        }}
      />

      <TimelineCard
        events={lastEvents.slice(0, 15)}
        roster={roster}
        canDelete={canEditEvents}
        onDelete={(ev) =>
          deleteEventMutation.mutate(ev, { onError: (e) => setError(getErrorMessage(e)) })
        }
      />

      {substitutionSuccess && (
        <Card className="w-full rounded-2xl border-green-600 bg-green-50 dark:bg-green-950/30">
          <CardContent className="p-4 text-sm font-medium text-green-800 dark:text-green-200">
            ✓ Střídání zaznamenáno: {substitutionSuccess}
          </CardContent>
        </Card>
      )}

      <SubstitutionsCard
        roster={roster as RosterWithStatsRow[]}
        substitutions={substitutions}
        canSubstitute={canRecord}
        isSubmitting={createSubstitutionMutation.isPending}
        half={half}
        clockSeconds={totalSeconds}
        onCreate={async (outId, inId, h, sec) => {
          setError(null);
          setSubstitutionSuccess(null);
          const outPlayer = roster.find((r) => r.player_id === outId);
          const inPlayer = roster.find((r) => r.player_id === inId);
          const outName = outPlayer ? `${outPlayer.first_name} ${outPlayer.last_name}` : `#${outId}`;
          const inName = inPlayer ? `${inPlayer.first_name} ${inPlayer.last_name}` : `#${inId}`;
          try {
            await createSubstitutionMutation.mutateAsync({
              playerOutId: outId,
              playerInId: inId,
              half: h,
              secondInMatch: sec,
            });
            setSubstitutionSuccess(`${outName} → ${inName}`);
            setTimeout(() => setSubstitutionSuccess(null), 5000);
          } catch (e: unknown) {
            setError(getErrorMessage(e));
          }
        }}
      />

      {match?.status === "finished" ? (
        <RatingsCard
          roster={roster as RosterWithStatsRow[]}
          ratingsDraft={ratingsDraft}
          onDraftChange={(playerId, value) =>
            setRatingsDraft((prev) => ({
              ...prev,
              [playerId]: value,
            }))
          }
          isCoach={auth.user?.role === "coach"}
          isLoading={ratingsQuery.isLoading}
          onSave={async () => {
            setError(null);
            try {
              const items = Object.entries(ratingsDraft)
                .map(([playerId, v]) => ({
                  player_id: Number(playerId),
                  rating: Number(v.rating),
                  note: v.note.trim() || null,
                }))
                .filter((x) => Number.isFinite(x.rating) && x.rating >= 1 && x.rating <= 10);
              await saveRatingsMutation.mutateAsync(items);
            } catch (e: unknown) {
              setError(getErrorMessage(e));
            }
          }}
          saving={saveRatingsMutation.isPending}
        />
      ) : (
        <Card className="w-full rounded-2xl">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Hodnocení hráčů bude k dispozici po ukončení zápasu.
          </CardContent>
        </Card>
      )}

    </div>
  );
}