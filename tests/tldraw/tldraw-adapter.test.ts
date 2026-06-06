import { describe, expect, it } from "vitest";
import { createMiniCodex, MockAgentAdapter, type AgentAdapterStep } from "../../src/core/index.js";
import { createTldrawAdapter, type TldrawEditorLike, type TldrawShapeLike } from "../../src/tldraw/index.js";

function createFakeEditor(initialShapes: TldrawShapeLike[] = []) {
  let shapes = [...initialShapes];
  let selectedIds = shapes[0] ? [shapes[0].id] : [];
  const editor: TldrawEditorLike = {
    createShapes: (nextShapes) => {
      shapes = [...shapes, ...nextShapes as TldrawShapeLike[]];
    },
    deleteShapes: (ids) => {
      shapes = shapes.filter((shape) => !ids.includes(shape.id));
      selectedIds = selectedIds.filter((id) => !ids.includes(id));
    },
    getCurrentPageShapes: () => shapes,
    getSelectedShapeIds: () => selectedIds,
    getSelectedShapes: () => shapes.filter((shape) => selectedIds.includes(shape.id)),
    getSelectionPageBounds: () => ({ h: 100, w: 100, x: 0, y: 0 }),
    setSelectedShapes: (ids) => {
      selectedIds = ids.filter((id): id is string => typeof id === "string");
    },
    updateShapes: (partials) => {
      shapes = shapes.map((shape) => {
        const partial = (partials as Array<Partial<TldrawShapeLike>>).find((candidate) => candidate.id === shape.id);
        const shapeProps = typeof shape.props === "object" && shape.props !== null ? shape.props : {};
        const partialProps = typeof partial?.props === "object" && partial.props !== null ? partial.props : {};
        return partial ? { ...shape, ...partial, props: { ...shapeProps, ...partialProps } } : shape;
      });
    }
  };
  return {
    editor,
    getSelectedIds: () => selectedIds,
    getShapes: () => shapes
  };
}

describe("createTldrawAdapter", () => {
  it("collects canvas and selection context", async () => {
    const fake = createFakeEditor([
      {
        id: "shape_1",
        props: { color: "blue", h: 80, text: "Milestone", w: 120 },
        type: "geo",
        x: 10,
        y: 20
      }
    ]);
    const adapter = createTldrawAdapter({ editor: fake.editor });
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter(),
      contextProviders: adapter.contextProviders
    });

    await runtime.sendMessage({ content: "Summarize canvas" });
    const contextNames = runtime.snapshot().contexts.map((context) => context.providerName);

    expect(contextNames).toEqual(["tldraw.canvas", "tldraw.selection"]);
    expect(runtime.snapshot().contexts[0]?.value).toMatchObject({
      shapeCount: 1
    });
  });

  it("creates shapes only after approval", async () => {
    const fake = createFakeEditor();
    const adapter = createTldrawAdapter({ editor: fake.editor });
    const steps: AgentAdapterStep[] = [
      {
        type: "capability_request",
        capabilityName: "tldraw.createShapes",
        input: {
          shapes: [
            {
              id: "shape_created",
              text: "Created by agent"
            }
          ]
        }
      }
    ];
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({ steps }),
      capabilities: adapter.capabilities
    });

    await runtime.sendMessage({ content: "Create a shape" });

    expect(fake.getShapes()).toHaveLength(0);

    await runtime.approveApproval(runtime.snapshot().approvals[0]?.id ?? "");

    expect(fake.getShapes()).toHaveLength(1);
    expect(fake.getSelectedIds()).toEqual(["shape_created"]);
  });

  it("rejecting delete leaves shapes unchanged", async () => {
    const fake = createFakeEditor([
      {
        id: "shape_1",
        props: { text: "Keep me" },
        type: "geo"
      }
    ]);
    const adapter = createTldrawAdapter({ editor: fake.editor });
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          {
            type: "capability_request",
            capabilityName: "tldraw.deleteShapes",
            input: { ids: ["shape_1"] }
          }
        ]
      }),
      capabilities: adapter.capabilities
    });

    await runtime.sendMessage({ content: "Delete the shape" });
    await runtime.rejectApproval(runtime.snapshot().approvals[0]?.id ?? "");

    expect(fake.getShapes()).toHaveLength(1);
    expect(runtime.snapshot().runs[0]?.status).toBe("failed");
  });

  it("organizes selected shapes after approval", async () => {
    const fake = createFakeEditor([
      { id: "shape_1", props: { h: 80, w: 100 }, type: "geo", x: 0, y: 0 },
      { id: "shape_2", props: { h: 80, w: 100 }, type: "geo", x: 0, y: 0 }
    ]);
    fake.editor.setSelectedShapes?.(["shape_1", "shape_2"]);
    const adapter = createTldrawAdapter({ editor: fake.editor });
    const runtime = createMiniCodex({
      agent: new MockAgentAdapter({
        steps: [
          {
            type: "capability_request",
            capabilityName: "tldraw.organizeSelection",
            input: { direction: "row", gap: 20 }
          }
        ]
      }),
      capabilities: adapter.capabilities
    });

    await runtime.sendMessage({ content: "Organize selected shapes" });
    await runtime.approveApproval(runtime.snapshot().approvals[0]?.id ?? "");

    expect(fake.getShapes()[1]?.x).toBe(120);
  });
});
