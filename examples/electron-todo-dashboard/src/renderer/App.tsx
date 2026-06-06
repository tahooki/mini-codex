import { useMemo, useRef, useState } from "react";
import { createMiniCodex, type Capability } from "mini-codex";
import { createElectronBridgeAdapter, type ElectronMiniCodexBridge } from "mini-codex/electron";
import { MiniCodexPanel, MiniCodexProvider, MiniCodexWorkbench, useMiniCodexSnapshot } from "mini-codex/react";
import {
  asCreateCardsInput,
  createCardFromInput,
  extractPendingCards,
  initialTodoCards,
  TodoAppTopBar,
  TodoDashboard,
  TodoInspector,
  todoColumns,
  type TodoCard
} from "../../../shared/todo-dashboard/index.js";
import { ElectronTodoAgentAdapter } from "./electronTodoAgent.js";

export function App() {
  const [cards, setCards] = useState<TodoCard[]>(initialTodoCards);
  const [selectedId, setSelectedId] = useState(initialTodoCards[0]?.id ?? "");
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const runtime = useMemo(() => {
    const todoCapabilities: Capability[] = [
      {
        name: "todo.planSprint",
        description: "Create sprint cards on the local todo dashboard",
        effect: "write",
        approval: "always",
        preview: (input) => {
          const cardsInput = asCreateCardsInput(input);
          return {
            title: `Create ${cardsInput.cards.length} desktop task cards`,
            description: "Adds approved task cards to the Electron todo dashboard.",
            changes: cardsInput.cards.map((card) => `Create ${card.title ?? "Untitled task"}`),
            data: input
          };
        },
        run: (input) => {
          const cardsInput = asCreateCardsInput(input);
          const created = cardsInput.cards.map((cardInput, index) => (
            createCardFromInput({ ...cardInput, status: "inbox" }, `electron-task-${Date.now()}-${index}`)
          ));
          setCards((current) => [...current, ...created]);
          if (created[0]) {
            setSelectedId(created[0].id);
          }
          return { plannedCount: created.length };
        }
      }
    ];

    const bridgeAdapter = createElectronBridgeAdapter({ bridge: window.miniCodex ?? createPreviewBridge() });

    const instance = createMiniCodex({
      agent: new ElectronTodoAgentAdapter(),
      capabilities: [...todoCapabilities, ...bridgeAdapter.capabilities],
      contextProviders: [
        ...bridgeAdapter.contextProviders,
        {
          name: "todo.board",
          description: "Current local todo board state",
          getContext: () => ({
            cards: cardsRef.current,
            columns: todoColumns
          })
        }
      ]
    });
    instance.createThread({ title: "Desktop board agent" });
    return instance;
  }, []);

  return (
    <MiniCodexProvider runtime={runtime}>
      <ElectronTodoWorkbench cards={cards} runtime={runtime} selectedId={selectedId} setSelectedId={setSelectedId} />
    </MiniCodexProvider>
  );
}

function createPreviewBridge(): ElectronMiniCodexBridge {
  return {
    getProjectContext: () => ({
      name: "Browser preview",
      rootPath: "preview://mini-codex-todo-dashboard",
      selectedPath: "board.json",
      recentFiles: ["board.json"]
    }),
    listDirectory: () => [{ name: "board.json", type: "file" }],
    openProject: (path) => ({ ok: true, path, preview: true }),
    readTextFile: () => "{}",
    writeTextFile: (path, content) => ({
      ok: true,
      path,
      bytes: content.length,
      preview: true
    })
  };
}

function ElectronTodoWorkbench({
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
      top={<TodoAppTopBar cards={cards} onCommand={send} title="Mini Codex Desktop Tasks" />}
      left={
        <MiniCodexPanel
          labels={{ composerPlaceholder: "Ask Mini Codex to plan or save locally..." }}
          quickCommands={[
            { label: "Plan desktop sprint", prompt: "Plan Electron desktop sprint tasks" },
            { label: "Save board", prompt: "Save this board locally" }
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
