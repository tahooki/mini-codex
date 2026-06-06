import { RunTimeline } from "./components/RunTimeline.js";
import { ToolCallView } from "./components/ToolCallView.js";
import { useMiniCodex, useMiniCodexSnapshot } from "./hooks.js";

export type MiniCodexInspectorProps = {
  threadId?: string;
};

export function MiniCodexInspector({ threadId }: MiniCodexInspectorProps) {
  const runtime = useMiniCodex();
  const snapshot = useMiniCodexSnapshot();
  const activeThreadId = threadId ?? snapshot.threads[0]?.id;
  const contexts = snapshot.contexts.filter((context) => !activeThreadId || context.threadId === activeThreadId);
  const events = snapshot.events.filter((event) => !activeThreadId || event.threadId === activeThreadId);
  const capabilityRequests = snapshot.capabilityRequests.filter((request) => !activeThreadId || request.threadId === activeThreadId);
  const approvals = snapshot.approvals.filter((approval) => !activeThreadId || approval.threadId === activeThreadId);
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const latestRun = [...snapshot.runs].reverse().find((run) => !activeThreadId || run.threadId === activeThreadId);

  return (
    <aside className="mc-inspector" aria-label="Mini Codex inspector">
      <header className="mc-inspector-header">
        <div className="mc-inspector-title">
          <h2>Info</h2>
          <span>{events.length} events</span>
        </div>
        <span className="mc-status-pill" data-status={latestRun?.status ?? "idle"}>{latestRun?.status ?? "idle"}</span>
      </header>
      <div className="mc-inspector-body">
        <section className="mc-inspector-section">
          <h3>Proposed changes</h3>
          {pendingApprovals.length === 0 ? <p className="mc-muted">No pending changes.</p> : null}
          {pendingApprovals.map((approval) => (
            <article className="mc-inspector-row" key={approval.id}>
              <div className="mc-row mc-row-between">
                <strong>{approval.preview?.title ?? approval.capabilityName}</strong>
                <span className="mc-chip" data-tone="pending">{approval.status}</span>
              </div>
              {approval.preview?.description ? <span>{approval.preview.description}</span> : null}
              {approval.preview?.changes?.map((change) => (
                <div className="mc-change-row" key={change}>{change}</div>
              ))}
            </article>
          ))}
        </section>
        <section className="mc-inspector-section">
          <h3>Context summary</h3>
          {contexts.length === 0 ? <p className="mc-muted">No context collected yet.</p> : null}
          {contexts.map((context) => (
            <article className="mc-inspector-row" key={context.id}>
              <strong>{context.providerName}</strong>
              <span>{context.description ?? summarizeValue(context.value)}</span>
              <details className="mc-details">
                <summary>Developer data</summary>
                <pre>{JSON.stringify(context.value, null, 2)}</pre>
              </details>
            </article>
          ))}
        </section>
        <section className="mc-inspector-section">
          <h3>Activity</h3>
          {capabilityRequests.map((request) => <ToolCallView key={request.id} request={request} />)}
          <RunTimeline events={events} />
        </section>
        <section className="mc-inspector-section">
          <h3>Developer data</h3>
          <details className="mc-details">
            <summary>{runtime.listCapabilities().length} capabilities</summary>
            {runtime.listCapabilities().map((capability) => (
              <article className="mc-inspector-row" key={capability.name}>
                <strong>{capability.name}</strong>
                <span>{capability.description}</span>
              </article>
            ))}
          </details>
          <details className="mc-details">
            <summary>{approvals.length} approvals</summary>
            <pre>{JSON.stringify(approvals, null, 2)}</pre>
          </details>
        </section>
      </div>
    </aside>
  );
}

function summarizeValue(value: unknown): string {
  if (value === null) {
    return "No value";
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    return `${Object.keys(value).length} fields`;
  }
  return String(value);
}
