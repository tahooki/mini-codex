import { useMemo, useRef, useState } from "react";
import { createMiniCodex, type Capability, type JsonObject, type JsonValue } from "mini-codex";
import {
  createDefaultOrchestrator,
  type OrchestrationAction,
  type OrchestrationCreateInput,
  type OrchestrationGate
} from "mini-codex/orchestration";
import { MiniCodexPanel, MiniCodexProvider, MiniCodexWorkbench, useMiniCodexSnapshot } from "mini-codex/react";
import {
  asCreateCardsInput,
  cleanString,
  createCardFromInput,
  extractPendingCards,
  initialTodoCards,
  normalizeLabels,
  normalizePriority,
  normalizeStatus,
  TodoAppTopBar,
  TodoDashboard,
  TodoInspector,
  todoColumns,
  type TodoCard,
  type TodoColumnId
} from "../../shared/todo-dashboard/index.js";
import { DemoAgentAdapter } from "./demoAgent.js";

function asObject(input: JsonValue): JsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input : {};
}

function asStringArray(input: JsonValue | undefined): string[] {
  return Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
}

const boardOrchestrationActions: OrchestrationAction[] = [
  {
    name: "answer-board-question",
    label: "Answer board question",
    description: "Answer using board context without changing cards.",
    executionBoundary: "answer"
  },
  {
    name: "inspect-board",
    label: "Inspect board",
    description: "Summarize the current task board and selected card.",
    executionBoundary: "answer"
  },
  {
    name: "create-card",
    label: "Create task card",
    description: "Prepare new host-owned cards through board capabilities.",
    executionBoundary: "capability",
    requiresApproval: true
  },
  {
    name: "move-card",
    label: "Move selected card",
    description: "Move the selected host-owned card to another column.",
    executionBoundary: "capability",
    requiresApproval: true
  },
  {
    name: "plan-sprint",
    label: "Plan sprint",
    description: "Create a group of sprint cards from board context.",
    executionBoundary: "capability",
    requiresApproval: true
  },
  {
    name: "repair-board-action",
    label: "Repair board action",
    description: "Repair a failed board action before claiming completion.",
    executionBoundary: "repair",
    requiresApproval: true
  }
];

function selectBoardAction(input: OrchestrationCreateInput): string {
  const lower = input.userMessage.toLowerCase();
  if (/(what|why|how|explain|summarize|blocked|뭐|왜|어떻게|설명|요약)/i.test(lower) && !/(create|add|move|delete|plan|clean|만들|추가|옮|삭제|계획)/i.test(lower)) {
    return "answer-board-question";
  }
  if (/(inspect|review|검토|살펴)/i.test(lower)) {
    return "inspect-board";
  }
  if (/(move|review|옮|이동)/i.test(lower)) {
    return "move-card";
  }
  if (/(sprint|plan|break down|계획|분해)/i.test(lower)) {
    return "plan-sprint";
  }
  return "create-card";
}

export function App() {
  const [cards, setCards] = useState<TodoCard[]>(initialTodoCards);
  const [selectedId, setSelectedId] = useState(initialTodoCards[0]?.id ?? "");
  const cardsRef = useRef(cards);
  const selectedIdRef = useRef(selectedId);
  cardsRef.current = cards;
  selectedIdRef.current = selectedId;

  const runtime = useMemo(() => {
    const capabilities: Capability[] = [
      {
        name: "todo.createCards",
        description: "Create task cards in the host todo board",
        effect: "write",
        approval: "always",
        preview: (input) => {
          const cardsInput = asCreateCardsInput(input);
          return {
            title: `Create ${cardsInput.cards.length} task card${cardsInput.cards.length === 1 ? "" : "s"}`,
            description: "Adds ghost cards to the board until the change is approved.",
            changes: cardsInput.cards.map((card) => `Create ${cleanString(card.title, "Untitled task")} in ${normalizeStatus(card.status)}`),
            data: input
          };
        },
        run: (input) => {
          const cardsInput = asCreateCardsInput(input);
          const created = cardsInput.cards.map((cardInput, index) => (
            createCardFromInput(cardInput, `task-${Date.now()}-${index}`)
          ));
          setCards((current) => [...current, ...created]);
          if (created[0]) {
            setSelectedId(created[0].id);
          }
          return { createdCount: created.length };
        }
      },
      {
        name: "todo.updateCard",
        description: "Update title, description, labels, owner, due date, or priority for a task card",
        effect: "write",
        approval: "always",
        preview: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          const target = cardsRef.current.find((card) => card.id === cardId);
          return {
            title: `Update ${target?.title ?? "selected task"}`,
            description: "Applies a focused task-card update.",
            changes: [
              `Title: ${cleanString(data.title, target?.title ?? "Untitled task")}`,
              `Priority: ${normalizePriority(data.priority)}`,
              `Labels: ${normalizeLabels(data.labels).join(", ") || "unchanged"}`
            ],
            data
          };
        },
        run: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          setCards((current) => current.map((card) => card.id === cardId ? {
            ...card,
            title: cleanString(data.title, card.title),
            description: cleanString(data.description, card.description),
            priority: normalizePriority(data.priority ?? card.priority),
            labels: data.labels ? normalizeLabels(data.labels) : card.labels,
            owner: typeof data.owner === "string" ? data.owner : card.owner,
            dueDate: typeof data.dueDate === "string" ? data.dueDate : card.dueDate
          } : card));
          return { updatedCardId: cardId };
        }
      },
      {
        name: "todo.moveCard",
        description: "Move a task card to another board column",
        effect: "write",
        approval: "always",
        preview: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          const status = normalizeStatus(data.status);
          const target = cardsRef.current.find((card) => card.id === cardId);
          return {
            title: `Move ${target?.title ?? "selected task"}`,
            description: "Moves a host-owned card between board columns.",
            changes: [`Move from ${target?.status ?? "current"} to ${status}`],
            data
          };
        },
        run: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          const status = normalizeStatus(data.status);
          setCards((current) => current.map((card) => card.id === cardId ? { ...card, status } : card));
          return { movedCardId: cardId, status };
        }
      },
      {
        name: "todo.deleteCard",
        description: "Delete a task card from the host board",
        effect: "write",
        approval: "always",
        preview: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          const target = cardsRef.current.find((card) => card.id === cardId);
          return {
            title: `Delete ${target?.title ?? "selected task"}`,
            description: "Removes the task from the host-owned board.",
            changes: target ? [`Remove ${target.title}`] : ["No selected card"],
            data
          };
        },
        run: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          setCards((current) => {
            const next = current.filter((card) => card.id !== cardId);
            setSelectedId((currentSelected) => currentSelected === cardId ? next[0]?.id ?? "" : currentSelected);
            return next;
          });
          return { deletedCardId: cardId };
        }
      },
      {
        name: "todo.addChecklistItems",
        description: "Add checklist items to a task card",
        effect: "write",
        approval: "always",
        preview: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          const items = asStringArray(data.items);
          const target = cardsRef.current.find((card) => card.id === cardId);
          return {
            title: `Add checklist to ${target?.title ?? "selected task"}`,
            description: "Adds new unchecked checklist items.",
            changes: items.map((item) => `Add ${item}`),
            data
          };
        },
        run: (input) => {
          const data = asObject(input);
          const cardId = cleanString(data.cardId, selectedIdRef.current);
          const items = asStringArray(data.items);
          setCards((current) => current.map((card) => card.id === cardId ? {
            ...card,
            checklist: [
              ...card.checklist,
              ...items.map((text, index) => ({
                id: `${card.id}-agent-check-${Date.now()}-${index}`,
                text,
                done: false
              }))
            ]
          } : card));
          return { cardId, addedCount: items.length };
        }
      },
      {
        name: "todo.planSprint",
        description: "Create a small sprint plan as task cards",
        effect: "write",
        approval: "always",
        preview: (input) => {
          const cardsInput = asCreateCardsInput(input);
          return {
            title: `Plan sprint with ${cardsInput.cards.length} cards`,
            description: "Creates a grouped set of sprint cards from the current board context.",
            changes: cardsInput.cards.map((card) => `Plan ${cleanString(card.title, "Untitled sprint task")}`),
            data: input
          };
        },
        run: async (input) => {
          const cardsInput = asCreateCardsInput(input);
          const created = cardsInput.cards.map((cardInput, index) => (
            createCardFromInput({ ...cardInput, status: "inbox" }, `sprint-${Date.now()}-${index}`)
          ));
          setCards((current) => [...current, ...created]);
          if (created[0]) {
            setSelectedId(created[0].id);
          }
          return { plannedCount: created.length };
        }
      }
    ];

    const instance = createMiniCodex({
      agent: new DemoAgentAdapter(),
      capabilities,
      orchestrator: createDefaultOrchestrator({
        actions: boardOrchestrationActions,
        gates: (_input, action): OrchestrationGate[] => {
          const mutatingActions = boardOrchestrationActions
            .filter((candidate) => candidate.executionBoundary !== "answer")
            .map((candidate) => candidate.name);
          const affected = action ? [action.name] : mutatingActions;
          const needsSelectedCard = action?.name === "move-card" && !selectedIdRef.current;
          return [
            {
              affectedActions: mutatingActions,
              name: "approval-boundary",
              status: action?.requiresApproval ? "warning" : "passed",
              summary: action?.requiresApproval
                ? "Board mutations must still pass capability approval."
                : "Board answer actions do not require mutation approval."
            },
            {
              affectedActions: affected,
              name: "selection-boundary",
              status: needsSelectedCard ? "needs-user" : "passed",
              summary: needsSelectedCard
                ? "Select a card before moving it."
                : "Selected-card context is available or not needed."
            },
            {
              affectedActions: boardOrchestrationActions.map((candidate) => candidate.name),
              name: "display-safety-boundary",
              status: "passed",
              summary: "Decision card shows only public board summaries."
            }
          ];
        },
        selectAction: selectBoardAction
      }),
      contextProviders: [
        {
          name: "todo.board",
          description: "Board summary, column counts, overdue cards, and selected task",
          getContext: () => {
            const currentCards = cardsRef.current;
            const selected = currentCards.find((card) => card.id === selectedIdRef.current);
            return {
              selectedCard: selected ?? null,
              cardCount: currentCards.length,
              columns: todoColumns.map((column) => ({
                id: column.id,
                title: column.title,
                count: currentCards.filter((card) => card.status === column.id).length
              })),
              highPriority: currentCards.filter((card) => card.priority === "high").map((card) => card.id),
              overdue: currentCards.filter((card) => card.dueDate && card.status !== "done").map((card) => card.id)
            };
          }
        }
      ]
    });
    instance.createThread({ title: "Task-board agent" });
    return instance;
  }, []);

  return (
    <MiniCodexProvider runtime={runtime}>
      <TodoWorkbench cards={cards} runtime={runtime} selectedId={selectedId} setSelectedId={setSelectedId} />
    </MiniCodexProvider>
  );
}

function TodoWorkbench({
  cards,
  runtime,
  selectedId,
  setSelectedId
}: {
  cards: TodoCard[];
  runtime: ReturnType<typeof createMiniCodex>;
  selectedId: string;
  setSelectedId: (cardId: string) => void;
}) {
  const snapshot = useMiniCodexSnapshot();
  const pendingCards = extractPendingCards(snapshot.approvals.filter((approval) => approval.status === "pending"));

  function send(prompt: string) {
    void runtime.sendMessage({ content: prompt });
  }

  return (
    <MiniCodexWorkbench
      top={<TodoAppTopBar cards={cards} onCommand={send} />}
      left={
        <MiniCodexPanel
          labels={{ composerPlaceholder: "Ask Mini Codex to plan or move tasks..." }}
          quickCommands={[
            { label: "Plan sprint", prompt: "Plan this week sprint from the current board" },
            { label: "Break down goal", prompt: "Break down the Mini Codex UI redesign into implementation cards" },
            { label: "Clean stale", prompt: "Clean stale cards and add checklist items to the selected task" },
            { label: "Move blocked", prompt: "Move the approval preview work into review" }
          ]}
        />
      }
      center={
        <TodoDashboard
          cards={cards}
          columns={todoColumns}
          onSelectCard={setSelectedId}
          pendingCards={pendingCards}
          selectedId={selectedId}
        />
      }
      right={
        <TodoInspector
          cards={cards}
          columns={todoColumns}
          selectedId={selectedId}
          snapshot={snapshot}
        />
      }
    />
  );
}
