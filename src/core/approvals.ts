import type { ApprovalDecision, ApprovalPolicy, ApprovalRequest, CapabilityApprovalMode } from "./types.js";

export async function approvalDecisionFor(
  mode: CapabilityApprovalMode,
  request: ApprovalRequest,
  policy?: ApprovalPolicy,
): Promise<ApprovalDecision> {
  if (mode === "never") {
    return "approve";
  }
  if (mode === "always") {
    return "request";
  }
  if (!policy) {
    return "request";
  }
  return policy.shouldApprove(request);
}
