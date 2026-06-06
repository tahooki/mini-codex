import { MiniCodexRuntime, type MiniCodexRuntimeOptions } from "./runtime.js";

export type CreateMiniCodexOptions = MiniCodexRuntimeOptions;

export function createMiniCodex(options: CreateMiniCodexOptions = {}): MiniCodexRuntime {
  return new MiniCodexRuntime(options);
}
