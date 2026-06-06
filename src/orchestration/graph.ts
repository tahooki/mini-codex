import type {
  DefaultOrchestratorOptions,
  OrchestrationAction,
  OrchestrationCardProjection,
  OrchestrationCreateInput,
  OrchestrationExecutionPolicy,
  OrchestrationGate,
  OrchestrationGraph,
  OrchestrationGraphEvent,
  OrchestrationGraphSummary,
  OrchestrationInputSnapshot,
  OrchestrationNode,
  OrchestrationObservation,
  OrchestrationTerminalState,
  Orchestrator
} from "./types.js";

const MUTATION_RE = /(add|apply|build|change|clean|create|delete|fix|move|plan|remove|save|update|write|고쳐|계획|만들|바꿔|삭제|수정|옮|이동|저장|추가)/i;
const QUESTION_RE = /(\?|advice|explain|how|inspect|review|summarize|what|why|검토|무엇|뭐|설명|어떻게|왜|조언)/i;
const STALE_RE = /(stale|outdated|conflict|refresh|충돌|오래된|최신|새로고침)/i;
const MISSING_EVIDENCE_RE = /(missing .*evidence|evidence .*missing|no evidence|needs evidence|without evidence|근거 부족|근거 없음|검증 없음|증거 부족|증거 없음)/i;

export const DEFAULT_ORCHESTRATION_ACTIONS: OrchestrationAction[] = [
  {
    name: "answer",
    label: "Answer",
    description: "Answer without mutating host state.",
    executionBoundary: "answer"
  },
  {
    name: "ask-clarifying-question",
    label: "Ask clarification",
    description: "Ask the user for missing information before continuing.",
    executionBoundary: "answer"
  },
  {
    name: "inspect-context",
    label: "Inspect context",
    description: "Use host context to explain current state.",
    executionBoundary: "answer"
  },
  {
    name: "propose-host-change",
    label: "Propose host change",
    description: "Prepare a host-owned change through capabilities.",
    executionBoundary: "capability",
    requiresApproval: true
  },
  {
    name: "run-capability",
    label: "Run capability",
    description: "Call a registered host capability.",
    executionBoundary: "capability",
    requiresApproval: true
  },
  {
    name: "repair-after-failure",
    label: "Repair after failure",
    description: "Repair or retry after failed evidence.",
    executionBoundary: "repair",
    requiresApproval: true
  }
];

export function createDefaultOrchestrator(options: DefaultOrchestratorOptions = {}): Orchestrator {
  return {
    createGraph: (input) => {
      const configuredActions = typeof options.actions === "function" ? options.actions(input) : options.actions;
      const actions = resolveActions(input, configuredActions);
      const configuredGates = typeof options.gates === "function" ? undefined : options.gates;
      const selectedAction = options.selectAction?.(input, actions);
      const gateBuilder = typeof options.gates === "function" ? options.gates : undefined;
      return createOrchestrationGraph({
        ...input,
        actions,
        ...(configuredGates ? { gates: configuredGates } : {}),
        ...(selectedAction ? { selectedAction, selectionSource: "host" } : {})
      }, gateBuilder ? { gateBuilder } : {});
    },
    reduceObservation: (graph, observation) => reduceOrchestrationGraph(graph, {
      observation,
      type: "observation_recorded"
    })
  };
}

export function createOrchestrationGraph(
  input: OrchestrationCreateInput,
  options: {
    gateBuilder?: (input: OrchestrationCreateInput, selectedAction?: OrchestrationAction) => OrchestrationGate[];
  } = {},
): OrchestrationGraph {
  const ids = scopedIds(input.ids);
  const createdAt = input.now?.() ?? new Date().toISOString();
  const graphId = ids("orchestration_graph");
  const snapshot = createOrchestrationInput(input);
  const actions = resolveActions(input, input.actions);
  const selectedActionName = input.selectedAction ?? defaultActionForInput(input, actions);
  const selectedAction = actions.find((action) => action.name === selectedActionName) ?? actions[0];
  const gates = input.gates ?? options.gateBuilder?.(input, selectedAction) ?? defaultGatesFor(input, selectedAction, actions);
  const policy = compileOrchestrationExecutionPolicy(selectedAction, gates);

  const inputNode: OrchestrationNode = {
    createdAt,
    family: "input",
    id: ids("orchestration_node"),
    summary: snapshot.userMessage ? "User input captured for orchestration." : "Empty user input captured for orchestration."
  };
  const actionNode: OrchestrationNode = {
    actions,
    createdAt,
    family: "action-set",
    id: ids("orchestration_node"),
    summary: `${actions.length} orchestration actions registered.`
  };
  const selectionNode: OrchestrationNode = {
    createdAt,
    family: "selection",
    id: ids("orchestration_node"),
    selectionSource: input.selectionSource ?? "default",
    summary: selectedAction ? `Selected ${selectedAction.label}.` : "No orchestration action selected.",
    ...(selectedAction ? { selectedAction: selectedAction.name } : {})
  };
  const gateNode: OrchestrationNode = {
    createdAt,
    family: "gate",
    gates,
    id: ids("orchestration_node"),
    summary: summarizeGateSet(gates)
  };
  const policyNode: OrchestrationNode = {
    createdAt,
    executionPolicy: policy,
    family: "policy",
    id: ids("orchestration_node"),
    summary: `Execution policy prepared as ${policy.mode}.`,
    ...(selectedAction ? { selectedAction: selectedAction.name } : {})
  };
  const nodes = [inputNode, actionNode, selectionNode, gateNode, policyNode];

  return {
    activeNodeId: policyNode.id,
    createdAt,
    edges: [
      edge(ids, inputNode.id, actionNode.id, "input produced available actions", createdAt),
      edge(ids, actionNode.id, selectionNode.id, "default or host action selected", createdAt),
      edge(ids, selectionNode.id, gateNode.id, "selected action gates evaluated", createdAt),
      edge(ids, gateNode.id, policyNode.id, "gates compiled into execution policy", createdAt)
    ],
    id: graphId,
    input: snapshot,
    nodes,
    schema: "mini-codex-orchestration-graph-v1",
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    updatedAt: createdAt
  };
}

export function createOrchestrationInput(input: OrchestrationCreateInput): OrchestrationInputSnapshot {
  const contextSummary = input.contextSummary ?? summarizeContexts(input.contexts ?? []);
  const selectedContext = input.selectedContext ?? (input.contexts ? input.contexts.length > 0 : undefined);

  return {
    attachmentsCount: input.attachmentsCount ?? 0,
    ...(contextSummary ? { contextSummary } : {}),
    ...(input.hostState ? { hostState: input.hostState } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(selectedContext !== undefined ? { selectedContext } : {}),
    userMessage: input.userMessage
  };
}

export function createOrchestrationObservation(input: {
  kind: OrchestrationObservation["kind"];
  status: OrchestrationObservation["status"];
  summary: string;
  evidenceRefs?: string[];
  id?: string;
  ids?: OrchestrationCreateInput["ids"];
}): OrchestrationObservation {
  const ids = scopedIds(input.ids);
  return {
    evidenceRefs: input.evidenceRefs ?? [],
    id: input.id ?? ids("orchestration_observation"),
    kind: input.kind,
    status: input.status,
    summary: input.summary
  };
}

export function reduceOrchestrationGraph(
  graph: OrchestrationGraph,
  event: OrchestrationGraphEvent,
): OrchestrationGraph {
  const ids = scopedIds(event.ids);
  const at = event.now?.() ?? new Date().toISOString();

  if (event.type === "action_selected") {
    return appendSelectedAction(graph, event.actionName, {
      at,
      ids,
      ...(event.gates ? { gates: event.gates } : {}),
      selectionSource: event.selectionSource ?? "model",
      ...(event.summary ? { summary: event.summary } : {})
    });
  }
  if (event.type === "gates_evaluated") {
    return appendNode(graph, {
      createdAt: at,
      family: "gate",
      gates: event.gates,
      id: ids("orchestration_node"),
      summary: event.summary ?? summarizeGateSet(event.gates)
    }, "gates evaluated", at, ids);
  }
  if (event.type === "observation_recorded") {
    return appendObservation(graph, event.observation, at, ids);
  }

  const next = appendNode(graph, {
    createdAt: at,
    family: "terminal",
    id: ids("orchestration_node"),
    summary: event.terminal.reason,
    terminal: event.terminal
  }, "terminal selected", at, ids);

  return {
    ...next,
    terminal: event.terminal
  };
}

export function summarizeOrchestrationGraph(graph: OrchestrationGraph): OrchestrationGraphSummary {
  const actions = lastNode(graph, "action-set")?.actions ?? [];
  const selection = lastSelectedNode(graph);
  const gateNode = lastNode(graph, "gate");
  const policy = lastNode(graph, "policy")?.executionPolicy;
  const observation = lastNode(graph, "observation")?.observation;
  const selectedAction = selection?.selectedAction;
  const selectedActionLabel = actions.find((action) => action.name === selectedAction)?.label;
  const blockedGates = (gateNode?.gates ?? [])
    .filter((gate) => gate.status !== "passed")
    .slice(0, 8)
    .map((gate) => ({
      name: gate.name,
      status: gate.status as Exclude<typeof gate.status, "passed">,
      summary: compactLine(gate.summary, 160)
    }));

  return {
    availableActions: actions.map((action) => action.name),
    blockedGates,
    ...(policy ? { executionPolicy: policy } : {}),
    graphId: graph.id,
    ...(observation?.summary ? { latestObservation: compactLine(observation.summary, 160) } : {}),
    publicSummary: publicSummaryFor({
      blockedGates,
      graph,
      ...(policy ? { policy } : {}),
      ...(selectedAction ? { selectedAction } : {}),
      ...(selectedActionLabel ? { selectedActionLabel } : {})
    }),
    ...(selectedAction ? { selectedAction } : {}),
    ...(selectedActionLabel ? { selectedActionLabel } : {}),
    ...(selection?.selectionSource ? { selectionSource: selection.selectionSource } : {}),
    ...(graph.terminal?.claimLevel ? { terminalClaimLevel: graph.terminal.claimLevel } : {}),
    ...(graph.terminal?.kind ? { terminalKind: graph.terminal.kind } : {})
  };
}

export function projectOrchestrationCard(graphOrSummary?: OrchestrationGraph | OrchestrationGraphSummary | null): OrchestrationCardProjection | null {
  if (!graphOrSummary) {
    return null;
  }
  const summary = isGraph(graphOrSummary) ? summarizeOrchestrationGraph(graphOrSummary) : graphOrSummary;
  const policy = summary.executionPolicy;
  return {
    actionLabel: summary.selectedActionLabel ?? summary.selectedAction ?? summary.publicSummary,
    attentionNeeded: policy?.attention === "needs-user",
    ...(policy?.mode ? { executionMode: policy.mode } : {}),
    gateSummaries: summary.blockedGates.map((gate) => compactLine(gate.summary, 140)).slice(0, 4),
    ...(summary.latestObservation ? { latestObservation: summary.latestObservation } : {}),
    ...(policy ? { policyLabel: `${policy.mode} | ${policy.approval}` } : {}),
    ...(summary.selectedAction ? { selectedAction: summary.selectedAction } : {}),
    ...(summary.terminalClaimLevel ? { terminalClaimLevel: summary.terminalClaimLevel } : {}),
    ...(summary.terminalKind ? { terminalKind: summary.terminalKind } : {})
  };
}

export function compileOrchestrationExecutionPolicy(
  action: OrchestrationAction | undefined,
  gates: OrchestrationGate[],
): OrchestrationExecutionPolicy {
  const affected = action ? gates.filter((gate) => gate.affectedActions.includes(action.name)) : gates;
  const blocked = affected.some((gate) => gate.status === "blocked");
  const needsUser = affected.some((gate) => gate.status === "needs-user");

  if (blocked || needsUser) {
    return { approval: "manual", attention: "needs-user", mode: "blocked" };
  }
  if (!action) {
    return { approval: "manual", attention: "needs-user", mode: "ask-user" };
  }

  const approval = action.requiresApproval ? "capability" : "none";
  switch (action.executionBoundary) {
    case "answer":
      return { approval: "none", attention: "silent", mode: action.name === "ask-clarifying-question" ? "ask-user" : "answer" };
    case "current-host":
      return { approval, attention: "silent", mode: "current-host" };
    case "capability":
      return { approval, attention: "silent", mode: "capability" };
    case "child-work":
      return { approval, attention: "indicator", mode: "child-work" };
    case "merge":
      return { approval: action.requiresApproval ? "manual" : "none", attention: "needs-user", mode: "merge" };
    case "repair":
      return { approval, attention: "indicator", mode: "repair" };
  }
}

export function selectOrchestrationTerminalState(input: {
  graph: OrchestrationGraph;
  kind?: OrchestrationTerminalState["kind"];
  reason?: string;
  evidenceRefs?: string[];
}): OrchestrationTerminalState {
  const summary = summarizeOrchestrationGraph(input.graph);
  const kind = input.kind ?? "final";
  const evidenceRefs = input.evidenceRefs ?? [];
  const sourceLike = summary.executionPolicy
    ? ["capability", "current-host", "child-work", "merge", "repair"].includes(summary.executionPolicy.mode)
    : false;
  const claimLevel: OrchestrationTerminalState["claimLevel"] =
    kind === "blocked" || kind === "needs-user"
      ? "decision-only"
      : kind === "failed" || kind === "cancelled" || kind === "partial"
        ? "partial-evidence"
        : sourceLike && evidenceRefs.length === 0
          ? "partial-evidence"
          : "complete-for-scope";

  return {
    claimLevel,
    evidenceRefs,
    kind,
    reason: input.reason ?? terminalReason(kind, claimLevel)
  };
}

function appendSelectedAction(
  graph: OrchestrationGraph,
  actionName: string,
  input: {
    at: string;
    gates?: OrchestrationGate[];
    ids: ReturnType<typeof scopedIds>;
    selectionSource: OrchestrationNode["selectionSource"];
    summary?: string;
  },
): OrchestrationGraph {
  const actions = lastNode(graph, "action-set")?.actions ?? [];
  const action = actions.find((candidate) => candidate.name === actionName);
  if (!action) {
    const terminal: OrchestrationTerminalState = {
      claimLevel: "decision-only",
      evidenceRefs: [],
      kind: "needs-user",
      reason: `Selected action is not available: ${actionName}`
    };
    return reduceOrchestrationGraph(graph, {
      ids: input.ids,
      now: () => input.at,
      terminal,
      type: "terminal_selected"
    });
  }

  const selectedGraph = appendNode(graph, {
    createdAt: input.at,
    family: "selection",
    id: input.ids("orchestration_node"),
    selectedAction: action.name,
    summary: input.summary ?? `Selected ${action.label}.`,
    ...(input.selectionSource ? { selectionSource: input.selectionSource } : {})
  }, "action selected", input.at, input.ids);
  const gates = input.gates ?? defaultGatesFor(createInputFromGraph(selectedGraph), action, actions);
  const gatedGraph = appendNode(selectedGraph, {
    createdAt: input.at,
    family: "gate",
    gates,
    id: input.ids("orchestration_node"),
    summary: summarizeGateSet(gates)
  }, "selected action gates evaluated", input.at, input.ids);
  const policy = compileOrchestrationExecutionPolicy(action, gates);

  return appendNode(gatedGraph, {
    createdAt: input.at,
    executionPolicy: policy,
    family: "policy",
    id: input.ids("orchestration_node"),
    selectedAction: action.name,
    summary: `Execution policy prepared as ${policy.mode}.`
  }, "selected action compiled into execution policy", input.at, input.ids);
}

function appendObservation(
  graph: OrchestrationGraph,
  observation: OrchestrationObservation,
  at: string,
  ids: ReturnType<typeof scopedIds>,
): OrchestrationGraph {
  const observed = appendNode(graph, {
    createdAt: at,
    family: "observation",
    id: ids("orchestration_node"),
    observation,
    summary: observation.summary
  }, "observation recorded", at, ids);

  if (observation.status === "cancelled" || observation.kind === "user-interrupt") {
    return reduceOrchestrationGraph(observed, {
      ids,
      now: () => at,
      terminal: {
        claimLevel: "partial-evidence",
        evidenceRefs: observation.evidenceRefs,
        kind: "cancelled",
        reason: observation.summary || "User interrupted the run."
      },
      type: "terminal_selected"
    });
  }
  if (observation.status === "blocked" || STALE_RE.test(observation.summary)) {
    return reduceOrchestrationGraph(observed, {
      ids,
      now: () => at,
      terminal: {
        claimLevel: "decision-only",
        evidenceRefs: observation.evidenceRefs,
        kind: "needs-user",
        reason: observation.summary || "Host state requires user attention."
      },
      type: "terminal_selected"
    });
  }
  if (observation.status === "failed") {
    const repair = (lastNode(observed, "action-set")?.actions ?? []).find((action) => action.executionBoundary === "repair");
    if (repair) {
      return appendSelectedAction(observed, repair.name, {
        at,
        ids,
        selectionSource: "observation",
        summary: observation.summary || "Failed observation selected repair."
      });
    }
    return reduceOrchestrationGraph(observed, {
      ids,
      now: () => at,
      terminal: {
        claimLevel: "partial-evidence",
        evidenceRefs: observation.evidenceRefs,
        kind: "failed",
        reason: observation.summary || "Observation failed."
      },
      type: "terminal_selected"
    });
  }
  if (MISSING_EVIDENCE_RE.test(observation.summary)) {
    return reduceOrchestrationGraph(observed, {
      ids,
      now: () => at,
      terminal: selectOrchestrationTerminalState({
        evidenceRefs: observation.evidenceRefs,
        graph: observed,
        kind: "partial",
        reason: observation.summary
      }),
      type: "terminal_selected"
    });
  }
  if (observation.status === "passed" && (observation.kind === "host-apply-result" || observation.kind === "capability-result")) {
    return reduceOrchestrationGraph(observed, {
      ids,
      now: () => at,
      terminal: selectOrchestrationTerminalState({
        evidenceRefs: observation.evidenceRefs,
        graph: observed,
        kind: "final",
        reason: observation.summary || "Host evidence passed."
      }),
      type: "terminal_selected"
    });
  }
  return observed;
}

function appendNode(
  graph: OrchestrationGraph,
  node: OrchestrationNode,
  reason: string,
  at: string,
  ids: ReturnType<typeof scopedIds>,
): OrchestrationGraph {
  const fromNodeId = graph.activeNodeId ?? graph.nodes[graph.nodes.length - 1]?.id;
  return {
    ...graph,
    activeNodeId: node.id,
    edges: fromNodeId
      ? [...graph.edges, edge(ids, fromNodeId, node.id, reason, at)]
      : graph.edges,
    nodes: [...graph.nodes, node],
    updatedAt: at
  };
}

function edge(
  ids: ReturnType<typeof scopedIds>,
  fromNodeId: string,
  toNodeId: string,
  reason: string,
  createdAt: string,
) {
  return {
    createdAt,
    fromNodeId,
    id: ids("orchestration_edge"),
    reason,
    toNodeId
  };
}

function defaultActionForInput(input: OrchestrationCreateInput, actions: OrchestrationAction[]): string | undefined {
  const message = input.userMessage.trim();
  const mutationLike = MUTATION_RE.test(message);
  const questionLike = QUESTION_RE.test(message);

  if (!message) {
    return actions.find((action) => action.name === "ask-clarifying-question")?.name ?? actions[0]?.name;
  }
  if (questionLike && !mutationLike) {
    return actions.find((action) => action.name === "answer")?.name ?? actions[0]?.name;
  }
  if (/inspect|review|summarize|검토|요약|살펴/i.test(message)) {
    return actions.find((action) => action.name === "inspect-context")?.name ?? actions[0]?.name;
  }
  if (mutationLike) {
    return actions.find((action) => action.name === "propose-host-change")?.name
      ?? actions.find((action) => action.executionBoundary === "capability")?.name
      ?? actions[0]?.name;
  }
  return actions.find((action) => action.name === "ask-clarifying-question")?.name ?? actions[0]?.name;
}

function defaultGatesFor(
  input: OrchestrationCreateInput,
  selectedAction: OrchestrationAction | undefined,
  actions: OrchestrationAction[],
): OrchestrationGate[] {
  const mutationActions = actions.filter((action) => action.executionBoundary !== "answer").map((action) => action.name);
  const selected = selectedAction ? [selectedAction.name] : mutationActions;
  const questionOnly = QUESTION_RE.test(input.userMessage) && !MUTATION_RE.test(input.userMessage);
  const stale = input.hostState === "stale";
  const dirty = input.hostState === "dirty";
  const needsContext = selectedAction?.executionBoundary === "current-host" && input.selectedContext === false;

  return [
    {
      affectedActions: mutationActions,
      name: "intent-boundary",
      status: questionOnly ? "blocked" : "passed",
      summary: questionOnly ? "Request reads as answer-only; mutating actions are blocked." : "Intent permits the selected action."
    },
    {
      affectedActions: mutationActions,
      name: "host-state-boundary",
      status: stale ? "blocked" : dirty ? "warning" : "passed",
      summary: stale
        ? "Host state is stale and must be refreshed before mutation."
        : dirty
          ? "Host state has unsaved changes; mutation should stay behind host approval."
          : "Host state is clear."
    },
    {
      affectedActions: selected,
      name: "approval-boundary",
      status: selectedAction?.requiresApproval ? "warning" : "passed",
      summary: selectedAction?.requiresApproval
        ? "Selected action must still pass capability approval."
        : "Selected action does not request approval by orchestration."
    },
    {
      affectedActions: selected,
      name: "context-boundary",
      status: needsContext ? "needs-user" : "passed",
      summary: needsContext ? "Selected action needs host selection context." : "Required context is available or not needed."
    },
    {
      affectedActions: actions.map((action) => action.name),
      name: "display-safety-boundary",
      status: "passed",
      summary: "Graph projection must stay display-safe."
    },
    {
      affectedActions: mutationActions,
      name: "evidence-boundary",
      status: selectedAction && selectedAction.executionBoundary !== "answer" ? "warning" : "passed",
      summary: selectedAction && selectedAction.executionBoundary !== "answer"
        ? "Final claims must be limited to observed capability or host evidence."
        : "No mutation evidence is required for answer-only work."
    }
  ];
}

function resolveActions(
  input: OrchestrationCreateInput,
  actions?: OrchestrationAction[] | ((input: OrchestrationCreateInput) => OrchestrationAction[]),
): OrchestrationAction[] {
  if (typeof actions === "function") {
    return normalizeActions(actions(input));
  }
  return normalizeActions(actions ?? input.actions ?? DEFAULT_ORCHESTRATION_ACTIONS);
}

function normalizeActions(actions: OrchestrationAction[]): OrchestrationAction[] {
  return actions.length > 0 ? actions : DEFAULT_ORCHESTRATION_ACTIONS;
}

function createInputFromGraph(graph: OrchestrationGraph): OrchestrationCreateInput {
  return {
    attachmentsCount: graph.input.attachmentsCount,
    ...(graph.input.contextSummary ? { contextSummary: graph.input.contextSummary } : {}),
    ...(graph.input.hostState ? { hostState: graph.input.hostState } : {}),
    ...(graph.input.metadata ? { metadata: graph.input.metadata } : {}),
    ...(graph.runId ? { runId: graph.runId } : {}),
    ...(graph.input.selectedContext !== undefined ? { selectedContext: graph.input.selectedContext } : {}),
    ...(graph.threadId ? { threadId: graph.threadId } : {}),
    userMessage: graph.input.userMessage
  };
}

function summarizeContexts(contexts: OrchestrationCreateInput["contexts"]): string | undefined {
  if (!contexts || contexts.length === 0) {
    return undefined;
  }
  return contexts
    .map((context) => `${context.providerName}: ${compactLine(JSON.stringify(context.value), 80)}`)
    .join("; ")
    .slice(0, 360);
}

function summarizeGateSet(gates: OrchestrationGate[]): string {
  const blocked = gates.filter((gate) => gate.status !== "passed");
  if (blocked.length === 0) {
    return "All orchestration gates passed.";
  }
  return blocked.map((gate) => `${gate.name}: ${gate.status}`).join("; ");
}

function publicSummaryFor(input: {
  blockedGates: OrchestrationGraphSummary["blockedGates"];
  graph: OrchestrationGraph;
  policy?: OrchestrationExecutionPolicy;
  selectedAction?: string;
  selectedActionLabel?: string;
}) {
  const action = input.selectedActionLabel ?? input.selectedAction ?? "none";
  const gateCopy = input.blockedGates.length > 0
    ? ` Gates: ${input.blockedGates.map((gate) => `${gate.name} ${gate.status}`).join(", ")}.`
    : "";
  const terminal = input.graph.terminal ? ` Terminal: ${input.graph.terminal.kind}.` : "";
  return compactLine(`Decision prepared ${action} with ${input.policy?.mode ?? "no"} execution.${gateCopy}${terminal}`, 220);
}

function terminalReason(kind: OrchestrationTerminalState["kind"], claimLevel: OrchestrationTerminalState["claimLevel"]) {
  if (kind === "final" && claimLevel !== "complete-for-scope") {
    return "Final response is limited because complete evidence is not available.";
  }
  if (kind === "blocked" || kind === "needs-user") {
    return "The run needs user or host attention before it can continue.";
  }
  if (kind === "failed") {
    return "The run ended with failed evidence.";
  }
  if (kind === "cancelled") {
    return "The run was cancelled before complete evidence was gathered.";
  }
  return "The run gathered enough evidence for the selected terminal claim.";
}

function lastNode(graph: OrchestrationGraph, family: OrchestrationNode["family"]): OrchestrationNode | undefined {
  return graph.nodes.slice().reverse().find((node) => node.family === family);
}

function lastSelectedNode(graph: OrchestrationGraph): OrchestrationNode | undefined {
  return graph.nodes.slice().reverse().find((node) => Boolean(node.selectedAction && node.selectionSource))
    ?? graph.nodes.slice().reverse().find((node) => Boolean(node.selectedAction));
}

function isGraph(value: OrchestrationGraph | OrchestrationGraphSummary): value is OrchestrationGraph {
  return "schema" in value && value.schema === "mini-codex-orchestration-graph-v1";
}

function compactLine(value: string, max = 160) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > max ? `${compacted.slice(0, max - 1)}...` : compacted;
}

function scopedIds(ids?: OrchestrationCreateInput["ids"]) {
  if (ids) {
    return ids;
  }
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}
