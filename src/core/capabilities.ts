import type {
  Capability,
  CapabilityApprovalMode,
  CapabilityEffect,
  CapabilityRequest,
  JsonValue
} from "./types.js";

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    if (this.capabilities.has(capability.name)) {
      throw new Error(`capability already registered: ${capability.name}`);
    }
    this.capabilities.set(capability.name, capability);
  }

  get(name: string): Capability | undefined {
    return this.capabilities.get(name);
  }

  require(name: string): Capability {
    const capability = this.capabilities.get(name);
    if (!capability) {
      throw new Error(`unknown capability: ${name}`);
    }
    return capability;
  }

  list(): Capability[] {
    return [...this.capabilities.values()];
  }

  summaries(): Array<{ name: string; description: string; effect: CapabilityEffect; approval: CapabilityApprovalMode }> {
    return this.list().map((capability) => ({
      name: capability.name,
      description: capability.description,
      effect: capability.effect ?? "read",
      approval: capability.approval ?? defaultApprovalForEffect(capability.effect ?? "read")
    }));
  }
}

export function defaultApprovalForEffect(effect: CapabilityEffect): CapabilityApprovalMode {
  return effect === "read" ? "never" : "always";
}

export function capabilityRequestOutput(request: CapabilityRequest): JsonValue {
  if (request.status === "completed") {
    return request.output ?? null;
  }
  if (request.status === "failed" || request.status === "rejected") {
    return { error: request.error ?? request.status };
  }
  return null;
}
