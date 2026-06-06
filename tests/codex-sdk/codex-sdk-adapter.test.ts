import { describe, expect, it } from "vitest";
import {
  createMiniCodex,
  type Capability,
  type JsonObject
} from "../../src/core/index.js";
import {
  CodexSdkAgentAdapter,
  createDefaultCodexInput,
  type CodexSdkClientLike,
  type CodexSdkThreadLike
} from "../../src/codex-sdk/index.js";
import type { Input, ThreadEvent, TurnOptions } from "@openai/codex-sdk";

type TurnLike = Awaited<ReturnType<CodexSdkThreadLike["run"]>>;

function streamedThread(events: ThreadEvent[]): CodexSdkThreadLike {
  return {
    id: "codex-thread-1",
    run: async () => ({
      finalResponse: "",
      items: [],
      usage: null
    }),
    runStreamed: async () => ({
      events: (async function* () {
        for (const event of events) {
          yield event;
        }
      })()
    })
  };
}

function nonStreamedThread(turn: TurnLike, inputs: Input[], options: Array<TurnOptions | undefined>): CodexSdkThreadLike {
  return {
    id: "codex-thread-2",
    run: async (input, turnOptions) => {
      inputs.push(input);
      options.push(turnOptions);
      return turn;
    },
    runStreamed: async () => ({
      events: (async function* () {})()
    })
  };
}

function clientFor(thread: CodexSdkThreadLike): CodexSdkClientLike {
  return {
    resumeThread: () => thread,
    startThread: () => thread
  };
}

describe("CodexSdkAgentAdapter", () => {
  it("maps streamed Codex events into Mini Codex timeline events and messages", async () => {
    const adapter = new CodexSdkAgentAdapter({
      codex: clientFor(streamedThread([
        { type: "thread.started", thread_id: "external-thread" },
        { type: "turn.started" },
        {
          type: "item.started",
          item: {
            id: "reasoning-1",
            type: "reasoning",
            text: "Inspecting the request"
          }
        },
        {
          type: "item.completed",
          item: {
            id: "message-1",
            type: "agent_message",
            text: "I found the issue."
          }
        },
        {
          type: "turn.completed",
          usage: {
            cached_input_tokens: 0,
            input_tokens: 10,
            output_tokens: 5,
            reasoning_output_tokens: 2
          }
        }
      ]))
    });
    const runtime = createMiniCodex({ agent: adapter });

    const run = await runtime.sendMessage({ content: "Diagnose CI" });
    const snapshot = runtime.snapshot();

    expect(run.status).toBe("completed");
    expect(snapshot.messages.some((message) => message.content === "I found the issue.")).toBe(true);
    expect(snapshot.events.map((event) => event.type)).toContain("agent.thread.started");
    expect(snapshot.events.map((event) => event.type)).toContain("agent.item.started");
    expect(snapshot.events.map((event) => event.type)).toContain("agent.item.completed");
    expect(snapshot.events.map((event) => event.type)).toContain("agent.turn.completed");
    expect(snapshot.events.find((event) => event.type === "agent.thread.started")?.payload).toEqual({
      externalThreadId: "external-thread"
    });
  });

  it("lets hosts bridge Codex SDK items to Mini Codex capabilities", async () => {
    const hostChanges: string[] = [];
    const capability: Capability = {
      name: "host.reviewPatch",
      description: "Review a file change before applying host-side state",
      effect: "write",
      approval: "always",
      preview: (input) => ({
        title: "Review Codex file change",
        data: input
      }),
      run: (input) => {
        const record = input as JsonObject;
        hostChanges.push(String(record.path));
        return { ok: true };
      }
    };
    const adapter = new CodexSdkAgentAdapter({
      codex: clientFor(streamedThread([
        {
          type: "item.completed",
          item: {
            id: "patch-1",
            type: "file_change",
            status: "completed",
            changes: [{ kind: "update", path: "src/app.ts" }]
          }
        },
        {
          type: "turn.completed",
          usage: {
            cached_input_tokens: 0,
            input_tokens: 1,
            output_tokens: 1,
            reasoning_output_tokens: 0
          }
        }
      ])),
      capabilityMapper: (event) => {
        if (event.type !== "item.completed" || event.item.type !== "file_change") {
          return null;
        }
        return {
          type: "capability_request",
          capabilityName: "host.reviewPatch",
          input: {
            path: event.item.changes[0]?.path ?? "",
            status: event.item.status
          }
        };
      }
    });
    const runtime = createMiniCodex({
      agent: adapter,
      capabilities: [capability]
    });

    const run = await runtime.sendMessage({ content: "Patch the app" });
    const approvalId = runtime.snapshot().approvals[0]?.id ?? "";

    expect(run.status).toBe("awaiting_approval");
    expect(hostChanges).toEqual([]);
    expect(runtime.snapshot().capabilityRequests[0]?.capabilityName).toBe("host.reviewPatch");

    await runtime.approveApproval(approvalId);

    expect(hostChanges).toEqual(["src/app.ts"]);
    expect(runtime.snapshot().runs[0]?.status).toBe("completed");
  });

  it("builds default Codex input with host context and capability summaries", () => {
    const input = createDefaultCodexInput({
      thread: {
        id: "thread_1",
        title: "Thread",
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z"
      },
      run: {
        id: "run_1",
        threadId: "thread_1",
        userMessageId: "message_1",
        status: "running",
        startedAt: "2026-06-05T00:00:00.000Z"
      },
      userMessage: {
        id: "message_1",
        threadId: "thread_1",
        role: "user",
        content: "Summarize the selected item",
        attachments: [],
        createdAt: "2026-06-05T00:00:00.000Z"
      },
      contexts: [
        {
          id: "context_1",
          threadId: "thread_1",
          providerName: "selection",
          value: { id: "shape_1" },
          collectedAt: "2026-06-05T00:00:00.000Z"
        }
      ],
      capabilities: [
        {
          name: "host.readSelection",
          description: "Read current selection",
          effect: "read",
          approval: "never"
        }
      ]
    });

    expect(input).toContain("Summarize the selected item");
    expect(input).toContain("selection");
    expect(input).toContain("host.readSelection");
  });
});
