import { useCallback, useState, type ReactNode } from "react";
import { createMiniCodex, type JsonObject, type JsonValue, type MiniCodexRuntime, type MiniCodexSnapshot } from "mini-codex";
import { MiniCodexPanel, MiniCodexProvider, ToolCallView, useMiniCodexSnapshot } from "mini-codex/react";
import { createTldrawAdapter } from "mini-codex/tldraw";
import { createShapeId, Tldraw, toRichText, type Editor } from "tldraw";
import { TldrawDemoAgentAdapter } from "./tldrawDemoAgent.js";

type CanvasStats = {
  selectedCount: number;
  shapeCount: number;
};

export function App() {
  const [runtime, setRuntime] = useState<MiniCodexRuntime | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [stats, setStats] = useState<CanvasStats>({ selectedCount: 0, shapeCount: 0 });

  const updateStats = useCallback((editor: Editor) => {
    setStats({
      selectedCount: editor.getSelectedShapeIds().length,
      shapeCount: editor.getCurrentPageShapes().length
    });
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    seedCanvas(editor);
    updateStats(editor);
    const tldrawAdapter = createTldrawAdapter({ editor });
    const nextRuntime = createMiniCodex({
      agent: new TldrawDemoAgentAdapter(),
      capabilities: tldrawAdapter.capabilities,
      contextProviders: tldrawAdapter.contextProviders
    });
    const thread = nextRuntime.createThread({ title: "Canvas agent" });
    setRuntime(nextRuntime);
    setThreadId(thread.id);

    const interval = window.setInterval(() => updateStats(editor), 200);
    return () => window.clearInterval(interval);
  }, [updateStats]);

  const sendCanvasMessage = useCallback((content: string) => {
    if (!runtime) {
      return;
    }
    void runtime.sendMessage({
      ...(threadId ? { threadId } : {}),
      content
    });
  }, [runtime, threadId]);

  return (
    <div className="tlx-shell">
      <aside className="tlx-panel">
        <RuntimeGate runtime={runtime}>
          <MiniCodexPanel
            labels={{ composerPlaceholder: "Ask about the canvas..." }}
            quickCommands={[
              { label: "Summarize", prompt: "Summarize this canvas" },
              { label: "Create cards", prompt: "Create three implementation cards" },
              { label: "Rename", prompt: "Rename selected boxes" },
              { label: "Organize", prompt: "Organize the selection" }
            ]}
          />
        </RuntimeGate>
      </aside>
      <main className="tlx-canvas-wrap">
        <div className="tlx-toolbar">
          <div>
            <span>tldraw</span>
            <strong>{stats.shapeCount} shapes</strong>
          </div>
          <div className="tlx-toolbar-actions">
            <span>{stats.selectedCount} selected</span>
            <button disabled={!runtime} onClick={() => sendCanvasMessage("Summarize this canvas")} type="button">
              Summarize
            </button>
            <button disabled={!runtime} onClick={() => sendCanvasMessage("Create three implementation cards")} type="button">
              Create
            </button>
            <button disabled={!runtime || stats.selectedCount === 0} onClick={() => sendCanvasMessage("Rename selected boxes")} type="button">
              Rename
            </button>
            <button disabled={!runtime || stats.selectedCount < 2} onClick={() => sendCanvasMessage("Organize the selection")} type="button">
              Organize
            </button>
          </div>
        </div>
        <div className="tlx-canvas">
          <Tldraw onMount={handleMount} />
        </div>
      </main>
      <aside className="tlx-inspector">
        <RuntimeGate runtime={runtime}>
          <TldrawCanvasInspector />
        </RuntimeGate>
      </aside>
    </div>
  );
}

function TldrawCanvasInspector() {
  const snapshot = useMiniCodexSnapshot();
  const canvas = contextValue(snapshot, "tldraw.canvas");
  const selection = contextValue(snapshot, "tldraw.selection");
  const selectedShapes = Array.isArray(selection.selectedShapes) ? selection.selectedShapes : [];
  const pending = snapshot.approvals.filter((approval) => approval.status === "pending");
  const actions = snapshot.capabilityRequests;

  return (
    <section className="tlx-info" aria-label="Canvas inspector">
      <header className="tlx-info-header">
        <div>
          <h2>Canvas info</h2>
          <span>{numberValue(canvas.shapeCount)} shapes · {selectedShapes.length} selected</span>
        </div>
      </header>
      <section className="tlx-info-section">
        <h3>Selection</h3>
        {selectedShapes.length === 0 ? <p className="tlx-muted">No selected shapes.</p> : null}
        <div className="tlx-shape-list">
          {selectedShapes.slice(0, 6).map((shape) => {
            const data = asObject(shape);
            return (
              <article className="tlx-shape-row" key={String(data.id)}>
                <strong>{stringValue(data.text, String(data.id))}</strong>
                <span>{stringValue(data.type, "shape")} · x {numberValue(data.x)} · y {numberValue(data.y)}</span>
              </article>
            );
          })}
        </div>
      </section>
      <section className="tlx-info-section">
        <div className="tlx-section-heading">
          <h3>Actions</h3>
          <span>{actions.length}</span>
        </div>
        {actions.length === 0 ? <p className="tlx-muted">No canvas actions yet.</p> : null}
        <div className="tlx-action-list">
          {actions.map((request) => <ToolCallView key={request.id} request={request} />)}
        </div>
      </section>
      <section className="tlx-info-section">
        <h3>Proposed changes</h3>
        {pending.length === 0 ? <p className="tlx-muted">No pending canvas changes.</p> : null}
        {pending.map((approval) => (
          <article className="tlx-change" key={approval.id}>
            <span className="tlx-kicker">Pending canvas change</span>
            <strong>{approval.preview?.title ?? approval.capabilityName}</strong>
            {approval.preview?.changes?.map((change) => <p key={change}>{change}</p>)}
          </article>
        ))}
      </section>
      <section className="tlx-info-section">
        <h3>Activity</h3>
        <div className="tlx-activity">
          {snapshot.events.slice(-7).map((event) => (
            <div className="tlx-activity-row" key={event.id}>
              <span>{eventLabel(event.type)}</span>
              <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
          ))}
        </div>
      </section>
      <section className="tlx-info-section">
        <details className="tlx-debug">
          <summary>Developer data</summary>
          <pre>{JSON.stringify({ canvas, selection, approvals: snapshot.approvals }, null, 2)}</pre>
        </details>
      </section>
    </section>
  );
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    "approval.approved": "Approved canvas action",
    "approval.rejected": "Rejected canvas action",
    "approval.requested": "Waiting for approval",
    "capability.completed": "Applied canvas action",
    "capability.failed": "Canvas action failed",
    "capability.requested": "Prepared canvas action",
    "context.collected": "Read canvas context",
    "message.created": "Added message",
    "run.completed": "Completed run",
    "run.failed": "Run failed",
    "run.started": "Started agent run",
    "thread.created": "Opened canvas thread"
  };
  return labels[type] ?? type;
}

function contextValue(snapshot: MiniCodexSnapshot, providerName: string): JsonObject {
  return asObject([...snapshot.contexts].reverse().find((context) => context.providerName === providerName)?.value);
}

function asObject(value: JsonValue | undefined): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function numberValue(value: JsonValue | undefined): number {
  return typeof value === "number" ? value : 0;
}

function stringValue(value: JsonValue | undefined, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function RuntimeGate({ children, runtime }: { children: ReactNode; runtime: MiniCodexRuntime | null }) {
  if (!runtime) {
    return (
      <div className="tlx-loading">
        <strong>Mini Codex</strong>
        <span>Connecting to canvas</span>
      </div>
    );
  }
  return <MiniCodexProvider runtime={runtime}>{children}</MiniCodexProvider>;
}

function seedCanvas(editor: Editor) {
  if (editor.getCurrentPageShapes().length > 0) {
    return;
  }
  const first = createShapeId("mini-codex-foundation");
  const second = createShapeId("mini-codex-workbench");
  const third = createShapeId("mini-codex-adapters");
  editor.createShapes([
    {
      id: first,
      type: "geo",
      x: 120,
      y: 120,
      props: {
        color: "blue",
        geo: "rectangle",
        h: 120,
        richText: toRichText("Foundation"),
        w: 210
      }
    },
    {
      id: second,
      type: "geo",
      x: 380,
      y: 120,
      props: {
        color: "green",
        geo: "rectangle",
        h: 120,
        richText: toRichText("Workbench"),
        w: 210
      }
    },
    {
      id: third,
      type: "geo",
      x: 640,
      y: 120,
      props: {
        color: "orange",
        geo: "rectangle",
        h: 120,
        richText: toRichText("Adapters"),
        w: 210
      }
    }
  ]);
  editor.setSelectedShapes([first, second, third]);
  editor.zoomToFit();
}
