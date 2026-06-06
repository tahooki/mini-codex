import type { AgentAdapter, AgentAdapterRunInput, AgentAdapterStep, JsonObject, JsonValue } from "mini-codex";

function contextValue(input: AgentAdapterRunInput, providerName: string): JsonObject {
  const context = input.contexts.find((item) => item.providerName === providerName);
  return asObject(context?.value);
}

function selectedIds(input: AgentAdapterRunInput): string[] {
  const selection = contextValue(input, "tldraw.selection");
  return Array.isArray(selection.selectedIds)
    ? selection.selectedIds.filter((id): id is string => typeof id === "string")
    : [];
}

function shapeCount(input: AgentAdapterRunInput): number {
  const canvas = contextValue(input, "tldraw.canvas");
  return typeof canvas.shapeCount === "number" ? canvas.shapeCount : 0;
}

export class TldrawDemoAgentAdapter implements AgentAdapter {
  async *run(input: AgentAdapterRunInput): AsyncGenerator<AgentAdapterStep> {
    const content = input.userMessage.content.toLowerCase();

    if (content.includes("summarize")) {
      yield {
        type: "message",
        content: `Canvas has ${shapeCount(input)} shapes and ${selectedIds(input).length} selected shapes.`
      };
      yield { type: "final" };
      return;
    }

    yield {
      type: "message",
      content: "I prepared a tldraw canvas change request."
    };

    if (content.includes("delete") || content.includes("remove")) {
      yield {
        type: "capability_request",
        capabilityName: "tldraw.deleteShapes",
        input: { ids: selectedIds(input) }
      };
      return;
    }

    if (content.includes("organize") || content.includes("align")) {
      yield {
        type: "capability_request",
        capabilityName: "tldraw.organizeSelection",
        input: { direction: "row", gap: 36 }
      };
      return;
    }

    if (content.includes("rename") || content.includes("update")) {
      const ids = selectedIds(input);
      yield {
        type: "capability_request",
        capabilityName: "tldraw.updateShapes",
        input: {
          shapes: ids.map((id, index) => ({
            id,
            text: `Milestone ${index + 1}`,
            color: "green"
          }))
        }
      };
      return;
    }

    yield {
      type: "capability_request",
      capabilityName: "tldraw.createShapes",
      input: {
        shapes: [
          { color: "blue", text: "Core runtime", x: 140, y: 360 },
          { color: "green", text: "React workbench", x: 390, y: 360 },
          { color: "orange", text: "Host adapter", x: 640, y: 360 }
        ]
      }
    };
  }
}

function asObject(value: JsonValue | undefined): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
