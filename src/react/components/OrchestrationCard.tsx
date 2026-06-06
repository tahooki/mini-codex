import {
  projectOrchestrationCard,
  type OrchestrationGraph,
  type OrchestrationGraphSummary
} from "../../orchestration/index.js";

export type OrchestrationCardProps = {
  graph: OrchestrationGraph | OrchestrationGraphSummary;
};

export function OrchestrationCard({ graph }: OrchestrationCardProps) {
  const projection = projectOrchestrationCard(graph);

  if (!projection) {
    return null;
  }

  return (
    <article className="mc-orchestration-card" aria-label="Orchestration decision">
      <div className="mc-orchestration-header">
        <span className="mc-orchestration-icon" aria-hidden="true">D</span>
        <span className="mc-orchestration-main">
          <strong>{projection.actionLabel ?? "Decision prepared"}</strong>
          {projection.policyLabel ? <span>{projection.policyLabel}</span> : null}
        </span>
        <span className="mc-orchestration-status" data-tone={toneForProjection(projection)}>
          {projection.terminalKind ?? projection.executionMode ?? "ready"}
        </span>
      </div>
      {projection.gateSummaries.length > 0 ? (
        <ul className="mc-orchestration-gates" aria-label="Decision gates">
          {projection.gateSummaries.map((gate) => <li key={gate}>{gate}</li>)}
        </ul>
      ) : null}
      {projection.latestObservation ? (
        <p className="mc-orchestration-observation">{projection.latestObservation}</p>
      ) : null}
      {projection.terminalClaimLevel ? (
        <span className="mc-orchestration-claim">Claim: {projection.terminalClaimLevel}</span>
      ) : null}
    </article>
  );
}

function toneForProjection(projection: NonNullable<ReturnType<typeof projectOrchestrationCard>>) {
  if (projection.attentionNeeded || projection.terminalKind === "failed" || projection.terminalKind === "blocked") {
    return "danger";
  }
  if (projection.terminalKind === "final") {
    return "success";
  }
  if (projection.gateSummaries.length > 0) {
    return "pending";
  }
  return "default";
}
