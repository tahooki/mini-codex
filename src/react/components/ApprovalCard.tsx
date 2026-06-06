import type { ApprovalRequest } from "../../core/index.js";
import { DiffPreview } from "./DiffPreview.js";

export type ApprovalCardProps = {
  approval: ApprovalRequest;
  onApprove: (approvalId: string) => void | Promise<void>;
  onReject: (approvalId: string) => void | Promise<void>;
};

export function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const title = approval.preview?.title ?? approval.capabilityName;
  const description = approval.preview?.description ?? "Review the proposed host-app change before Mini Codex applies it.";

  return (
    <section className="mc-approval-card" data-status={approval.status}>
      <div className="mc-row mc-row-between">
        <span className="mc-kicker">Approval</span>
        <span className="mc-chip" data-tone={approval.status === "pending" ? "pending" : approval.status === "approved" ? "success" : "danger"}>
          {approval.status}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <DiffPreview changes={approval.preview?.changes} />
      {approval.status === "pending" ? (
        <div className="mc-button-row">
          <button type="button" onClick={() => void onApprove(approval.id)}>Approve</button>
          <button type="button" onClick={() => void onReject(approval.id)}>Reject</button>
        </div>
      ) : null}
    </section>
  );
}
