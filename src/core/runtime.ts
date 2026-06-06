import { approvalDecisionFor } from "./approvals.js";
import { CapabilityRegistry, defaultApprovalForEffect } from "./capabilities.js";
import { ContextProviderRegistry } from "./context.js";
import { createCounterIdGenerator, createMiniCodexEvent, isoClock } from "./events.js";
import { MockAgentAdapter } from "./adapters/mockAgent.js";
import { MemoryMiniCodexStorage } from "./storage/memoryStorage.js";
import {
  createOrchestrationObservation,
  reduceOrchestrationGraph,
  selectOrchestrationTerminalState,
  summarizeOrchestrationGraph,
  type OrchestrationGraph,
  type OrchestrationGraphSummary,
  type OrchestrationObservation,
  type Orchestrator
} from "../orchestration/index.js";
import type {
  AgentAdapter,
  AgentAdapterStep,
  ApprovalPolicy,
  ApprovalRequest,
  Capability,
  CapabilityContext,
  CapabilityRequest,
  CollectedContext,
  ContextProvider,
  CreateThreadInput,
  MiniCodexClock,
  MiniCodexEvent,
  MiniCodexIdGenerator,
  MiniCodexMessage,
  MiniCodexRun,
  MiniCodexRuntimeSubscriber,
  MiniCodexSnapshot,
  MiniCodexStorage,
  MiniCodexThread,
  SendMessageInput
} from "./types.js";

export type MiniCodexRuntimeOptions = {
  agent?: AgentAdapter;
  approvalPolicy?: ApprovalPolicy;
  capabilities?: Capability[];
  contextProviders?: ContextProvider[];
  ids?: MiniCodexIdGenerator;
  now?: MiniCodexClock;
  orchestrator?: Orchestrator;
  storage?: MiniCodexStorage;
};

type PendingApprovalExecution = {
  approvalId: string;
  capability: Capability;
  capabilityContext: CapabilityContext;
  capabilityRequest: CapabilityRequest;
  input: CapabilityRequest["input"];
};

export class MiniCodexRuntime {
  private readonly agent: AgentAdapter;
  private readonly approvalPolicy: ApprovalPolicy | undefined;
  private readonly capabilityRegistry = new CapabilityRegistry();
  private readonly contextRegistry = new ContextProviderRegistry();
  private readonly ids: MiniCodexIdGenerator;
  private readonly now: MiniCodexClock;
  private readonly orchestrator: Orchestrator | undefined;
  private readonly pendingExecutions = new Map<string, PendingApprovalExecution>();
  private readonly storage: MiniCodexStorage;
  private readonly subscribers = new Set<MiniCodexRuntimeSubscriber>();

  constructor(options: MiniCodexRuntimeOptions = {}) {
    this.agent = options.agent ?? new MockAgentAdapter();
    this.approvalPolicy = options.approvalPolicy;
    this.ids = options.ids ?? createCounterIdGenerator();
    this.now = options.now ?? isoClock;
    this.orchestrator = options.orchestrator;
    this.storage = options.storage ?? new MemoryMiniCodexStorage();

    for (const provider of options.contextProviders ?? []) {
      this.registerContextProvider(provider);
    }
    for (const capability of options.capabilities ?? []) {
      this.registerCapability(capability);
    }
  }

  subscribe(subscriber: MiniCodexRuntimeSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  snapshot(): MiniCodexSnapshot {
    return this.storage.snapshot();
  }

  registerContextProvider(provider: ContextProvider): void {
    this.contextRegistry.register(provider);
  }

  listContextProviders(): ContextProvider[] {
    return this.contextRegistry.list();
  }

  registerCapability(capability: Capability): void {
    this.capabilityRegistry.register(capability);
  }

  listCapabilities(): Capability[] {
    return this.capabilityRegistry.list();
  }

  createThread(input: CreateThreadInput = {}): MiniCodexThread {
    const now = this.now();
    const thread: MiniCodexThread = {
      id: this.ids("thread"),
      title: input.title ?? "New thread",
      createdAt: now,
      updatedAt: now
    };
    this.storage.saveThread(thread);
    this.emit({
      type: "thread.created",
      threadId: thread.id,
      payload: { title: thread.title }
    });
    return thread;
  }

  async collectContext(input: { threadId: string; runId?: string; messageId?: string; reason?: "run" | "manual" | "approval" }): Promise<CollectedContext[]> {
    const contexts = await this.contextRegistry.collect({
      threadId: input.threadId,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      reason: input.reason ?? "manual"
    }, this.ids, this.now);

    for (const context of contexts) {
      this.storage.saveContext(context);
      this.emit({
        type: "context.collected",
        threadId: context.threadId,
        ...(context.runId ? { runId: context.runId } : {}),
        payload: {
          contextId: context.id,
          providerName: context.providerName
        }
      });
    }

    return contexts;
  }

  async sendMessage(input: SendMessageInput): Promise<MiniCodexRun> {
    const thread = input.threadId ? this.requireThread(input.threadId) : this.createThread();
    const userMessage = this.createMessage({
      threadId: thread.id,
      role: "user",
      content: input.content,
      attachments: input.attachments ?? []
    });
    let run = this.createRun(thread.id, userMessage.id);
    const contexts = await this.collectContext({
      threadId: thread.id,
      runId: run.id,
      messageId: userMessage.id,
      reason: "run"
    });
    const orchestration = await this.prepareOrchestration(thread, run, userMessage, contexts);
    if (orchestration) {
      run = orchestration.run;
    }

    try {
      const capabilities = this.capabilityRegistry.summaries();
      for await (const step of this.agent.run({
        capabilities,
        contexts,
        ...(orchestration ? { orchestration: orchestration.summary } : {}),
        run,
        thread,
        userMessage
      })) {
        const maybePending = await this.handleAgentStep(step, run, contexts);
        if (maybePending) {
          return maybePending;
        }
      }
      return this.completeRun(run);
    } catch (error) {
      return this.failRun(run, error instanceof Error ? error.message : String(error));
    }
  }

  async approveApproval(approvalId: string): Promise<CapabilityRequest> {
    const approval = this.requireApproval(approvalId);
    if (approval.status !== "pending") {
      throw new Error(`approval is not pending: ${approval.status}`);
    }
    const pending = this.pendingExecutions.get(approvalId);
    if (!pending) {
      throw new Error(`no pending capability execution for approval: ${approvalId}`);
    }

    const decidedAt = this.now();
    const approved: ApprovalRequest = {
      ...approval,
      status: "approved",
      decidedAt
    };
    this.storage.saveApproval(approved);
    this.emit({
      type: "approval.approved",
      threadId: approval.threadId,
      runId: approval.runId,
      approvalId,
      capabilityRequestId: approval.capabilityRequestId,
      payload: { capabilityName: approval.capabilityName }
    });
    await this.recordOrchestrationObservation(approval.runId, createOrchestrationObservation({
      evidenceRefs: [`approval:${approvalId}`],
      ids: this.ids,
      kind: "approval-result",
      status: "passed",
      summary: `Approved ${approval.capabilityName}.`
    }));

    const result = await this.executeCapability(pending.capability, pending.input, pending.capabilityContext, pending.capabilityRequest);
    this.pendingExecutions.delete(approvalId);
    const run = this.storage.getRun(approval.runId);
    if (run && result.status !== "failed") {
      this.completeRun(run);
    }
    return result;
  }

  async rejectApproval(approvalId: string): Promise<CapabilityRequest> {
    const approval = this.requireApproval(approvalId);
    if (approval.status !== "pending") {
      throw new Error(`approval is not pending: ${approval.status}`);
    }
    const pending = this.pendingExecutions.get(approvalId);
    if (!pending) {
      throw new Error(`no pending capability execution for approval: ${approvalId}`);
    }

    const rejectedApproval: ApprovalRequest = {
      ...approval,
      status: "rejected",
      decidedAt: this.now()
    };
    this.storage.saveApproval(rejectedApproval);
    this.emit({
      type: "approval.rejected",
      threadId: approval.threadId,
      runId: approval.runId,
      approvalId,
      capabilityRequestId: approval.capabilityRequestId,
      payload: { capabilityName: approval.capabilityName }
    });

    const rejectedRequest: CapabilityRequest = {
      ...pending.capabilityRequest,
      status: "rejected",
      error: "Approval rejected.",
      completedAt: this.now()
    };
    this.storage.saveCapabilityRequest(rejectedRequest);
    this.pendingExecutions.delete(approvalId);
    await this.recordOrchestrationObservation(approval.runId, createOrchestrationObservation({
      evidenceRefs: [`approval:${approvalId}`],
      ids: this.ids,
      kind: "approval-result",
      status: "cancelled",
      summary: `Rejected ${approval.capabilityName}.`
    }));

    const run = this.storage.getRun(approval.runId);
    if (run) {
      this.failRun(run, "Approval rejected.");
    }

    return rejectedRequest;
  }

  private async handleAgentStep(step: AgentAdapterStep, run: MiniCodexRun, contexts: CollectedContext[]): Promise<MiniCodexRun | null> {
    if (step.type === "message") {
      this.createMessage({
        threadId: run.threadId,
        runId: run.id,
        role: "assistant",
        content: step.content,
        attachments: []
      });
      return null;
    }
    if (step.type === "event") {
      this.emit({
        type: step.eventType,
        threadId: run.threadId,
        runId: run.id,
        payload: step.payload
      });
      return null;
    }
    if (step.type === "final") {
      if (step.content) {
        this.createMessage({
          threadId: run.threadId,
          runId: run.id,
          role: "assistant",
          content: step.content,
          attachments: []
        });
      }
      return this.completeRun(run);
    }
    if (step.type === "error") {
      return this.failRun(run, step.message);
    }

    const capability = this.capabilityRegistry.require(step.capabilityName);
    const capabilityRequest = this.createCapabilityRequest(run, capability.name, step.input);
    const capabilityContext: CapabilityContext = {
      threadId: run.threadId,
      runId: run.id,
      contexts
    };
    const approvalMode = capability.approval ?? defaultApprovalForEffect(capability.effect ?? "read");
    const preview = capability.preview ? await capability.preview(step.input, capabilityContext) : undefined;
    const approval = this.createApprovalRequest(capabilityRequest, preview);
    const decision = await approvalDecisionFor(approvalMode, approval, this.approvalPolicy);

    if (decision === "reject") {
      const rejected: CapabilityRequest = {
        ...capabilityRequest,
        status: "rejected",
        error: "Approval policy rejected the capability request.",
        completedAt: this.now()
      };
      this.storage.saveCapabilityRequest(rejected);
      return this.failRun(run, rejected.error ?? "Capability rejected.");
    }
    if (decision === "request") {
      const awaitingRequest: CapabilityRequest = {
        ...capabilityRequest,
        status: "awaiting_approval"
      };
      this.storage.saveCapabilityRequest(awaitingRequest);
      this.storage.saveApproval(approval);
      this.pendingExecutions.set(approval.id, {
        approvalId: approval.id,
        capability,
        capabilityContext,
        capabilityRequest: awaitingRequest,
        input: step.input
      });
      this.emit({
        type: "approval.requested",
        threadId: run.threadId,
        runId: run.id,
        approvalId: approval.id,
        capabilityRequestId: capabilityRequest.id,
        payload: {
          capabilityName: capability.name,
          previewTitle: preview?.title ?? capability.description
        }
      });
      return this.updateRun({
        ...run,
        status: "awaiting_approval"
      });
    }

    const executed = await this.executeCapability(capability, step.input, capabilityContext, capabilityRequest);
    if (executed.status === "failed") {
      return this.storage.getRun(run.id) ?? this.failRun(run, executed.error ?? "Capability failed.");
    }
    return null;
  }

  private async prepareOrchestration(
    thread: MiniCodexThread,
    run: MiniCodexRun,
    userMessage: MiniCodexMessage,
    contexts: CollectedContext[],
  ): Promise<{ run: MiniCodexRun; summary: OrchestrationGraphSummary } | null> {
    if (!this.orchestrator) {
      return null;
    }

    const graph = await this.orchestrator.createGraph({
      attachmentsCount: userMessage.attachments.length,
      capabilities: this.capabilityRegistry.summaries(),
      contexts,
      ids: this.ids,
      now: this.now,
      runId: run.id,
      selectedContext: contexts.length > 0,
      threadId: thread.id,
      userMessage: userMessage.content
    });
    const summary = summarizeOrchestrationGraph(graph);
    this.saveOrchestrationGraph(graph);
    const updatedRun: MiniCodexRun = {
      ...run,
      ...(summary.executionPolicy ? { executionPolicy: summary.executionPolicy } : {}),
      orchestrationGraphId: graph.id
    };
    this.storage.saveRun(updatedRun);
    this.emit({
      type: "orchestration.created",
      threadId: thread.id,
      runId: run.id,
      orchestrationGraphId: graph.id,
      payload: {
        graphId: graph.id,
        publicSummary: summary.publicSummary,
        ...(summary.executionPolicy ? { executionPolicy: summary.executionPolicy } : {}),
        ...(summary.selectedAction ? { selectedAction: summary.selectedAction } : {})
      }
    });
    return { run: updatedRun, summary };
  }

  private createMessage(input: {
    threadId: string;
    runId?: string;
    role: MiniCodexMessage["role"];
    content: string;
    attachments: MiniCodexMessage["attachments"];
  }): MiniCodexMessage {
    const message: MiniCodexMessage = {
      id: this.ids("message"),
      threadId: input.threadId,
      ...(input.runId ? { runId: input.runId } : {}),
      role: input.role,
      content: input.content,
      attachments: input.attachments,
      createdAt: this.now()
    };
    this.storage.saveMessage(message);
    this.emit({
      type: "message.created",
      threadId: message.threadId,
      ...(message.runId ? { runId: message.runId } : {}),
      messageId: message.id,
      payload: {
        role: message.role
      }
    });
    return message;
  }

  private createRun(threadId: string, userMessageId: string): MiniCodexRun {
    const run: MiniCodexRun = {
      id: this.ids("run"),
      threadId,
      userMessageId,
      status: "running",
      startedAt: this.now()
    };
    this.storage.saveRun(run);
    this.emit({
      type: "run.started",
      threadId,
      runId: run.id,
      messageId: userMessageId,
      payload: {}
    });
    return run;
  }

  private createCapabilityRequest(run: MiniCodexRun, capabilityName: string, input: CapabilityRequest["input"]): CapabilityRequest {
    const request: CapabilityRequest = {
      id: this.ids("capability_request"),
      threadId: run.threadId,
      runId: run.id,
      capabilityName,
      input,
      status: "requested",
      createdAt: this.now()
    };
    this.storage.saveCapabilityRequest(request);
    this.emit({
      type: "capability.requested",
      threadId: run.threadId,
      runId: run.id,
      capabilityRequestId: request.id,
      payload: {
        capabilityName
      }
    });
    return request;
  }

  private createApprovalRequest(request: CapabilityRequest, preview?: ApprovalRequest["preview"]): ApprovalRequest {
    return {
      id: this.ids("approval"),
      threadId: request.threadId,
      runId: request.runId,
      capabilityRequestId: request.id,
      capabilityName: request.capabilityName,
      input: request.input,
      ...(preview ? { preview } : {}),
      status: "pending",
      createdAt: this.now()
    };
  }

  private async executeCapability(
    capability: Capability,
    input: CapabilityRequest["input"],
    context: CapabilityContext,
    request: CapabilityRequest,
  ): Promise<CapabilityRequest> {
    try {
      const output = await capability.run(input, context);
      const completed: CapabilityRequest = {
        ...request,
        status: "completed",
        output,
        completedAt: this.now()
      };
      this.storage.saveCapabilityRequest(completed);
      this.emit({
        type: "capability.completed",
        threadId: request.threadId,
        runId: request.runId,
        capabilityRequestId: request.id,
        payload: {
          capabilityName: request.capabilityName
        }
      });
      await this.recordOrchestrationObservation(request.runId, createOrchestrationObservation({
        evidenceRefs: [`capability:${request.capabilityName}:${request.id}`],
        ids: this.ids,
        kind: "capability-result",
        status: "passed",
        summary: `Capability completed: ${request.capabilityName}.`
      }));
      return completed;
    } catch (error) {
      const failed: CapabilityRequest = {
        ...request,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: this.now()
      };
      this.storage.saveCapabilityRequest(failed);
      this.emit({
        type: "capability.failed",
        threadId: request.threadId,
        runId: request.runId,
        capabilityRequestId: request.id,
        payload: {
          capabilityName: request.capabilityName,
          error: failed.error ?? "Capability failed."
        }
      });
      await this.recordOrchestrationObservation(request.runId, createOrchestrationObservation({
        evidenceRefs: [`capability:${request.capabilityName}:${request.id}`],
        ids: this.ids,
        kind: "capability-result",
        status: "failed",
        summary: `Capability failed: ${request.capabilityName}.`
      }));
      const run = this.storage.getRun(request.runId);
      if (run) {
        this.failRun(run, failed.error ?? "Capability failed.");
      }
      return failed;
    }
  }

  private completeRun(run: MiniCodexRun): MiniCodexRun {
    if (run.status === "completed") {
      return run;
    }
    const completed = this.updateRun({
      ...run,
      status: "completed",
      endedAt: this.now()
    }, "run.completed");
    this.recordOrchestrationTerminalSync(completed, "final");
    return completed;
  }

  private failRun(run: MiniCodexRun, error: string): MiniCodexRun {
    if (run.status === "failed") {
      return run;
    }
    const failed = this.updateRun({
      ...run,
      status: "failed",
      error,
      endedAt: this.now()
    }, "run.failed");
    this.recordOrchestrationTerminalSync(failed, "failed", error);
    return failed;
  }

  private updateRun(run: MiniCodexRun, eventType?: "run.completed" | "run.failed"): MiniCodexRun {
    this.storage.saveRun(run);
    if (eventType) {
      this.emit({
        type: eventType,
        threadId: run.threadId,
        runId: run.id,
        payload: {
          status: run.status,
          ...(run.error ? { error: run.error } : {})
        }
      });
    }
    return run;
  }

  private requireThread(threadId: string): MiniCodexThread {
    const thread = this.storage.getThread(threadId);
    if (!thread) {
      throw new Error(`unknown thread: ${threadId}`);
    }
    return thread;
  }

  private requireApproval(approvalId: string): ApprovalRequest {
    const approval = this.storage.getApproval(approvalId);
    if (!approval) {
      throw new Error(`unknown approval: ${approvalId}`);
    }
    return approval;
  }

  private emit(input: Parameters<typeof createMiniCodexEvent>[0]): MiniCodexEvent {
    const event = createMiniCodexEvent(input, this.ids, this.now);
    this.storage.saveEvent(event);
    const snapshot = this.snapshot();
    for (const subscriber of this.subscribers) {
      subscriber(event, snapshot);
    }
    return event;
  }

  private saveOrchestrationGraph(graph: OrchestrationGraph): void {
    this.storage.saveOrchestrationGraph?.(graph);
  }

  private getOrchestrationGraph(run: MiniCodexRun | undefined): OrchestrationGraph | undefined {
    return run?.orchestrationGraphId ? this.storage.getOrchestrationGraph?.(run.orchestrationGraphId) : undefined;
  }

  private async recordOrchestrationObservation(runId: string, observation: OrchestrationObservation): Promise<void> {
    const run = this.storage.getRun(runId);
    const graph = this.getOrchestrationGraph(run);
    if (!run || !graph) {
      return;
    }
    const reduced = this.orchestrator?.reduceObservation
      ? await this.orchestrator.reduceObservation(graph, observation)
      : reduceOrchestrationGraph(graph, {
        ids: this.ids,
        now: this.now,
        observation,
        type: "observation_recorded"
      });
    this.saveAndEmitOrchestration(run, reduced);
  }

  private recordOrchestrationTerminalSync(
    run: MiniCodexRun,
    kind: "final" | "failed",
    reason?: string,
  ): void {
    const graph = this.getOrchestrationGraph(run);
    if (!graph || graph.terminal) {
      return;
    }
    const terminal = selectOrchestrationTerminalState({
      graph,
      kind,
      ...(reason ? { reason } : {})
    });
    const reduced = reduceOrchestrationGraph(graph, {
      ids: this.ids,
      now: this.now,
      terminal,
      type: "terminal_selected"
    });
    this.saveAndEmitOrchestration(run, reduced);
  }

  private saveAndEmitOrchestration(run: MiniCodexRun, graph: OrchestrationGraph): void {
    this.saveOrchestrationGraph(graph);
    const summary = summarizeOrchestrationGraph(graph);
    this.emit({
      type: graph.terminal ? "orchestration.terminal" : "orchestration.updated",
      threadId: run.threadId,
      runId: run.id,
      orchestrationGraphId: graph.id,
      payload: {
        graphId: graph.id,
        publicSummary: summary.publicSummary,
        ...(summary.executionPolicy ? { executionPolicy: summary.executionPolicy } : {}),
        ...(summary.latestObservation ? { latestObservation: summary.latestObservation } : {}),
        ...(summary.selectedAction ? { selectedAction: summary.selectedAction } : {}),
        ...(summary.terminalClaimLevel ? { terminalClaimLevel: summary.terminalClaimLevel } : {}),
        ...(summary.terminalKind ? { terminalKind: summary.terminalKind } : {})
      }
    });
  }
}
