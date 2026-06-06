import type {
  PendingTodoCard,
  TodoCard,
  TodoCardInput,
  TodoColumnId,
  TodoCreateCardsInput,
  TodoPriority
} from "./types.js";

export function createCardFromInput(input: TodoCardInput, fallbackId: string): TodoCard {
  return {
    id: fallbackId,
    title: cleanString(input.title, "Untitled task"),
    description: cleanString(input.description, "Created by Mini Codex."),
    priority: normalizePriority(input.priority),
    status: normalizeStatus(input.status),
    labels: normalizeLabels(input.labels),
    ...(input.owner ? { owner: input.owner } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    checklist: (input.checklist ?? []).map((text, index) => ({
      id: `${fallbackId}-check-${index + 1}`,
      text,
      done: false
    }))
  };
}

export function extractPendingCards(approvals: Array<{ id: string; capabilityName: string; input: unknown }>): PendingTodoCard[] {
  const pendingCards: PendingTodoCard[] = [];
  for (const approval of approvals) {
    if (approval.capabilityName !== "todo.createCards" && approval.capabilityName !== "todo.planSprint") {
      continue;
    }
    const input = asCreateCardsInput(approval.input);
    for (const [index, cardInput] of input.cards.entries()) {
      pendingCards.push({
        ...createCardFromInput(cardInput, `pending-${approval.id}-${index}`),
        agentState: "pending",
        pendingApprovalId: approval.id
      });
    }
  }
  return pendingCards;
}

export function asCreateCardsInput(input: unknown): Required<TodoCreateCardsInput> {
  if (!isRecord(input) || !Array.isArray(input.cards)) {
    return { cards: [] };
  }
  return {
    cards: input.cards.filter(isRecord).map((card) => ({
      title: typeof card.title === "string" ? card.title : undefined,
      description: typeof card.description === "string" ? card.description : undefined,
      priority: normalizePriority(card.priority),
      status: normalizeStatus(card.status),
      labels: Array.isArray(card.labels) ? card.labels.filter((label): label is string => typeof label === "string") : undefined,
      owner: typeof card.owner === "string" ? card.owner : undefined,
      dueDate: typeof card.dueDate === "string" ? card.dueDate : undefined,
      checklist: Array.isArray(card.checklist) ? card.checklist.filter((item): item is string => typeof item === "string") : undefined
    }))
  };
}

export function cleanString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function normalizePriority(value: unknown): TodoPriority {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

export function normalizeStatus(value: unknown): TodoColumnId {
  return value === "inbox" || value === "doing" || value === "review" || value === "done" ? value : "inbox";
}

export function normalizeLabels(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((label): label is string => typeof label === "string").slice(0, 4) : [];
}

export function checklistProgress(card: TodoCard): string {
  if (card.checklist.length === 0) {
    return "0/0";
  }
  const done = card.checklist.filter((item) => item.done).length;
  return `${done}/${card.checklist.length}`;
}

export function isOverdue(card: TodoCard): boolean {
  if (!card.dueDate || card.status === "done") {
    return false;
  }
  return new Date(card.dueDate).getTime() < new Date("2026-06-10").getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
