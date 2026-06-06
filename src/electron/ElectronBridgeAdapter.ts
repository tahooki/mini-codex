import type {
  Capability,
  ContextProvider,
  JsonObject,
  JsonValue
} from "../core/index.js";

export type ElectronProjectContext = {
  name?: string;
  rootPath?: string;
  selectedPath?: string;
  recentFiles?: string[];
};

export type ElectronMiniCodexBridge = {
  getProjectContext?: () => Promise<ElectronProjectContext> | ElectronProjectContext;
  listDirectory?: (path: string) => Promise<JsonValue> | JsonValue;
  openProject?: (path: string) => Promise<JsonValue> | JsonValue;
  readTextFile?: (path: string) => Promise<string> | string;
  writeTextFile?: (path: string, content: string) => Promise<JsonValue> | JsonValue;
};

export type ElectronBridgeAdapterOptions = {
  bridge: ElectronMiniCodexBridge;
  requireApprovalForReads?: boolean;
};

export type ElectronBridgeAdapter = {
  capabilities: Capability[];
  contextProviders: ContextProvider[];
};

export function createElectronBridgeAdapter(options: ElectronBridgeAdapterOptions): ElectronBridgeAdapter {
  const { bridge } = options;
  const readApproval = options.requireApprovalForReads ? "always" : "never";

  const contextProviders: ContextProvider[] = [
    {
      name: "electron.project",
      description: "Current Electron host project context",
      getContext: async () => bridge.getProjectContext ? normalizeProjectContext(await bridge.getProjectContext()) : {}
    }
  ];

  const capabilities: Capability[] = [
    {
      name: "electron.openProject",
      description: "Open a local project in the Electron host",
      effect: "local",
      approval: "always",
      preview: (input) => {
        const { path } = parsePathInput(input);
        return {
          title: `Open project ${path}`,
          description: "Requests the host app to open a local project path.",
          changes: [path],
          data: { path }
        };
      },
      run: async (input) => {
        requireBridgeMethod(bridge.openProject, "openProject");
        const { path } = parsePathInput(input);
        return await bridge.openProject(path);
      }
    },
    {
      name: "electron.listDirectory",
      description: "List a directory through the Electron host bridge",
      effect: "local",
      approval: readApproval,
      preview: (input) => {
        const { path } = parsePathInput(input);
        return {
          title: `List directory ${path}`,
          data: { path }
        };
      },
      run: async (input) => {
        requireBridgeMethod(bridge.listDirectory, "listDirectory");
        const { path } = parsePathInput(input);
        return await bridge.listDirectory(path);
      }
    },
    {
      name: "electron.readTextFile",
      description: "Read a text file through the Electron host bridge",
      effect: "local",
      approval: readApproval,
      preview: (input) => {
        const { path } = parsePathInput(input);
        return {
          title: `Read ${path}`,
          data: { path }
        };
      },
      run: async (input) => {
        requireBridgeMethod(bridge.readTextFile, "readTextFile");
        const { path } = parsePathInput(input);
        const content = await bridge.readTextFile(path);
        return {
          content,
          path
        };
      }
    },
    {
      name: "electron.writeTextFile",
      description: "Write a text file through the Electron host bridge",
      effect: "write",
      approval: "always",
      preview: (input) => {
        const { content, path } = parseWriteInput(input);
        return {
          title: `Write ${path}`,
          description: "Requests a filesystem mutation through the host bridge.",
          changes: [`${content.length} characters`],
          data: { path }
        };
      },
      run: async (input) => {
        requireBridgeMethod(bridge.writeTextFile, "writeTextFile");
        const { content, path } = parseWriteInput(input);
        return await bridge.writeTextFile(path, content);
      }
    }
  ];

  return {
    capabilities,
    contextProviders
  };
}

export const createElectronBridge = createElectronBridgeAdapter;

function normalizeProjectContext(context: ElectronProjectContext): JsonObject {
  return {
    ...(context.name ? { name: context.name } : {}),
    ...(context.rootPath ? { rootPath: context.rootPath } : {}),
    ...(context.selectedPath ? { selectedPath: context.selectedPath } : {}),
    ...(context.recentFiles ? { recentFiles: context.recentFiles } : {})
  };
}

function parsePathInput(input: JsonValue): { path: string } {
  const object = asObject(input);
  const path = typeof object.path === "string" ? object.path : "";
  if (!path) {
    throw new Error("path is required");
  }
  return { path };
}

function parseWriteInput(input: JsonValue): { content: string; path: string } {
  const object = asObject(input);
  const { path } = parsePathInput(input);
  const content = typeof object.content === "string" ? object.content : "";
  return { content, path };
}

function requireBridgeMethod<T extends (...args: never[]) => unknown>(method: T | undefined, name: string): asserts method is T {
  if (!method) {
    throw new Error(`Electron bridge method is not available: ${name}`);
  }
}

function asObject(value: JsonValue): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
