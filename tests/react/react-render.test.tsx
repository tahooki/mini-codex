import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MockAgentAdapter, createMiniCodex } from "../../src/core/index.js";
import { createDefaultOrchestrator } from "../../src/orchestration/index.js";
import { MiniCodexPanel, MiniCodexProvider, MiniCodexWorkbench } from "../../src/react/index.js";

describe("React surface", () => {
  it("renders the default panel from a runtime", () => {
    const runtime = createMiniCodex();
    runtime.createThread({ title: "Demo" });

    const html = renderToStaticMarkup(
      <MiniCodexProvider runtime={runtime}>
        <MiniCodexPanel />
      </MiniCodexProvider>
    );

    expect(html).toContain("Mini Codex");
    expect(html).toContain("Demo");
  });

  it("renders pending approvals", async () => {
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          { type: "capability_request", capabilityName: "host.write", input: { title: "Plan" } }
        ]
      }),
      capabilities: [
        {
          name: "host.write",
          description: "Write to host state",
          effect: "write",
          approval: "always",
          preview: () => ({ title: "Write Plan" }),
          run: () => ({ ok: true })
        }
      ]
    });

    await runtime.sendMessage({ content: "Write the plan" });
    const html = renderToStaticMarkup(
      <MiniCodexProvider runtime={runtime}>
        <MiniCodexPanel />
      </MiniCodexProvider>
    );

    expect(html).toContain("Write Plan");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
  });

  it("renders the workbench slots", () => {
    const runtime = createMiniCodex();
    const html = renderToStaticMarkup(
      <MiniCodexProvider runtime={runtime}>
        <MiniCodexWorkbench center={<div>Host workspace</div>} />
      </MiniCodexProvider>
    );

    expect(html).toContain("Host workspace");
    expect(html).toContain("Info");
  });

  it("renders orchestration decisions when a runtime has a graph", async () => {
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter(),
      orchestrator: createDefaultOrchestrator()
    });

    await runtime.sendMessage({ content: "Create a card for release notes" });
    const html = renderToStaticMarkup(
      <MiniCodexProvider runtime={runtime}>
        <MiniCodexPanel />
      </MiniCodexProvider>
    );

    expect(html).toContain("Decision");
    expect(html).toContain("Propose host change");
    expect(html).toContain("capability");
  });

  it("projects context and capabilities into the inspector", async () => {
    const runtime = createMiniCodex({
      contextProviders: [
        {
          name: "selection",
          getContext: () => ({ id: "shape_1" })
        }
      ],
      capabilities: [
        {
          name: "canvas.rename",
          description: "Rename selected canvas items",
          run: (input) => input
        }
      ]
    });

    await runtime.sendMessage({ content: "Inspect selection" });
    const html = renderToStaticMarkup(
      <MiniCodexProvider runtime={runtime}>
        <MiniCodexWorkbench center={<div>Host workspace</div>} />
      </MiniCodexProvider>
    );

    expect(html).toContain("selection");
    expect(html).toContain("canvas.rename");
  });
});
