import type {
  AgentAdapter,
  AgentAdapterRunInput,
  AgentAdapterStep,
  JsonObject,
  JsonValue,
  MiniCodexThread
} from "../core/index.js";
import type { Input, Thread, ThreadEvent, ThreadOptions, TurnOptions } from "@openai/codex-sdk";

export type CodexSdkThreadLike = Pick<Thread, "id" | "run" | "runStreamed">;
export type CodexSdkClientLike = {
  resumeThread(id: string, options?: ThreadOptions): CodexSdkThreadLike;
  startThread(options?: ThreadOptions): CodexSdkThreadLike;
};

export type CodexSdkCapabilityMapper = (
  event: ThreadEvent,
  input: AgentAdapterRunInput,
) => AgentAdapterStep | AgentAdapterStep[] | null | undefined;

export type CodexSdkAgentAdapterOptions = {
  codex: CodexSdkClientLike;
  capabilityMapper?: CodexSdkCapabilityMapper;
  inputMapper?: (input: AgentAdapterRunInput) => Input;
  stream?: boolean;
  threadId?: string;
  threadIdForMiniCodexThread?: (thread: MiniCodexThread) => string | undefined;
  threadOptions?: ThreadOptions;
  turnOptions?: TurnOptions;
};

export class CodexSdkAgentAdapter implements AgentAdapter {
  private readonly threadsByMiniThread = new Map<string, CodexSdkThreadLike>();

  constructor(private readonly options: CodexSdkAgentAdapterOptions) {}

  async *run(input: AgentAdapterRunInput): AsyncGenerator<AgentAdapterStep> {
    const thread = this.getThread(input.thread);
    const codexInput = this.options.inputMapper?.(input) ?? createDefaultCodexInput(input);
    const turnOptions = this.options.turnOptions;

    if (this.options.stream !== false && thread.runStreamed) {
      const streamed = await thread.runStreamed(codexInput, turnOptions);
      for await (const event of streamed.events) {
        for (const step of this.mapEvent(event, input)) {
          yield step;
        }
      }
      return;
    }

    const turn = await thread.run(codexInput, turnOptions);
    for (const item of turn.items) {
      yield {
        type: "event",
        eventType: "agent.item.completed",
        payload: {
          item: toJsonValue(item)
        }
      };
    }
    yield {
      type: "event",
      eventType: "agent.turn.completed",
      payload: {
        usage: toJsonValue(turn.usage)
      }
    };
    yield {
      type: "final",
      content: turn.finalResponse
    };
  }

  private getThread(thread: MiniCodexThread): CodexSdkThreadLike {
    const existing = this.threadsByMiniThread.get(thread.id);
    if (existing) {
      return existing;
    }

    const externalThreadId = this.options.threadIdForMiniCodexThread?.(thread) ?? this.options.threadId;
    const codexThread = externalThreadId
      ? this.options.codex.resumeThread(externalThreadId, this.options.threadOptions)
      : this.options.codex.startThread(this.options.threadOptions);

    this.threadsByMiniThread.set(thread.id, codexThread);
    return codexThread;
  }

  private *mapEvent(event: ThreadEvent, input: AgentAdapterRunInput): Generator<AgentAdapterStep> {
    if (event.type === "thread.started") {
      yield {
        type: "event",
        eventType: "agent.thread.started",
        payload: {
          externalThreadId: event.thread_id
        }
      };
    } else if (event.type === "turn.started") {
      yield {
        type: "event",
        eventType: "agent.turn.started",
        payload: {}
      };
    } else if (event.type === "turn.completed") {
      yield {
        type: "event",
        eventType: "agent.turn.completed",
        payload: {
          usage: toJsonValue(event.usage)
        }
      };
      yield {
        type: "final"
      };
    } else if (event.type === "turn.failed") {
      yield {
        type: "event",
        eventType: "agent.turn.failed",
        payload: {
          error: toJsonValue(event.error)
        }
      };
      yield {
        type: "error",
        message: event.error.message
      };
    } else if (event.type === "error") {
      yield {
        type: "error",
        message: event.message
      };
    } else {
      const eventType = event.type === "item.started"
        ? "agent.item.started"
        : event.type === "item.updated"
          ? "agent.item.updated"
          : "agent.item.completed";
      yield {
        type: "event",
        eventType,
        payload: {
          item: toJsonValue(event.item)
        }
      };

      if (event.type === "item.completed" && event.item.type === "agent_message") {
        yield {
          type: "message",
          content: event.item.text
        };
      }
    }

    const mapped = this.options.capabilityMapper?.(event, input);
    if (Array.isArray(mapped)) {
      yield* mapped;
    } else if (mapped) {
      yield mapped;
    }
  }
}

export function createCodexSdkAgentAdapter(options: CodexSdkAgentAdapterOptions): CodexSdkAgentAdapter {
  return new CodexSdkAgentAdapter(options);
}

export function createDefaultCodexInput(input: AgentAdapterRunInput): string {
  const sections = [`User request:\n${input.userMessage.content}`];

  if (input.contexts.length > 0) {
    sections.push(`Host context:\n${JSON.stringify(input.contexts.map((context) => ({
      providerName: context.providerName,
      description: context.description,
      value: context.value
    })), null, 2)}`);
  }

  if (input.capabilities.length > 0) {
    sections.push(`Mini Codex host capabilities:\n${input.capabilities.map((capability) => (
      `- ${capability.name}: ${capability.description} (effect: ${capability.effect}, approval: ${capability.approval})`
    )).join("\n")}`);
  }

  return sections.join("\n\n");
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === "object") {
    const output: JsonObject = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined && typeof child !== "function" && typeof child !== "symbol") {
        output[key] = toJsonValue(child);
      }
    }
    return output;
  }

  return String(value);
}
