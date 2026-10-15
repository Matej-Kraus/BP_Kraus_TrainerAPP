import { useState } from "react";
import { Button } from "@/components/ui/button";

import { useAuth } from "@/auth/AuthContext";
import type { MatchStatus } from "@/api/matches";
import { formatClock, matchStatusLabel } from "@/lib/format";

type Props = {
  matchId: number;
  status: MatchStatus | null;
  half: 1 | 2;
  clockSeconds: number;
  onBack: () => void;
  onRefresh: () => void;
  onStart: () => void | Promise<unknown>;
  onHalfTime: () => void | Promise<unknown>;
  onStartSecondHalf: () => void | Promise<unknown>;
  onFinish: () => void | Promise<unknown>;
  starting: boolean;
  halfTiming: boolean;
  startingSecond: boolean;
  finishing: boolean;
  setError: (msg: string | null) => void;
  getErrorMessage: (err: unknown) => string;
};

type PendingAction = "start_1" | "half_time" | "start_2" | "finish";

export function LiveMatchHeader({
  matchId,
  status,
  half,
  clockSeconds,
  onBack,
  onRefresh,
  onStart,
  onHalfTime,
  onStartSecondHalf,
  onFinish,
  starting,
  halfTiming,
  startingSecond,
  finishing,
  setError,
  getErrorMessage,
}: Props) {
  const auth = useAuth();
  const isCoach = auth.user?.role === "coach";
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const canStart = status === "planned";
  const canHalfTime = status === "live_half_1";
  const canStartSecond = status === "half_time";
  const canFinish = status === "live_half_1" || status === "live_half_2";

  const pendingQuestion =
    pendingAction === "start_1"
      ? "Opravdu chcete zahájit 1. poločas?"
      : pendingAction === "half_time"
        ? "Opravdu chcete ukončit 1. poločas a přejít na poločas?"
        : pendingAction === "start_2"
          ? "Opravdu chcete zahájit 2. poločas?"
          : pendingAction === "finish"
            ? "Opravdu chcete ukončit zápas?"
            : null;

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setError(null);
    try {
      if (pendingAction === "start_1") {
        await onStart();
      } else if (pendingAction === "half_time") {
        await onHalfTime();
      } else if (pendingAction === "start_2") {
        await onStartSecondHalf();
      } else {
        await onFinish();
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="flex w-full items-center justify-between gap-3 flex-wrap">
      <div className="flex flex-col">
        <div className="text-lg font-semibold">Live zápas</div>
        <div className="text-xs text-muted-foreground">
          Zápas ID: {matchId} • Stav: {matchStatusLabel(status)} • Poločas:{" "}
          {status === "planned" ? "—" : half} • Čas: {formatClock(clockSeconds)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" className="h-10 px-3" onClick={onBack}>
          Zpět
        </Button>
        <Button variant="outline" className="h-10 px-3 text-xs" onClick={onRefresh}>
          Obnovit data
        </Button>
        {isCoach && (
          <>
            <Button
              className="h-10 px-3 text-xs"
              onClick={() => setPendingAction("start_1")}
              disabled={!canStart || starting}
            >
              Start 1. poločas
            </Button>
            <Button
              className="h-10 px-3 text-xs"
              variant="outline"
              onClick={() => setPendingAction("half_time")}
              disabled={!canHalfTime || halfTiming}
            >
              Poločas
            </Button>
            <Button
              className="h-10 px-3 text-xs"
              variant="outline"
              onClick={() => setPendingAction("start_2")}
              disabled={!canStartSecond || startingSecond}
            >
              Start 2. poločas
            </Button>
            <Button
              className="h-10 px-3 text-xs"
              variant="outline"
              onClick={() => setPendingAction("finish")}
              disabled={!canFinish || finishing}
            >
              Ukončit
            </Button>
          </>
        )}
      </div>

      {pendingQuestion && (
        <div className="w-full rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm flex items-center justify-between gap-2">
          <span>{pendingQuestion}</span>
          <div className="flex items-center gap-2">
            <Button className="h-8 px-3 text-xs" onClick={confirmPendingAction}>
              Ano
            </Button>
            <Button
              className="h-8 px-3 text-xs"
              variant="outline"
              onClick={() => setPendingAction(null)}
            >
              Ne
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

