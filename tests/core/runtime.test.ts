import { describe, expect, it } from "vitest";
import {
  MockAgentAdapter,
  createMiniCodex,
  type AgentAdapter,
  type AgentAdapterRunInput,
  type AgentAdapterStep,
  type Capability
} from "../../src/core/index.js";
import { createDefaultOrchestrator } from "../../src/orchestration/index.js";

function fixedClock() {
  let count = 0;
  return () => {
    count += 1;
    return `2026-06-05T00:00:${String(count).padStart(2, "0")}.000Z`;
  };
}

describe("MiniCodexRuntime", () => {
  it("creates threads and emits visible events", () => {
    const runtime = createMiniCodex({ now: fixedClock() });
    const thread = runtime.createThread({ title: "Canvas work" });
    const snapshot = runtime.snapshot();

    expect(thread.title).toBe("Canvas work");
    expect(snapshot.threads).toHaveLength(1);
    expect(snapshot.events.map((event) => event.type)).toEqual(["thread.created"]);
  });

  it("collects registered host context during a run", async () => {
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter(),
      now: fixedClock(),
      contextProviders: [
        {
          name: "selection",
          description: "Current host selection",
          getContext: () => ({ selectedIds: ["shape_1"] })
        }
      ]
    });

    const run = await runtime.sendMessage({ content: "Summarize this" });
    const snapshot = runtime.snapshot();

    expect(run.status).toBe("completed");
    expect(snapshot.contexts).toHaveLength(1);
    expect(snapshot.contexts[0]?.providerName).toBe("selection");
    expect(snapshot.events.some((event) => event.type === "context.collected")).toBe(true);
  });

  it("rejects duplicate capability names", () => {
    const capability: Capability = {
      name: "host.echo",
      description: "Echo input",
      run: (input) => input
    };
    const runtime = createMiniCodex({ capabilities: [capability] });

    expect(() => runtime.registerCapability(capability)).toThrow("capability already registered");
  });

  it("executes a read capability without approval", async () => {
    const steps: AgentAdapterStep[] = [
      { type: "capability_request", capabilityName: "host.echo", input: { text: "hello" } },
      { type: "final", content: "Done" }
    ];
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({ steps }),
      now: fixedClock(),
      capabilities: [
        {
          name: "host.echo",
          description: "Echo input",
          effect: "read",
          approval: "never",
          run: (input) => input
        }
      ]
    });

    const run = await runtime.sendMessage({ content: "Echo this" });
    const snapshot = runtime.snapshot();

    expect(run.status).toBe("completed");
    expect(snapshot.approvals).toHaveLength(0);
    expect(snapshot.capabilityRequests[0]?.status).toBe("completed");
    expect(snapshot.capabilityRequests[0]?.output).toEqual({ text: "hello" });
    expect(snapshot.events.map((event) => event.type)).toContain("capability.completed");
  });

  it("persists generic agent timeline events from adapters", async () => {
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          {
            type: "event",
            eventType: "agent.item.completed",
            payload: {
              item: {
                id: "item_1",
                type: "reasoning",
                text: "Adapter-side reasoning summary"
              }
            }
          },
          { type: "final" }
        ]
      })
    });

    await runtime.sendMessage({ content: "Track adapter item" });
    const event = runtime.snapshot().events.find((entry) => entry.type === "agent.item.completed");

    expect(event?.payload).toEqual({
      item: {
        id: "item_1",
        type: "reasoning",
        text: "Adapter-side reasoning summary"
      }
    });
  });

  it("passes an orchestration summary into the agent adapter when configured", async () => {
    const receivedInputs: AgentAdapterRunInput[] = [];
    const agent: AgentAdapter = {
      async *run(input) {
        receivedInputs.push(input);
        yield { type: "final", content: "Inspected." };
      }
    };
    const runtime = createMiniCodex({
      agent,
      now: fixedClock(),
      orchestrator: createDefaultOrchestrator()
    });

    const run = await runtime.sendMessage({ content: "What is blocked?" });
    const snapshot = runtime.snapshot();

    expect(run.status).toBe("completed");
    expect(receivedInputs[0]?.orchestration?.selectedAction).toBe("answer");
    expect(snapshot.runs[0]?.orchestrationGraphId).toBe(snapshot.orchestrationGraphs?.[0]?.id);
    expect(snapshot.events.map((event) => event.type)).toContain("orchestration.created");
    expect(snapshot.events.map((event) => event.type)).toContain("orchestration.terminal");
  });

  it("pauses mutating capabilities for approval and executes after approval", async () => {
    const hostState: string[] = [];
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          { type: "capability_request", capabilityName: "canvas.create", input: { label: "Milestone" } }
        ]
      }),
      now: fixedClock(),
      capabilities: [
        {
          name: "canvas.create",
          description: "Create a canvas item",
          effect: "write",
          approval: "always",
          preview: () => ({
            title: "Create canvas item",
            changes: ["Add Milestone"]
          }),
          run: (input) => {
            const record = input as { label: string };
            hostState.push(record.label);
            return { created: record.label };
          }
        }
      ]
    });

    const run = await runtime.sendMessage({ content: "Create a milestone" });
    let snapshot = runtime.snapshot();

    expect(run.status).toBe("awaiting_approval");
    expect(hostState).toEqual([]);
    expect(snapshot.approvals).toHaveLength(1);
    expect(snapshot.approvals[0]?.preview?.title).toBe("Create canvas item");
    expect(snapshot.capabilityRequests[0]?.status).toBe("awaiting_approval");

    await runtime.approveApproval(snapshot.approvals[0]?.id ?? "");
    snapshot = runtime.snapshot();

    expect(hostState).toEqual(["Milestone"]);
    expect(snapshot.approvals[0]?.status).toBe("approved");
    expect(snapshot.capabilityRequests[0]?.status).toBe("completed");
    expect(snapshot.runs[0]?.status).toBe("completed");
    expect(snapshot.events.map((event) => event.type)).toEqual([
      "thread.created",
      "message.created",
      "run.started",
      "capability.requested",
      "approval.requested",
      "approval.approved",
      "capability.completed",
      "run.completed"
    ]);
  });

  it("records capability observations in an orchestration graph", async () => {
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          { type: "capability_request", capabilityName: "host.echo", input: { text: "hello" } },
          { type: "final", content: "Done" }
        ]
      }),
      capabilities: [
        {
          name: "host.echo",
          description: "Echo input",
          effect: "read",
          approval: "never",
          run: (input) => input
        }
      ],
      now: fixedClock(),
      orchestrator: createDefaultOrchestrator()
    });

    const run = await runtime.sendMessage({ content: "Create an echo record" });
    const graph = runtime.snapshot().orchestrationGraphs?.[0];

    expect(run.status).toBe("completed");
    expect(graph?.nodes.some((node) => node.family === "observation")).toBe(true);
    expect(graph?.terminal).toMatchObject({
      kind: "final"
    });
    expect(runtime.snapshot().events.map((event) => event.type)).toContain("orchestration.terminal");
  });

  it("rejects approval without mutating host state", async () => {
    const hostState: string[] = [];
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          { type: "capability_request", capabilityName: "canvas.delete", input: { id: "shape_1" } }
        ]
      }),
      now: fixedClock(),
      capabilities: [
        {
          name: "canvas.delete",
          description: "Delete a canvas item",
          effect: "write",
          approval: "always",
          run: (input) => {
            const record = input as { id: string };
            hostState.push(record.id);
            return { deleted: record.id };
          }
        }
      ]
    });

    await runtime.sendMessage({ content: "Delete it" });
    const approvalId = runtime.snapshot().approvals[0]?.id ?? "";
    await runtime.rejectApproval(approvalId);
    const snapshot = runtime.snapshot();

    expect(hostState).toEqual([]);
    expect(snapshot.approvals[0]?.status).toBe("rejected");
    expect(snapshot.capabilityRequests[0]?.status).toBe("rejected");
    expect(snapshot.runs[0]?.status).toBe("failed");
    expect(snapshot.events.map((event) => event.type)).toContain("approval.rejected");
    expect(snapshot.events.map((event) => event.type)).toContain("run.failed");
  });

  it("keeps a run failed when a capability throws", async () => {
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          { type: "capability_request", capabilityName: "host.fail", input: { ok: false } }
        ]
      }),
      capabilities: [
        {
          name: "host.fail",
          description: "Fail",
          approval: "never",
          run: () => {
            throw new Error("Nope");
          }
        }
      ]
    });

    const run = await runtime.sendMessage({ content: "Fail this" });
    const snapshot = runtime.snapshot();

    expect(run.status).toBe("failed");
    expect(snapshot.runs[0]?.status).toBe("failed");
    expect(snapshot.events.map((event) => event.type)).toContain("capability.failed");
    expect(snapshot.events.map((event) => event.type)).toContain("run.failed");
    expect(snapshot.events.map((event) => event.type)).not.toContain("run.completed");
  });
});
