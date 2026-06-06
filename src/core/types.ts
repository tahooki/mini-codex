import type {
  OrchestrationExecutionPolicy,
  OrchestrationGraph,
  OrchestrationGraphSummary
} from "../orchestration/index.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type MiniCodexIdGenerator = (prefix: string) => string;
export type MiniCodexClock = () => string;

export type MiniCodexThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type MiniCodexMessageRole = "user" | "assistant" | "system" | "tool";

export type MiniCodexAttachment = {
  id?: string;
  type: string;
  label?: string;
  data?: JsonValue;
};

export type MiniCodexMessage = {
  id: string;
  threadId: string;
  runId?: string;
  role: MiniCodexMessageRole;
  content: string;
  attachments: MiniCodexAttachment[];
  createdAt: string;
};

export type MiniCodexRunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type MiniCodexRun = {
  id: string;
  threadId: string;
  userMessageId: string;
  status: MiniCodexRunStatus;
  orchestrationGraphId?: string;
  executionPolicy?: OrchestrationExecutionPolicy;
  startedAt: string;
  endedAt?: string;
  error?: string;
};

export type MiniCodexEventType =
  | "thread.created"
  | "message.created"
  | "run.started"
  | "context.collected"
  | "agent.thread.started"
  | "agent.turn.started"
  | "agent.turn.completed"
  | "agent.turn.failed"
  | "agent.item.started"
  | "agent.item.updated"
  | "agent.item.completed"
  | "orchestration.created"
  | "orchestration.updated"
  | "orchestration.terminal"
  | "capability.requested"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "capability.completed"
  | "capability.failed"
  | "run.completed"
  | "run.failed";

export type MiniCodexEvent = {
  id: string;
  type: MiniCodexEventType;
  threadId?: string;
  runId?: string;
  messageId?: string;
  approvalId?: string;
  capabilityRequestId?: string;
  orchestrationGraphId?: string;
  payload: JsonObject;
  createdAt: string;
};

export type ContextScope = {
  threadId: string;
  runId?: string;
  messageId?: string;
  reason: "run" | "manual" | "approval";
};

export type ContextProvider<TContext = JsonValue> = {
  name: string;
  description?: string;
  getContext: (scope: ContextScope) => Promise<TContext> | TContext;
};

export type CollectedContext = {
  id: string;
  threadId: string;
  runId?: string;
  providerName: string;
  description?: string;
  value: JsonValue;
  collectedAt: string;
};

export type CapabilityApprovalMode = "never" | "always" | "policy";
export type CapabilityEffect = "read" | "write" | "network" | "local";

export type ApprovalPreview = {
  title: string;
  description?: string;
  changes?: string[];
  data?: JsonValue;
};

export type CapabilityContext = {
  threadId: string;
  runId: string;
  contexts: CollectedContext[];
};

export type Capability<TInput extends JsonValue = JsonValue, TOutput extends JsonValue = JsonValue> = {
  name: string;
  description: string;
  inputSchema?: unknown;
  effect?: CapabilityEffect;
  approval?: CapabilityApprovalMode;
  preview?: (input: TInput, context: CapabilityContext) => Promise<ApprovalPreview> | ApprovalPreview;
  run: (input: TInput, context: CapabilityContext) => Promise<TOutput> | TOutput;
};

export type CapabilityRequestStatus = "requested" | "awaiting_approval" | "completed" | "failed" | "rejected";

export type CapabilityRequest = {
  id: string;
  threadId: string;
  runId: string;
  capabilityName: string;
  input: JsonValue;
  status: CapabilityRequestStatus;
  output?: JsonValue;
  error?: string;
  createdAt: string;
  completedAt?: string;
};

export type ApprovalRequestStatus = "pending" | "approved" | "rejected";

export type ApprovalRequest = {
  id: string;
  threadId: string;
  runId: string;
  capabilityRequestId: string;
  capabilityName: string;
  input: JsonValue;
  preview?: ApprovalPreview;
  status: ApprovalRequestStatus;
  createdAt: string;
  decidedAt?: string;
};

export type ApprovalDecision = "approve" | "reject" | "request";

export type ApprovalPolicy = {
  shouldApprove: (request: ApprovalRequest) => Promise<ApprovalDecision> | ApprovalDecision;
};

export type AgentAdapterRunInput = {
  thread: MiniCodexThread;
  run: MiniCodexRun;
  userMessage: MiniCodexMessage;
  contexts: CollectedContext[];
  orchestration?: OrchestrationGraphSummary;
  capabilities: Array<{
    name: string;
    description: string;
    effect: CapabilityEffect;
    approval: CapabilityApprovalMode;
  }>;
};

export type AgentAdapterStep =
  | { type: "message"; content: string }
  | {
    type: "event";
    eventType: Extract<
      MiniCodexEventType,
      | "agent.thread.started"
      | "agent.turn.started"
      | "agent.turn.completed"
      | "agent.turn.failed"
      | "agent.item.started"
      | "agent.item.updated"
      | "agent.item.completed"
    >;
    payload: JsonObject;
  }
  | { type: "capability_request"; capabilityName: string; input: JsonValue }
  | { type: "final"; content?: string }
  | { type: "error"; message: string };

export type AgentAdapter = {
  run(input: AgentAdapterRunInput): AsyncGenerator<AgentAdapterStep>;
};

export type MiniCodexSnapshot = {
  threads: MiniCodexThread[];
  messages: MiniCodexMessage[];
  runs: MiniCodexRun[];
  events: MiniCodexEvent[];
  contexts: CollectedContext[];
  capabilityRequests: CapabilityRequest[];
  approvals: ApprovalRequest[];
  orchestrationGraphs?: OrchestrationGraph[];
};

export type MiniCodexRuntimeSubscriber = (event: MiniCodexEvent, snapshot: MiniCodexSnapshot) => void;

export type SendMessageInput = {
  threadId?: string;
  content: string;
  attachments?: MiniCodexAttachment[];
};

export type CreateThreadInput = {
  title?: string;
};

export type MiniCodexStorage = {
  saveThread(thread: MiniCodexThread): void;
  getThread(id: string): MiniCodexThread | undefined;
  saveMessage(message: MiniCodexMessage): void;
  saveRun(run: MiniCodexRun): void;
  getRun(id: string): MiniCodexRun | undefined;
  saveEvent(event: MiniCodexEvent): void;
  saveContext(context: CollectedContext): void;
  saveCapabilityRequest(request: CapabilityRequest): void;
  getCapabilityRequest(id: string): CapabilityRequest | undefined;
  saveApproval(request: ApprovalRequest): void;
  getApproval(id: string): ApprovalRequest | undefined;
  saveOrchestrationGraph?: (graph: OrchestrationGraph) => void;
  getOrchestrationGraph?: (id: string) => OrchestrationGraph | undefined;
  listOrchestrationGraphs?: () => OrchestrationGraph[];
  snapshot(): MiniCodexSnapshot;
};
