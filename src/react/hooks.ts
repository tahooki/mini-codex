import { useEffect, useMemo, useState } from "react";
import type { ApprovalRequest, MiniCodexEvent, MiniCodexRun, MiniCodexSnapshot, MiniCodexThread } from "../core/index.js";
import { useMiniCodexContext } from "./MiniCodexProvider.js";

export function useMiniCodex() {
  return useMiniCodexContext();
}

export function useMiniCodexSnapshot(): MiniCodexSnapshot {
  const runtime = useMiniCodex();
  const [snapshot, setSnapshot] = useState<MiniCodexSnapshot>(() => runtime.snapshot());

  useEffect(() => {
    setSnapshot(runtime.snapshot());
    return runtime.subscribe((_event, nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });
  }, [runtime]);

  return snapshot;
}

export function useAgentThread(threadId?: string): MiniCodexThread | undefined {
  const snapshot = useMiniCodexSnapshot();
  return useMemo(() => (
    threadId
      ? snapshot.threads.find((thread) => thread.id === threadId)
      : snapshot.threads[0]
  ), [snapshot.threads, threadId]);
}

export function useAgentRun(runId?: string): MiniCodexRun | undefined {
  const snapshot = useMiniCodexSnapshot();
  return useMemo(() => (
    runId
      ? snapshot.runs.find((run) => run.id === runId)
      : snapshot.runs[0]
  ), [snapshot.runs, runId]);
}

export function useAgentEvents(runId?: string): MiniCodexEvent[] {
  const snapshot = useMiniCodexSnapshot();
  return useMemo(() => (
    runId
      ? snapshot.events.filter((event) => event.runId === runId)
      : snapshot.events
  ), [snapshot.events, runId]);
}

export function useApprovalQueue(threadId?: string): ApprovalRequest[] {
  const snapshot = useMiniCodexSnapshot();
  return useMemo(() => snapshot.approvals.filter((approval) => (
    approval.status === "pending" && (!threadId || approval.threadId === threadId)
  )), [snapshot.approvals, threadId]);
}
