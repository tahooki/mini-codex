import { createContext, useContext, type ReactNode } from "react";
import type { MiniCodexRuntime } from "../core/index.js";

const MiniCodexContext = createContext<MiniCodexRuntime | null>(null);

export type MiniCodexProviderProps = {
  runtime: MiniCodexRuntime;
  children: ReactNode;
};

export function MiniCodexProvider({ runtime, children }: MiniCodexProviderProps) {
  return (
    <MiniCodexContext.Provider value={runtime}>
      {children}
    </MiniCodexContext.Provider>
  );
}

export function useMiniCodexContext(): MiniCodexRuntime {
  const runtime = useContext(MiniCodexContext);
  if (!runtime) {
    throw new Error("MiniCodexProvider is required.");
  }
  return runtime;
}
