import type { ElectronMiniCodexBridge } from "mini-codex/electron";

declare global {
  interface Window {
    miniCodex?: ElectronMiniCodexBridge;
  }
}
