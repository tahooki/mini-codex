import type { JsonObject, MiniCodexClock, MiniCodexEvent, MiniCodexEventType, MiniCodexIdGenerator } from "./types.js";

export type CreateMiniCodexEventInput = {
  type: MiniCodexEventType;
  threadId?: string;
  runId?: string;
  messageId?: string;
  approvalId?: string;
  capabilityRequestId?: string;
  orchestrationGraphId?: string;
  payload?: JsonObject;
};

export function createMiniCodexEvent(
  input: CreateMiniCodexEventInput,
  ids: MiniCodexIdGenerator,
  now: MiniCodexClock,
): MiniCodexEvent {
  return {
    id: ids("event"),
    type: input.type,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.messageId ? { messageId: input.messageId } : {}),
    ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    ...(input.capabilityRequestId ? { capabilityRequestId: input.capabilityRequestId } : {}),
    ...(input.orchestrationGraphId ? { orchestrationGraphId: input.orchestrationGraphId } : {}),
    payload: input.payload ?? {},
    createdAt: now()
  };
}

export function createCounterIdGenerator(): MiniCodexIdGenerator {
  const counters = new Map<string, number>();

  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}

export const isoClock: MiniCodexClock = () => new Date().toISOString();
