import type { AgentAdapter, AgentAdapterRunInput, AgentAdapterStep } from "../types.js";

export type MockAgentAdapterOptions = {
  steps?: AgentAdapterStep[];
};

export class MockAgentAdapter implements AgentAdapter {
  private readonly steps: AgentAdapterStep[];

  constructor(options: MockAgentAdapterOptions = {}) {
    this.steps = options.steps ?? [
      { type: "message", content: "Mock agent received the request." },
      { type: "final", content: "Mock agent completed the run." }
    ];
  }

  async *run(_input: AgentAdapterRunInput): AsyncGenerator<AgentAdapterStep> {
    for (const step of this.steps) {
      yield step;
    }
  }
}
