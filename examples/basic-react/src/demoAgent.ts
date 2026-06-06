import type { AgentAdapter, AgentAdapterRunInput, AgentAdapterStep, JsonObject } from "mini-codex";

function selectedCardId(input: AgentAdapterRunInput): string | undefined {
  const board = input.contexts.find((context) => context.providerName === "todo.board")?.value;
  if (!board || typeof board !== "object" || Array.isArray(board)) {
    return undefined;
  }
  const selected = board.selectedCard;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) {
    return undefined;
  }
  return typeof selected.id === "string" ? selected.id : undefined;
}

function cardIdInput(cardId: string | undefined): JsonObject {
  return cardId ? { cardId } : {};
}

export class DemoAgentAdapter implements AgentAdapter {
  async *run(input: AgentAdapterRunInput): AsyncGenerator<AgentAdapterStep> {
    const content = input.userMessage.content.trim();
    const lower = content.toLowerCase();
    const cardId = selectedCardId(input);

    yield {
      type: "message",
      content: "I reviewed the board context and prepared a task-board change."
    };

    if (lower.includes("delete") || lower.includes("remove")) {
      yield {
        type: "capability_request",
        capabilityName: "todo.deleteCard",
        input: cardIdInput(cardId)
      };
      return;
    }

    if (lower.includes("move") || lower.includes("review")) {
      yield {
        type: "capability_request",
        capabilityName: "todo.moveCard",
        input: {
          ...cardIdInput(cardId),
          status: "review"
        } satisfies JsonObject
      };
      return;
    }

    if (lower.includes("checklist") || lower.includes("clean")) {
      yield {
        type: "capability_request",
        capabilityName: "todo.addChecklistItems",
        input: {
          ...cardIdInput(cardId),
          items: [
            "Confirm current owner",
            "Remove stale acceptance notes",
            "Capture final screenshot evidence"
          ]
        } satisfies JsonObject
      };
      return;
    }

    if (lower.includes("sprint") || lower.includes("plan")) {
      yield {
        type: "capability_request",
        capabilityName: "todo.planSprint",
        input: {
          cards: [
            {
              title: "Ship polished todo dashboard",
              description: "Finish board layout, approval previews, and inspector states.",
              priority: "high",
              labels: ["demo", "ui"],
              owner: "TH",
              dueDate: "2026-06-09",
              checklist: ["Capture idle screenshot", "Capture approved screenshot"]
            },
            {
              title: "Add Electron local save flow",
              description: "Wrap the board in Electron and require approval for local writes.",
              priority: "medium",
              labels: ["electron", "local"],
              owner: "CX",
              dueDate: "2026-06-11",
              checklist: ["Preload bridge", "Save approval"]
            },
            {
              title: "Polish tldraw canvas-first demo",
              description: "Make canvas primary and show compact shape mutation previews.",
              priority: "medium",
              labels: ["tldraw", "canvas"],
              owner: "CX",
              dueDate: "2026-06-12",
              checklist: ["Selection summary", "Shape preview"]
            }
          ]
        } satisfies JsonObject
      };
      return;
    }

    yield {
      type: "capability_request",
      capabilityName: "todo.createCards",
      input: {
        cards: [
          {
            title: "Break down Mini Codex UI redesign",
            description: "Create a focused implementation slice for shell, panel, inspector, and approval previews.",
            priority: "high",
            status: "inbox",
            labels: ["ui", "planning"],
            owner: "TH",
            dueDate: "2026-06-08",
            checklist: ["Design baseline", "Board ghost cards", "Screenshot QA"]
          },
          {
            title: "Verify approval reject path",
            description: "Confirm rejected board mutations leave host-owned state unchanged.",
            priority: "medium",
            status: "inbox",
            labels: ["qa", "approval"],
            owner: "CX",
            checklist: ["Pending state", "Reject state", "No board mutation"]
          },
          {
            title: "Document redesigned demo",
            description: "Update install and release docs with the new task-board example.",
            priority: "low",
            status: "inbox",
            labels: ["docs"],
            owner: "TH",
            checklist: ["README", "Install guide", "Screenshots"]
          }
        ]
      } satisfies JsonObject
    };
  }
}
