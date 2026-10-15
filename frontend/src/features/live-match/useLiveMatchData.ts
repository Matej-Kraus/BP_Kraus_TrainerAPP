import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addEvent,
  createSubstitution,
  deleteEvent,
  finishMatch,
  getMatch,
  getRosterWithStats,
  listEvents,
  listSubstitutions,
  setHalfTime,
  startMatch,
  startSecondHalf,
  undoLastEvent,
  type EventType,
  type MatchDto,
  type SubstitutionDto,
} from "@/api/matches";
import type { MatchEvent, RosterWithStatsRow } from "@/api/types";
import { listRatings, saveRatings } from "@/api/ratings";
import { getErrorMessage } from "@/lib/errors";
import { EVENT_TO_STATS_KEY } from "@/lib/events";
import { newClientId } from "@/lib/ids";

type AddEventInput = {
  playerId: number;
  eventType: EventType;
  half: 1 | 2;
  secondInMatch: number;
  clientEventId: string;
};

/** Writes are queued so they reach the server in order (an undo must follow its add). */
type QueueItem =
  | ({ kind: "add" } & AddEventInput)
  | { kind: "undo"; playerId: number; eventType: EventType };

type OptimisticContext = {
  previousRoster?: RosterWithStatsRow[];
  previousEvents?: MatchEvent[];
};

export function useLiveMatchData(matchId: number, isValidMatchId: boolean) {
  const qc = useQueryClient();
  const [pendingEventCount, setPendingEventCount] = useState(0);
  const [eventSyncError, setEventSyncError] = useState<string | null>(null);
  const eventQueueRef = useRef<QueueItem[]>([]);
  const optimisticIdRef = useRef(0);
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

  const adjustRosterStat = (playerId: number, eventType: string, by: 1 | -1) => {
    const statKey = EVENT_TO_STATS_KEY[eventType as EventType];
    if (!statKey) return;
    qc.setQueryData<RosterWithStatsRow[]>(["roster-with-stats", matchId], (old) =>
      (old ?? []).map((row) =>
        row.player_id !== playerId
          ? row
          : {
              ...row,
              stats: { ...row.stats, [statKey]: Math.max(0, (row.stats[statKey] ?? 0) + by) },
            },
      ),
    );
  };

  const snapshotLiveCaches = async (): Promise<OptimisticContext> => {
    await qc.cancelQueries({ queryKey: ["roster-with-stats", matchId] });
    await qc.cancelQueries({ queryKey: ["events", matchId] });
    return {
      previousRoster: qc.getQueryData<RosterWithStatsRow[]>(["roster-with-stats", matchId]),
      previousEvents: qc.getQueryData<MatchEvent[]>(["events", matchId]),
    };
  };

  const rollbackLiveCaches = (ctx?: OptimisticContext) => {
    if (!ctx) return;
    if (ctx.previousRoster) qc.setQueryData(["roster-with-stats", matchId], ctx.previousRoster);
    if (ctx.previousEvents) qc.setQueryData(["events", matchId], ctx.previousEvents);
  };

  const addEventMutation = useMutation({
    mutationFn: (p: AddEventInput) =>
      addEvent({
        matchId,
        playerId: p.playerId,
        eventType: p.eventType,
        half: p.half,
        secondInMatch: p.secondInMatch,
        clientEventId: p.clientEventId,
      }),
    onMutate: async (p) => {
      const ctx = await snapshotLiveCaches();
      adjustRosterStat(p.playerId, p.eventType, 1);
      optimisticIdRef.current -= 1;
      const optimisticEvent: MatchEvent = {
        id: optimisticIdRef.current,
        match_id: matchId,
        player_id: p.playerId,
        event_type: p.eventType,
        delta: 1,
        half: p.half,
        second_in_match: p.secondInMatch,
        client_event_id: p.clientEventId,
      };
      qc.setQueryData<MatchEvent[]>(["events", matchId], (old) => [...(old ?? []), optimisticEvent]);
      return { ...ctx, optimisticId: optimisticEvent.id };
    },
    onError: (_err, _vars, ctx) => rollbackLiveCaches(ctx),
    onSuccess: (serverEvent, _vars, ctx) => {
      qc.setQueryData<MatchEvent[]>(["events", matchId], (old) => {
        if (!old) return [serverEvent];
        return old.map((ev) => (ev.id === ctx?.optimisticId ? serverEvent : ev));
      });
    },
  });

  const undoEventMutation = useMutation({
    mutationFn: (p: { playerId: number; eventType: EventType }) =>
      undoLastEvent({ matchId, playerId: p.playerId, eventType: p.eventType }),
    onMutate: async (p) => {
      const ctx = await snapshotLiveCaches();
      adjustRosterStat(p.playerId, p.eventType, -1);
      qc.setQueryData<MatchEvent[]>(["events", matchId], (old) => {
        const list = old ?? [];
        let idx = -1;
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (list[i].player_id === p.playerId && list[i].event_type === p.eventType) {
            idx = i;
            break;
          }
        }
        return idx < 0 ? list : list.filter((_, i) => i !== idx);
      });
      return ctx;
    },
    onError: (_err, _vars, ctx) => rollbackLiveCaches(ctx),
  });

  /** Remove one specific event (e.g. from the "last events" list). */
  const deleteEventMutation = useMutation({
    mutationFn: (ev: MatchEvent) => deleteEvent(matchId, ev.id),
    onMutate: async (ev) => {
      const ctx = await snapshotLiveCaches();
      adjustRosterStat(ev.player_id, ev.event_type, -1);
      qc.setQueryData<MatchEvent[]>(["events", matchId], (old) =>
        (old ?? []).filter((e) => e.id !== ev.id),
      );
      return ctx;
    },
    onError: (_err, _vars, ctx) => rollbackLiveCaches(ctx),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["roster-with-stats", matchId] });
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
          if (next.kind === "add") {
            await addEventMutation.mutateAsync(next);
          } else {
            await undoEventMutation.mutateAsync(next);
          }
        } catch (err: unknown) {
          setEventSyncError(getErrorMessage(err));
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
      setPendingEventCount(0);
      // Stats are derived on the server: resync once the queue is drained.
      void qc.invalidateQueries({ queryKey: ["roster-with-stats", matchId] });
    }
  }, [addEventMutation, undoEventMutation, qc, matchId]);

  const enqueue = useCallback(
    (item: QueueItem) => {
      setEventSyncError(null);
      eventQueueRef.current.push(item);
      setPendingEventCount(eventQueueRef.current.length);
      void processEventQueue();
    },
    [processEventQueue],
  );

  const enqueueAddEvent = useCallback(
    (p: Omit<AddEventInput, "clientEventId">) =>
      enqueue({ kind: "add", ...p, clientEventId: newClientId() }),
    [enqueue],
  );

  const enqueueUndoEvent = useCallback(
    (p: { playerId: number; eventType: EventType }) => enqueue({ kind: "undo", ...p }),
    [enqueue],
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
    deleteEventMutation,
    enqueueAddEvent,
    enqueueUndoEvent,
    pendingEventCount,
    eventSyncError,
    saveRatingsMutation,
    substitutions,
    createSubstitutionMutation,
    substitutionsQuery,
  };
}

