import type { ReactNode } from "react";
import { MiniCodexInspector } from "./MiniCodexInspector.js";
import { MiniCodexPanel } from "./MiniCodexPanel.js";

export type MiniCodexWorkbenchProps = {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  top?: ReactNode;
};

export function MiniCodexWorkbench({ left, center, right, top }: MiniCodexWorkbenchProps) {
  return (
    <div className="mc-workbench mc-theme">
      {top ? <div className="mc-workbench-top">{top}</div> : null}
      <div className="mc-workbench-main">
        <div className="mc-workbench-left">
          {left ?? <MiniCodexPanel />}
        </div>
        <main className="mc-workbench-center">
          {center}
        </main>
        <div className="mc-workbench-right">
          {right ?? <MiniCodexInspector />}
        </div>
      </div>
    </div>
  );
}
