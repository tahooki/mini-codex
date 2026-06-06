import type {
  CapabilityApprovalMode,
  CapabilityEffect,
  CollectedContext,
  JsonObject,
  MiniCodexClock,
  MiniCodexIdGenerator
} from "../core/types.js";

export type OrchestrationGraphSchema = "mini-codex-orchestration-graph-v1";

export type OrchestrationHostState = "clean" | "dirty" | "stale";

export type OrchestrationNodeFamily =
  | "input"
  | "action-set"
  | "selection"
  | "gate"
  | "policy"
  | "observation"
  | "terminal";

export type OrchestrationSelectionSource = "default" | "host" | "model" | "observation";

export type OrchestrationActionExecutionBoundary =
  | "answer"
  | "current-host"
  | "capability"
  | "child-work"
  | "merge"
  | "repair";

export type OrchestrationGateStatus = "passed" | "warning" | "blocked" | "needs-user";

export type OrchestrationExecutionMode =
  | "answer"
  | "ask-user"
  | "current-host"
  | "capability"
  | "child-work"
  | "merge"
  | "repair"
  | "blocked";

export type OrchestrationAttention = "silent" | "indicator" | "needs-user";
export type OrchestrationApproval = "none" | "capability" | "manual";

export type OrchestrationObservationKind =
  | "agent-message"
  | "capability-result"
  | "approval-result"
  | "host-apply-result"
  | "validation-result"
  | "user-interrupt";

export type OrchestrationObservationStatus = "passed" | "warning" | "blocked" | "failed" | "cancelled";

export type OrchestrationTerminalKind =
  | "final"
  | "partial"
  | "blocked"
  | "failed"
  | "cancelled"
  | "needs-user";

export type OrchestrationClaimLevel =
  | "decision-only"
  | "partial-evidence"
  | "complete-for-scope";

export type OrchestrationCapabilitySummary = {
  name: string;
  description: string;
  effect: CapabilityEffect;
  approval: CapabilityApprovalMode;
};

export type OrchestrationInputSnapshot = {
  userMessage: string;
  attachmentsCount: number;
  contextSummary?: string;
  hostState?: OrchestrationHostState;
  selectedContext?: boolean;
  metadata?: JsonObject;
};

export type OrchestrationAction = {
  name: string;
  label: string;
  description: string;
  default?: boolean;
  executionBoundary: OrchestrationActionExecutionBoundary;
  requiresApproval?: boolean;
};

export type OrchestrationGate = {
  name: string;
  status: OrchestrationGateStatus;
  affectedActions: string[];
  summary: string;
  evidenceRefs?: string[];
};

export type OrchestrationExecutionPolicy = {
  mode: OrchestrationExecutionMode;
  attention: OrchestrationAttention;
  approval: OrchestrationApproval;
};

export type OrchestrationObservation = {
  id: string;
  kind: OrchestrationObservationKind;
  status: OrchestrationObservationStatus;
  summary: string;
  evidenceRefs: string[];
};

export type OrchestrationTerminalState = {
  kind: OrchestrationTerminalKind;
  claimLevel: OrchestrationClaimLevel;
  reason: string;
  evidenceRefs: string[];
};

export type OrchestrationNode = {
  id: string;
  family: OrchestrationNodeFamily;
  summary: string;
  createdAt: string;
  actions?: OrchestrationAction[];
  selectedAction?: string;
  selectionSource?: OrchestrationSelectionSource;
  gates?: OrchestrationGate[];
  executionPolicy?: OrchestrationExecutionPolicy;
  observation?: OrchestrationObservation;
  terminal?: OrchestrationTerminalState;
};

export type OrchestrationEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  reason: string;
  createdAt: string;
};

export type OrchestrationGraph = {
  id: string;
  schema: OrchestrationGraphSchema;
  runId?: string;
  threadId?: string;
  input: OrchestrationInputSnapshot;
  nodes: OrchestrationNode[];
  edges: OrchestrationEdge[];
  activeNodeId?: string;
  terminal?: OrchestrationTerminalState;
  createdAt: string;
  updatedAt: string;
};

export type OrchestrationCreateInput = {
  threadId?: string;
  runId?: string;
  userMessage: string;
  attachmentsCount?: number;
  contexts?: CollectedContext[];
  capabilities?: OrchestrationCapabilitySummary[];
  contextSummary?: string;
  hostState?: OrchestrationHostState;
  selectedContext?: boolean;
  metadata?: JsonObject;
  actions?: OrchestrationAction[];
  gates?: OrchestrationGate[];
  selectedAction?: string;
  selectionSource?: OrchestrationSelectionSource;
  ids?: MiniCodexIdGenerator;
  now?: MiniCodexClock;
};

export type OrchestrationGraphEvent =
  | {
    type: "action_selected";
    actionName: string;
    selectionSource?: OrchestrationSelectionSource;
    summary?: string;
    gates?: OrchestrationGate[];
    ids?: MiniCodexIdGenerator;
    now?: MiniCodexClock;
  }
  | {
    type: "gates_evaluated";
    gates: OrchestrationGate[];
    summary?: string;
    ids?: MiniCodexIdGenerator;
    now?: MiniCodexClock;
  }
  | {
    type: "observation_recorded";
    observation: OrchestrationObservation;
    ids?: MiniCodexIdGenerator;
    now?: MiniCodexClock;
  }
  | {
    type: "terminal_selected";
    terminal: OrchestrationTerminalState;
    ids?: MiniCodexIdGenerator;
    now?: MiniCodexClock;
  };

export type OrchestrationGraphSummary = {
  graphId: string;
  availableActions: string[];
  blockedGates: Array<{
    name: string;
    status: Exclude<OrchestrationGateStatus, "passed">;
    summary: string;
  }>;
  executionPolicy?: OrchestrationExecutionPolicy;
  latestObservation?: string;
  publicSummary: string;
  selectedAction?: string;
  selectedActionLabel?: string;
  selectionSource?: OrchestrationSelectionSource;
  terminalClaimLevel?: OrchestrationClaimLevel;
  terminalKind?: OrchestrationTerminalKind;
};

export type OrchestrationCardProjection = {
  actionLabel?: string;
  attentionNeeded: boolean;
  executionMode?: OrchestrationExecutionMode;
  gateSummaries: string[];
  latestObservation?: string;
  policyLabel?: string;
  selectedAction?: string;
  terminalClaimLevel?: OrchestrationClaimLevel;
  terminalKind?: OrchestrationTerminalKind;
};

export type Orchestrator = {
  createGraph: (input: OrchestrationCreateInput) => Promise<OrchestrationGraph> | OrchestrationGraph;
  reduceObservation?: (
    graph: OrchestrationGraph,
    observation: OrchestrationObservation
  ) => Promise<OrchestrationGraph> | OrchestrationGraph;
};

export type DefaultOrchestratorOptions = {
  actions?: OrchestrationAction[] | ((input: OrchestrationCreateInput) => OrchestrationAction[]);
  gates?: OrchestrationGate[] | ((input: OrchestrationCreateInput, selectedAction?: OrchestrationAction) => OrchestrationGate[]);
  selectAction?: (input: OrchestrationCreateInput, actions: OrchestrationAction[]) => string | undefined;
};
