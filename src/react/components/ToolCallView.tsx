import type { CapabilityRequest } from "../../core/index.js";

export type ToolCallViewProps = {
  request: CapabilityRequest;
};

export function ToolCallView({ request }: ToolCallViewProps) {
  const summary = summaryForStatus(request.status);
  const hasDetails = request.error || request.output !== undefined;
  const label = labelForCapability(request.capabilityName);

  return (
    <details className="mc-tool-call" data-status={request.status} open={request.status === "failed"}>
      <summary className="mc-tool-call-summary">
        <span className="mc-tool-call-icon" aria-hidden="true">{iconForStatus(request.status)}</span>
        <span className="mc-tool-call-main">
          <strong>{label}</strong>
          <span>{summary} · {request.capabilityName}</span>
        </span>
        <span className="mc-tool-call-status" data-tone={toneForStatus(request.status)}>
          {request.status}
        </span>
      </summary>
      {hasDetails ? (
        <div className="mc-tool-call-body">
          {request.error ? <p className="mc-error">{request.error}</p> : null}
          {request.output !== undefined ? (
            <>
              <span className="mc-muted">Result data</span>
              <pre>{JSON.stringify(request.output, null, 2)}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

function summaryForStatus(status: CapabilityRequest["status"]) {
  switch (status) {
    case "completed":
      return "Applied";
    case "awaiting_approval":
      return "Waiting for approval";
    case "rejected":
      return "Rejected";
    case "failed":
      return "Failed";
    default:
      return "Prepared";
  }
}

function labelForCapability(name: string) {
  const labels: Record<string, string> = {
    "electron.listDirectory": "List local files",
    "electron.openProject": "Open local project",
    "electron.readTextFile": "Read local file",
    "electron.writeTextFile": "Save local file",
    "tldraw.createShapes": "Create canvas shapes",
    "tldraw.deleteShapes": "Delete canvas shapes",
    "tldraw.organizeSelection": "Organize selected shapes",
    "tldraw.updateShapes": "Update canvas shapes",
    "todo.addChecklistItems": "Add checklist items",
    "todo.createCards": "Create task cards",
    "todo.deleteCard": "Delete task card",
    "todo.moveCard": "Move task card",
    "todo.planSprint": "Plan sprint cards",
    "todo.updateCard": "Update task card"
  };
  if (labels[name]) {
    return labels[name];
  }
  const parts = name.split(".");
  const lastPart = parts[parts.length - 1] ?? name;
  return lastPart.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
}

function iconForStatus(status: CapabilityRequest["status"]) {
  switch (status) {
    case "completed":
      return "ok";
    case "awaiting_approval":
      return "..";
    case "failed":
    case "rejected":
      return "!";
    default:
      return ">";
  }
}

function toneForStatus(status: CapabilityRequest["status"]) {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed" || status === "rejected") {
    return "danger";
  }
  if (status === "awaiting_approval") {
    return "pending";
  }
  return "agent";
}
