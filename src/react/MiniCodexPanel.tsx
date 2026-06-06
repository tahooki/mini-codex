import { useMemo, useState, type ComponentType } from "react";
import type { ApprovalRequest, CapabilityRequest } from "../core/index.js";
import { ApprovalCard, type ApprovalCardProps } from "./components/ApprovalCard.js";
import { MiniCodexComposer } from "./components/MiniCodexComposer.js";
import { MiniCodexThread } from "./components/MiniCodexThread.js";
import { OrchestrationCard, type OrchestrationCardProps } from "./components/OrchestrationCard.js";
import { RunTimeline } from "./components/RunTimeline.js";
import { ToolCallView, type ToolCallViewProps } from "./components/ToolCallView.js";
import { useMiniCodex, useMiniCodexSnapshot } from "./hooks.js";

export type MiniCodexPanelSlots = {
  ApprovalCard?: ComponentType<ApprovalCardProps>;
  OrchestrationCard?: ComponentType<OrchestrationCardProps>;
  ToolCallView?: ComponentType<ToolCallViewProps>;
};

export type MiniCodexPanelLabels = {
  composerPlaceholder?: string;
  title?: string;
};

export type MiniCodexQuickCommand = {
  label: string;
  prompt: string;
};

export type MiniCodexPanelProps = {
  threadId?: string;
  labels?: MiniCodexPanelLabels;
  quickCommands?: MiniCodexQuickCommand[];
  slots?: MiniCodexPanelSlots;
};

export function MiniCodexPanel({ threadId, labels = {}, quickCommands = [], slots = {} }: MiniCodexPanelProps) {
  const runtime = useMiniCodex();
  const snapshot = useMiniCodexSnapshot();
  const [sending, setSending] = useState(false);
  const activeThread = useMemo(() => (
    threadId
      ? snapshot.threads.find((thread) => thread.id === threadId)
      : snapshot.threads[0]
  ), [snapshot.threads, threadId]);
  const activeThreadId = threadId ?? activeThread?.id;
  const messages = snapshot.messages.filter((message) => !activeThreadId || message.threadId === activeThreadId);
  const events = snapshot.events.filter((event) => !activeThreadId || event.threadId === activeThreadId);
  const approvals = snapshot.approvals.filter((approval) => approval.status === "pending" && (!activeThreadId || approval.threadId === activeThreadId));
  const capabilityRequests = snapshot.capabilityRequests.filter((request) => !activeThreadId || request.threadId === activeThreadId);
  const activeRun = [...snapshot.runs].reverse().find((run) => !activeThreadId || run.threadId === activeThreadId);
  const orchestrationGraph = activeRun?.orchestrationGraphId
    ? snapshot.orchestrationGraphs?.find((graph) => graph.id === activeRun.orchestrationGraphId)
    : snapshot.orchestrationGraphs?.find((graph) => !activeThreadId || graph.threadId === activeThreadId);
  const Approval = slots.ApprovalCard ?? ApprovalCard;
  const Decision = slots.OrchestrationCard ?? OrchestrationCard;
  const ToolCall = slots.ToolCallView ?? ToolCallView;

  async function submit(content: string) {
    setSending(true);
    try {
      await runtime.sendMessage({
        ...(activeThreadId ? { threadId: activeThreadId } : {}),
        content
      });
    } finally {
      setSending(false);
    }
  }

  async function approve(approvalId: string) {
    await runtime.approveApproval(approvalId);
  }

  async function reject(approvalId: string) {
    await runtime.rejectApproval(approvalId);
  }

  return (
    <section className="mc-panel" aria-label="Mini Codex panel">
      <header className="mc-panel-header">
        <div className="mc-panel-title">
          <strong>{labels.title ?? "Mini Codex"}</strong>
          <span>{activeThread?.title ?? "New thread"}</span>
        </div>
        <span className="mc-status-pill" data-status={activeRun?.status ?? "idle"}>{activeRun?.status ?? "idle"}</span>
      </header>
      <div className="mc-panel-body">
        {quickCommands.length > 0 ? (
          <section className="mc-panel-section" aria-label="Quick commands">
            <span className="mc-kicker">Quick commands</span>
            <div className="mc-button-row">
              {quickCommands.map((command) => (
                <button
                  className="mc-button secondary"
                  disabled={sending}
                  key={command.label}
                  onClick={() => void submit(command.prompt)}
                  type="button"
                >
                  {command.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <section className="mc-panel-section">
          <MiniCodexThread messages={messages} />
        </section>
        {orchestrationGraph ? (
          <section className="mc-panel-section" aria-label="Orchestration decision">
            <span className="mc-kicker">Decision</span>
            <Decision graph={orchestrationGraph} />
          </section>
        ) : null}
        {capabilityRequests.length > 0 ? (
          <section className="mc-panel-section" aria-label="Capability activity">
            <div className="mc-section-heading">
              <span className="mc-kicker">Actions</span>
              <span>{capabilityRequests.length}</span>
            </div>
            {capabilityRequests.map((request: CapabilityRequest) => (
              <ToolCall key={request.id} request={request} />
            ))}
          </section>
        ) : null}
        {approvals.length > 0 ? (
          <section className="mc-panel-section" aria-label="Pending approvals">
            {approvals.map((approval: ApprovalRequest) => (
              <Approval approval={approval} key={approval.id} onApprove={approve} onReject={reject} />
            ))}
          </section>
        ) : null}
        <section className="mc-panel-section">
          <span className="mc-kicker">Run activity</span>
          <RunTimeline events={events} />
        </section>
      </div>
      <MiniCodexComposer
        disabled={sending}
        onSubmit={submit}
        placeholder={labels.composerPlaceholder ?? "Ask Mini Codex..."}
      />
    </section>
  );
}
