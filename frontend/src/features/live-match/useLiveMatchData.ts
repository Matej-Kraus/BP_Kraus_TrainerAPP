import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addEvent,
  createSubstitution,
  finishMatch,
  getMatch,
  getRosterWithStats,
  listEvents,
  listSubstitutions,
  setHalfTime,
  startMatch,
  startSecondHalf,
  type EventType,
  type MatchDto,
  type SubstitutionDto,
} from "@/api/matches";
import type { MatchEvent, RosterWithStatsRow } from "@/api/types";
import { listRatings, saveRatings } from "@/api/ratings";
import { getErrorMessage } from "@/lib/errors";
import { EVENT_TO_STATS_KEY } from "@/lib/events";

export function useLiveMatchData(matchId: number, isValidMatchId: boolean) {
  const qc = useQueryClient();
  const [pendingEventCount, setPendingEventCount] = useState(0);
  const [eventSyncError, setEventSyncError] = useState<string | null>(null);
  const eventQueueRef = useRef<
    Array<{
      playerId: number;
      delta: 1 | -1;
      eventType: EventType;
      half: 1 | 2;
      secondInMatch: number;
    }>
  >([]);
  const isProcessingQueueRef = useRef(false);

  const matchQuery = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => getMatch(matchId),
    enabled: isValidMatchId,
    refetchOnWindowFocus: false,
    refetchInterval: 10000,
  });

  const rosterQuery = useQuery({
    queryKey: ["roster-with-stats", matchId],
    queryFn: () => getRosterWithStats(matchId),
    enabled: isValidMatchId,
    refetchOnWindowFocus: false,
  });

  const eventsQuery = useQuery({
    queryKey: ["events", matchId],
    queryFn: () => listEvents(matchId),
    enabled: isValidMatchId,
    refetchOnWindowFocus: false,
  });

  const ratingsQuery = useQuery({
    queryKey: ["ratings", matchId],
    queryFn: () => listRatings(matchId),
    enabled: isValidMatchId,
    refetchOnWindowFocus: false,
  });

  const substitutionsQuery = useQuery({
    queryKey: ["substitutions", matchId],
    queryFn: () => listSubstitutions(matchId),
    enabled: isValidMatchId,
    refetchOnWindowFocus: false,
  });

  const invalidateLive = async () => {
    await qc.invalidateQueries({ queryKey: ["match", matchId] });
    await qc.invalidateQueries({ queryKey: ["roster-with-stats", matchId] });
    await qc.invalidateQueries({ queryKey: ["events", matchId] });
  };

  const startMutation = useMutation({
    mutationFn: () => startMatch(matchId),
    onSuccess: invalidateLive,
  });

  const halfTimeMutation = useMutation({
    mutationFn: () => setHalfTime(matchId),
    onSuccess: invalidateLive,
  });

  const startSecondHalfMutation = useMutation({
    mutationFn: () => startSecondHalf(matchId),
    onSuccess: invalidateLive,
  });

  const finishMutation = useMutation({
    mutationFn: () => finishMatch(matchId),
    onSuccess: invalidateLive,
  });

  const addEventMutation = useMutation({
    mutationFn: (p: {
      playerId: number;
      delta: 1 | -1;
      eventType: EventType;
      half: 1 | 2;
      secondInMatch: number;
    }) =>
      addEvent({
        matchId,
        playerId: p.playerId,
        eventType: p.eventType,
        delta: p.delta,
        half: p.half,
        secondInMatch: p.secondInMatch,
      }),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ["roster-with-stats", matchId] });
      await qc.cancelQueries({ queryKey: ["events", matchId] });

      const previousRoster = qc.getQueryData<RosterWithStatsRow[]>(["roster-with-stats", matchId]);
      const previousEvents = qc.getQueryData<MatchEvent[]>(["events", matchId]);

      const statKey = EVENT_TO_STATS_KEY[p.eventType];
      if (previousRoster && statKey) {
        qc.setQueryData<RosterWithStatsRow[]>(["roster-with-stats", matchId], (old) =>
          (old ?? []).map((row) => {
            if (row.player_id !== p.playerId) return row;
            const current = row.stats[statKey] ?? 0;
            const next = Math.max(0, current + p.delta);
            return {
              ...row,
              stats: {
                ...row.stats,
                [statKey]: next,
              },
            };
          }),
        );
      }

      const optimisticId = -Date.now();
      const optimisticEvent: MatchEvent = {
        id: optimisticId,
        match_id: matchId,
        player_id: p.playerId,
        event_type: p.eventType,
        delta: p.delta,
        half: p.half,
        second_in_match: p.secondInMatch,
      };
      qc.setQueryData<MatchEvent[]>(["events", matchId], (old) => [...(old ?? []), optimisticEvent]);

      return { previousRoster, previousEvents, optimisticId };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.previousRoster) {
        qc.setQueryData(["roster-with-stats", matchId], ctx.previousRoster);
      }
      if (ctx.previousEvents) {
        qc.setQueryData(["events", matchId], ctx.previousEvents);
      }
    },
    onSuccess: (serverEvent, _vars, ctx) => {
      qc.setQueryData<MatchEvent[]>(["events", matchId], (old) => {
        if (!old) return [serverEvent];
        return old.map((ev) =>
          ev.id === ctx?.optimisticId ? serverEvent : ev
        );
      });
    },
  });

  const saveRatingsMutation = useMutation({
    mutationFn: (items: Array<{ player_id: number; rating: number; note: string | null }>) =>
      saveRatings(matchId, items),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ratings", matchId] });
    },
  });

  const roster: RosterWithStatsRow[] = rosterQuery.data ?? [];

  const lastEvents: MatchEvent[] = useMemo(() => {
    const events = eventsQuery.data ?? [];
    return [...events].slice(-30).reverse();
  }, [eventsQuery.data]);

  const match: MatchDto | null = matchQuery.data ?? null;
  const substitutions: SubstitutionDto[] = substitutionsQuery.data ?? [];

  const onFieldIds = new Set<number>(
    roster.filter((r) => r.role === "starter").map((r) => r.player_id),
  );
  substitutions.forEach((s) => {
    if (onFieldIds.has(s.player_out_id)) {
      onFieldIds.delete(s.player_out_id);
    }
    onFieldIds.add(s.player_in_id);
  });

  const rosterWithOnField: RosterWithStatsRow[] = roster.map((r) => ({
    ...r,
    on_field: onFieldIds.has(r.player_id),
  }));

  const createSubstitutionMutation = useMutation({
    mutationFn: (p: {
      playerOutId: number;
      playerInId: number;
      half: 1 | 2;
      secondInMatch: number;
    }) =>
      createSubstitution({
        matchId,
        playerOutId: p.playerOutId,
        playerInId: p.playerInId,
        half: p.half,
        secondInMatch: p.secondInMatch,
      }),
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ["substitutions", matchId] });
      await qc.refetchQueries({ queryKey: ["roster-with-stats", matchId] });
      await qc.invalidateQueries({ queryKey: ["events", matchId] });
    },
  });

  const processEventQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    try {
      while (eventQueueRef.current.length > 0) {
        const next = eventQueueRef.current.shift();
        setPendingEventCount(eventQueueRef.current.length);
        if (!next) continue;
        try {
          await addEventMutation.mutateAsync(next);
        } catch (err: unknown) {
          setEventSyncError(getErrorMessage(err));
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
      setPendingEventCount(0);
    }
  }, [addEventMutation]);

  const enqueueMatchEvent = useCallback(
    (p: {
      playerId: number;
      delta: 1 | -1;
      eventType: EventType;
      half: 1 | 2;
      secondInMatch: number;
    }) => {
      setEventSyncError(null);
      eventQueueRef.current.push(p);
      setPendingEventCount(eventQueueRef.current.length);
      void processEventQueue();
    },
    [processEventQueue],
  );

  return {
    match,
    roster: rosterWithOnField,
    lastEvents,
    ratings: ratingsQuery.data ?? [],
    matchQuery,
    rosterQuery,
    eventsQuery,
    ratingsQuery,
    startMutation,
    halfTimeMutation,
    startSecondHalfMutation,
    finishMutation,
    addEventMutation,
    enqueueMatchEvent,
    pendingEventCount,
    eventSyncError,
    saveRatingsMutation,
    substitutions,
    createSubstitutionMutation,
    substitutionsQuery,
  };
}

