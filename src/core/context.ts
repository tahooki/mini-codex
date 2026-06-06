import type { CollectedContext, ContextProvider, ContextScope, JsonValue, MiniCodexClock, MiniCodexIdGenerator } from "./types.js";

export class ContextProviderRegistry {
  private readonly providers = new Map<string, ContextProvider>();

  register(provider: ContextProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`context provider already registered: ${provider.name}`);
    }
    this.providers.set(provider.name, provider);
  }

  list(): ContextProvider[] {
    return [...this.providers.values()];
  }

  async collect(scope: ContextScope, ids: MiniCodexIdGenerator, now: MiniCodexClock): Promise<CollectedContext[]> {
    const contexts: CollectedContext[] = [];

    for (const provider of this.providers.values()) {
      const value = await provider.getContext(scope);
      contexts.push({
        id: ids("context"),
        threadId: scope.threadId,
        ...(scope.runId ? { runId: scope.runId } : {}),
        providerName: provider.name,
        ...(provider.description ? { description: provider.description } : {}),
        value: value as JsonValue,
        collectedAt: now()
      });
    }

    return contexts;
  }
}
