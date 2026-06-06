import { describe, expect, it } from "vitest";
import { createMiniCodex, MockAgentAdapter, type AgentAdapterStep } from "../../src/core/index.js";
import { createElectronBridgeAdapter, type ElectronMiniCodexBridge } from "../../src/electron/index.js";

describe("createElectronBridgeAdapter", () => {
  it("collects project context from a narrow host bridge", async () => {
    const bridge: ElectronMiniCodexBridge = {
      getProjectContext: () => ({
        name: "Demo project",
        rootPath: "/tmp/demo",
        selectedPath: "/tmp/demo/src/app.ts"
      })
    };
    const adapter = createElectronBridgeAdapter({ bridge });
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter(),
      contextProviders: adapter.contextProviders
    });

    await runtime.sendMessage({ content: "Inspect project" });

    expect(runtime.snapshot().contexts[0]?.value).toEqual({
      name: "Demo project",
      rootPath: "/tmp/demo",
      selectedPath: "/tmp/demo/src/app.ts"
    });
  });

  it("requires approval before filesystem writes", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const bridge: ElectronMiniCodexBridge = {
      writeTextFile: (path, content) => {
        writes.push({ content, path });
        return { ok: true };
      }
    };
    const adapter = createElectronBridgeAdapter({ bridge });
    const steps: AgentAdapterStep[] = [
      {
        type: "capability_request",
        capabilityName: "electron.writeTextFile",
        input: {
          content: "hello",
          path: "/tmp/demo/notes.txt"
        }
      }
    ];
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({ steps }),
      capabilities: adapter.capabilities
    });

    const run = await runtime.sendMessage({ content: "Save file" });

    expect(run.status).toBe("awaiting_approval");
    expect(writes).toEqual([]);

    await runtime.approveApproval(runtime.snapshot().approvals[0]?.id ?? "");

    expect(writes).toEqual([
      {
        content: "hello",
        path: "/tmp/demo/notes.txt"
      }
    ]);
  });

  it("can require approval for local reads when configured", async () => {
    const bridge: ElectronMiniCodexBridge = {
      readTextFile: () => "secret-ish content"
    };
    const adapter = createElectronBridgeAdapter({
      bridge,
      requireApprovalForReads: true
    });
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          {
            type: "capability_request",
            capabilityName: "electron.readTextFile",
            input: { path: "/tmp/demo/private.txt" }
          }
        ]
      }),
      capabilities: adapter.capabilities
    });

    await runtime.sendMessage({ content: "Read file" });

    expect(runtime.snapshot().approvals).toHaveLength(1);
    expect(runtime.snapshot().capabilityRequests[0]?.status).toBe("awaiting_approval");
  });

  it("reports missing bridge methods as capability failures", async () => {
    const adapter = createElectronBridgeAdapter({ bridge: {} });
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          {
            type: "capability_request",
            capabilityName: "electron.listDirectory",
            input: { path: "/tmp/demo" }
          }
        ]
      }),
      capabilities: adapter.capabilities
    });

    await runtime.sendMessage({ content: "List files" });

    expect(runtime.snapshot().capabilityRequests[0]?.status).toBe("failed");
    expect(runtime.snapshot().runs[0]?.status).toBe("failed");
  });
});
