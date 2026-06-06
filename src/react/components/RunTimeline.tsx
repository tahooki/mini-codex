import type { MiniCodexEvent } from "../../core/index.js";

export type RunTimelineProps = {
  events: MiniCodexEvent[];
  limit?: number;
};

export function RunTimeline({ events, limit = 12 }: RunTimelineProps) {
  const visibleEvents = events.slice(-limit);

  if (visibleEvents.length === 0) {
    return (
      <div className="mc-run-steps" aria-label="Run timeline">
        <div className="mc-run-step">
          <span className="mc-run-step-dot" aria-hidden="true" />
          <strong>No activity yet</strong>
          <span className="mc-muted">idle</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-run-steps" aria-label="Run timeline">
      {visibleEvents.map((event) => {
        const step = describeEvent(event);
        return (
        <div className="mc-run-step" data-tone={step.tone} data-type={event.type} key={event.id}>
          <span className="mc-run-step-dot" aria-hidden="true" />
          <strong>{step.label}</strong>
          <time>{formatTime(event.createdAt)}</time>
        </div>
        );
      })}
    </div>
  );
}

function describeEvent(event: MiniCodexEvent): { label: string; tone: "agent" | "danger" | "default" | "pending" | "success" } {
  const capabilityName = typeof event.payload.capabilityName === "string" ? event.payload.capabilityName : undefined;
  const providerName = typeof event.payload.providerName === "string" ? event.payload.providerName : undefined;

  switch (event.type) {
    case "thread.created":
      return { label: "Opened work thread", tone: "default" };
    case "message.created":
      return { label: "Added message", tone: "default" };
    case "run.started":
      return { label: "Started agent run", tone: "agent" };
    case "context.collected":
      return { label: providerName ? `Read ${providerName}` : "Read host context", tone: "agent" };
    case "orchestration.created":
      return { label: "Prepared decision", tone: "agent" };
    case "orchestration.updated":
      return { label: "Updated decision", tone: "pending" };
    case "orchestration.terminal":
      return { label: "Recorded decision claim", tone: "success" };
    case "approval.requested":
      return { label: capabilityName ? `Waiting to approve ${capabilityName}` : "Waiting for approval", tone: "pending" };
    case "approval.approved":
      return { label: capabilityName ? `Approved ${capabilityName}` : "Approved change", tone: "success" };
    case "approval.rejected":
      return { label: capabilityName ? `Rejected ${capabilityName}` : "Rejected change", tone: "danger" };
    case "capability.requested":
      return { label: capabilityName ? `Prepared ${capabilityName}` : "Prepared host change", tone: "pending" };
    case "capability.completed":
      return { label: capabilityName ? `Applied ${capabilityName}` : "Applied host change", tone: "success" };
    case "capability.failed":
      return { label: capabilityName ? `Failed ${capabilityName}` : "Capability failed", tone: "danger" };
    case "run.completed":
      return { label: "Completed run", tone: "success" };
    case "run.failed":
      return { label: "Run failed", tone: "danger" };
    case "agent.thread.started":
      return { label: "Connected agent thread", tone: "agent" };
    case "agent.turn.started":
      return { label: "Agent started thinking", tone: "agent" };
    case "agent.turn.completed":
      return { label: "Agent finished turn", tone: "success" };
    case "agent.turn.failed":
      return { label: "Agent turn failed", tone: "danger" };
    case "agent.item.started":
      return { label: "Agent item started", tone: "agent" };
    case "agent.item.updated":
      return { label: "Agent item updated", tone: "agent" };
    case "agent.item.completed":
      return { label: "Agent item completed", tone: "success" };
    default:
      return { label: event.type, tone: "default" };
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
