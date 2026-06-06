import type {
  ApprovalRequest,
  CapabilityRequest,
  CollectedContext,
  MiniCodexStorage,
  MiniCodexEvent,
  MiniCodexMessage,
  MiniCodexRun,
  MiniCodexSnapshot,
  MiniCodexThread
} from "../types.js";
import type { OrchestrationGraph } from "../../orchestration/index.js";

export class MemoryMiniCodexStorage implements MiniCodexStorage {
  private readonly threads = new Map<string, MiniCodexThread>();
  private readonly messages = new Map<string, MiniCodexMessage>();
  private readonly runs = new Map<string, MiniCodexRun>();
  private readonly events = new Map<string, MiniCodexEvent>();
  private readonly contexts = new Map<string, CollectedContext>();
  private readonly capabilityRequests = new Map<string, CapabilityRequest>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly orchestrationGraphs = new Map<string, OrchestrationGraph>();

  saveThread(thread: MiniCodexThread): void {
    this.threads.set(thread.id, thread);
  }

  getThread(id: string): MiniCodexThread | undefined {
    return this.threads.get(id);
  }

  saveMessage(message: MiniCodexMessage): void {
    this.messages.set(message.id, message);
  }

  saveRun(run: MiniCodexRun): void {
    this.runs.set(run.id, run);
  }

  getRun(id: string): MiniCodexRun | undefined {
    return this.runs.get(id);
  }

  saveEvent(event: MiniCodexEvent): void {
    this.events.set(event.id, event);
  }

  saveContext(context: CollectedContext): void {
    this.contexts.set(context.id, context);
  }

  saveCapabilityRequest(request: CapabilityRequest): void {
    this.capabilityRequests.set(request.id, request);
  }

  getCapabilityRequest(id: string): CapabilityRequest | undefined {
    return this.capabilityRequests.get(id);
  }

  saveApproval(request: ApprovalRequest): void {
    this.approvals.set(request.id, request);
  }

  getApproval(id: string): ApprovalRequest | undefined {
    return this.approvals.get(id);
  }

  saveOrchestrationGraph(graph: OrchestrationGraph): void {
    this.orchestrationGraphs.set(graph.id, graph);
  }

  getOrchestrationGraph(id: string): OrchestrationGraph | undefined {
    return this.orchestrationGraphs.get(id);
  }

  listOrchestrationGraphs(): OrchestrationGraph[] {
    return newestFirst(this.orchestrationGraphs.values());
  }

  snapshot(): MiniCodexSnapshot {
    return {
      threads: newestFirst(this.threads.values()),
      messages: oldestFirst(this.messages.values()),
      runs: newestFirst(this.runs.values()),
      events: oldestFirst(this.events.values()),
      contexts: oldestFirst(this.contexts.values()),
      capabilityRequests: oldestFirst(this.capabilityRequests.values()),
      approvals: newestFirst(this.approvals.values()),
      ...(this.orchestrationGraphs.size > 0 ? { orchestrationGraphs: this.listOrchestrationGraphs() } : {})
    };
  }
}

function oldestFirst<T extends { createdAt?: string; collectedAt?: string; startedAt?: string }>(items: Iterable<T>): T[] {
  return [...items].sort((left, right) => timestamp(left).localeCompare(timestamp(right)));
}

function newestFirst<T extends { createdAt?: string; collectedAt?: string; startedAt?: string }>(items: Iterable<T>): T[] {
  return oldestFirst(items).reverse();
}

function timestamp(item: { createdAt?: string; collectedAt?: string; startedAt?: string }) {
  return item.createdAt ?? item.collectedAt ?? item.startedAt ?? "";
}
