import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("miniCodex", {
  getProjectContext: () => ipcRenderer.invoke("mini-codex:get-project-context"),
  listDirectory: (path: string) => ipcRenderer.invoke("mini-codex:list-directory", path),
  openProject: (path: string) => ipcRenderer.invoke("mini-codex:open-project", path),
  readTextFile: (path: string) => ipcRenderer.invoke("mini-codex:read-text-file", path),
  writeTextFile: (path: string, content: string) => ipcRenderer.invoke("mini-codex:write-text-file", path, content)
});
