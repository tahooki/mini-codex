import { app, BrowserWindow, ipcMain } from "electron";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const safeRoot = () => path.join(app.getPath("documents"), "mini-codex-todo-dashboard");

function safePath(requestPath: string) {
  const root = safeRoot();
  const resolved = path.resolve(root, requestPath || "board.json");
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes the Mini Codex todo dashboard folder.");
  }
  return resolved;
}

async function ensureRoot() {
  await mkdir(safeRoot(), { recursive: true });
}

async function createWindow() {
  await ensureRoot();
  const window = new BrowserWindow({
    height: 860,
    minHeight: 720,
    minWidth: 1100,
    title: "Mini Codex Todo Dashboard",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(dirname, "preload.js")
    },
    width: 1360
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    await window.loadURL(devServer);
  } else {
    await window.loadFile(path.join(dirname, "../dist/index.html"));
  }
}

ipcMain.handle("mini-codex:get-project-context", async () => {
  await ensureRoot();
  return {
    name: "Mini Codex Todo Dashboard",
    rootPath: safeRoot(),
    selectedPath: safePath("board.json"),
    recentFiles: ["board.json"]
  };
});

ipcMain.handle("mini-codex:list-directory", async (_event, requestPath: string) => {
  await ensureRoot();
  const entries = await readdir(safePath(requestPath), { withFileTypes: true }).catch(async () => readdir(safeRoot(), { withFileTypes: true }));
  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? "directory" : "file"
  }));
});

ipcMain.handle("mini-codex:read-text-file", async (_event, requestPath: string) => {
  await ensureRoot();
  return await readFile(safePath(requestPath), "utf8");
});

ipcMain.handle("mini-codex:write-text-file", async (_event, requestPath: string, content: string) => {
  await ensureRoot();
  const targetPath = safePath(requestPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
  return {
    ok: true,
    path: targetPath,
    bytes: Buffer.byteLength(content)
  };
});

ipcMain.handle("mini-codex:open-project", async (_event, requestPath: string) => {
  await ensureRoot();
  return {
    ok: true,
    path: safePath(requestPath)
  };
});

app.whenReady().then(() => {
  void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
