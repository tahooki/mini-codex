import { describe, expect, it } from "vitest";
import {
  createDefaultOrchestrator,
  createOrchestrationGraph,
  createOrchestrationObservation,
  projectOrchestrationCard,
  reduceOrchestrationGraph,
  summarizeOrchestrationGraph
} from "../../src/orchestration/index.js";

function fixedIds() {
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}

function fixedClock() {
  let count = 0;
  return () => {
    count += 1;
    return `2026-06-06T00:00:${String(count).padStart(2, "0")}.000Z`;
  };
}

describe("orchestration graph", () => {
  it("creates a display-safe graph with default actions and gates", () => {
    const graph = createOrchestrationGraph({
      ids: fixedIds(),
      now: fixedClock(),
      selectedContext: true,
      userMessage: "Create a task card for release notes"
    });
    const summary = summarizeOrchestrationGraph(graph);

    expect(graph.schema).toBe("mini-codex-orchestration-graph-v1");
    expect(graph.nodes.map((node) => node.family)).toEqual(["input", "action-set", "selection", "gate", "policy"]);
    expect(summary.selectedAction).toBe("propose-host-change");
    expect(summary.executionPolicy).toMatchObject({ approval: "capability", mode: "capability" });
    expect(JSON.stringify(summary)).not.toContain("chain-of-thought");
  });

  it("keeps question-only requests out of mutating execution", () => {
    const graph = createOrchestrationGraph({
      ids: fixedIds(),
      now: fixedClock(),
      userMessage: "What is blocked?"
    });
    const selected = reduceOrchestrationGraph(graph, {
      actionName: "propose-host-change",
      ids: fixedIds(),
      now: fixedClock(),
      type: "action_selected"
    });
    const summary = summarizeOrchestrationGraph(selected);

    expect(summary.selectedAction).toBe("propose-host-change");
    expect(summary.executionPolicy).toMatchObject({ attention: "needs-user", mode: "blocked" });
    expect(summary.blockedGates.map((gate) => gate.name)).toContain("intent-boundary");
  });

  it("records failed observations as repair selection when repair is available", () => {
    const graph = createOrchestrationGraph({
      ids: fixedIds(),
      now: fixedClock(),
      userMessage: "Fix the failed workspace action"
    });
    const observed = reduceOrchestrationGraph(graph, {
      ids: fixedIds(),
      now: fixedClock(),
      observation: createOrchestrationObservation({
        id: "observation:failed",
        kind: "capability-result",
        status: "failed",
        summary: "Capability failed while applying the host change.",
        evidenceRefs: ["capability:todo.moveCard"]
      }),
      type: "observation_recorded"
    });
    const summary = summarizeOrchestrationGraph(observed);

    expect(summary.selectedAction).toBe("repair-after-failure");
    expect(summary.selectionSource).toBe("observation");
    expect(summary.executionPolicy?.mode).toBe("repair");
  });

  it("turns passed host evidence into a terminal final claim", () => {
    const graph = createOrchestrationGraph({
      ids: fixedIds(),
      now: fixedClock(),
      userMessage: "Move the selected card to review"
    });
    const observed = reduceOrchestrationGraph(graph, {
      ids: fixedIds(),
      now: fixedClock(),
      observation: createOrchestrationObservation({
        id: "observation:host",
        kind: "host-apply-result",
        status: "passed",
        summary: "Host accepted the proposed task-board change.",
        evidenceRefs: ["host:todo-board"]
      }),
      type: "observation_recorded"
    });
    const projection = projectOrchestrationCard(observed);

    expect(observed.terminal).toMatchObject({
      claimLevel: "complete-for-scope",
      kind: "final"
    });
    expect(projection).toMatchObject({
      terminalClaimLevel: "complete-for-scope",
      terminalKind: "final"
    });
  });

  it("lets host apps provide custom actions and gates", async () => {
    const orchestrator = createDefaultOrchestrator({
      actions: [{
        description: "Move selected board card.",
        executionBoundary: "current-host",
        label: "Move selected card",
        name: "board.move-selected",
        requiresApproval: true
      }],
      gates: (_input, action) => [{
        affectedActions: action ? [action.name] : [],
        name: "selection-boundary",
        status: "needs-user",
        summary: "No card is selected."
      }]
    });

    const graph = await orchestrator.createGraph({
      ids: fixedIds(),
      now: fixedClock(),
      selectedContext: false,
      userMessage: "Move selected card"
    });
    const summary = summarizeOrchestrationGraph(graph);

    expect(summary.selectedAction).toBe("board.move-selected");
    expect(summary.executionPolicy?.mode).toBe("blocked");
    expect(summary.blockedGates[0]?.name).toBe("selection-boundary");
  });

  it("marks host-selected actions with a host selection source", async () => {
    const orchestrator = createDefaultOrchestrator({
      selectAction: () => "inspect-context"
    });
    const graph = await orchestrator.createGraph({
      ids: fixedIds(),
      now: fixedClock(),
      userMessage: "Please inspect the current board"
    });
    const summary = summarizeOrchestrationGraph(graph);

    expect(summary.selectedAction).toBe("inspect-context");
    expect(summary.selectionSource).toBe("host");
  });
});
