import type { AgentAdapter, AgentAdapterRunInput, AgentAdapterStep, JsonObject, JsonValue } from "mini-codex";

function boardPayload(input: AgentAdapterRunInput): JsonValue {
  return input.contexts.find((context) => context.providerName === "todo.board")?.value ?? {};
}

export class ElectronTodoAgentAdapter implements AgentAdapter {
  async *run(input: AgentAdapterRunInput): AsyncGenerator<AgentAdapterStep> {
    const content = input.userMessage.content.toLowerCase();

    yield {
      type: "message",
      content: "I reviewed the local board and prepared an approved desktop action."
    };

    if (content.includes("save") || content.includes("local")) {
      yield {
        type: "capability_request",
        capabilityName: "electron.writeTextFile",
        input: {
          path: "board.json",
          content: JSON.stringify({
            savedAt: new Date().toISOString(),
            board: boardPayload(input)
          }, null, 2)
        } satisfies JsonObject
      };
      return;
    }

    yield {
      type: "capability_request",
      capabilityName: "todo.planSprint",
      input: {
        cards: [
          {
            title: "Persist board file through Electron",
            description: "Use the preload bridge to save approved board mutations locally.",
            priority: "high",
            labels: ["electron", "filesystem"],
            owner: "TH",
            dueDate: "2026-06-11",
            checklist: ["Bridge context", "Save approval", "Smoke build"]
          },
          {
            title: "Verify desktop approval screenshot",
            description: "Capture the local write approval and approved state in the Electron dashboard.",
            priority: "medium",
            labels: ["qa", "desktop"],
            owner: "CX",
            dueDate: "2026-06-12",
            checklist: ["Pending screenshot", "Approved screenshot"]
          }
        ]
      } satisfies JsonObject
    };
  }
}
