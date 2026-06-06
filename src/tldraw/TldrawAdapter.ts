import { toRichText } from "tldraw";
import type {
  Capability,
  ContextProvider,
  JsonObject,
  JsonValue
} from "../core/index.js";

export type TldrawShapeLike = {
  id: string;
  props?: unknown;
  type: string;
  x?: number;
  y?: number;
};

export type TldrawEditorLike = {
  createShapes(shapes: unknown[]): unknown;
  deleteShapes(ids: unknown[]): unknown;
  getCurrentPageShapes(): TldrawShapeLike[];
  getSelectedShapeIds(): string[];
  getSelectedShapes(): TldrawShapeLike[];
  getSelectionPageBounds?(): null | { h?: number; height?: number; w?: number; width?: number; x: number; y: number };
  select?(...ids: unknown[]): unknown;
  setSelectedShapes?(ids: unknown[]): unknown;
  updateShapes(shapes: unknown[]): unknown;
  zoomToFit?(): unknown;
  zoomToSelection?(): unknown;
};

export type TldrawAdapterOptions = {
  defaultShape?: Partial<TldrawShapeDraft>;
  editor: TldrawEditorLike;
};

export type TldrawAdapter = {
  capabilities: Capability[];
  contextProviders: ContextProvider[];
};

export type TldrawShapeDraft = {
  color?: string;
  h?: number;
  id?: string;
  props?: JsonObject;
  text?: string;
  type?: string;
  w?: number;
  x?: number;
  y?: number;
};

export function createTldrawAdapter(options: TldrawAdapterOptions): TldrawAdapter {
  const { editor } = options;

  const contextProviders: ContextProvider[] = [
    {
      name: "tldraw.canvas",
      description: "Current tldraw canvas summary",
      getContext: () => ({
        shapeCount: editor.getCurrentPageShapes().length,
        shapes: editor.getCurrentPageShapes().map(shapeSummary)
      })
    },
    {
      name: "tldraw.selection",
      description: "Selected tldraw shapes and bounds",
      getContext: () => ({
        bounds: normalizeBounds(editor.getSelectionPageBounds?.() ?? null),
        selectedIds: editor.getSelectedShapeIds(),
        selectedShapes: editor.getSelectedShapes().map(shapeSummary)
      })
    }
  ];

  const capabilities: Capability[] = [
    {
      name: "tldraw.createShapes",
      description: "Create shapes on the tldraw canvas",
      effect: "write",
      approval: "always",
      preview: (input) => {
        const drafts = parseShapeDrafts(input, options.defaultShape);
        return {
          title: `Create ${drafts.length} tldraw shape${drafts.length === 1 ? "" : "s"}`,
          changes: drafts.map((shape) => shape.text ?? shape.type ?? "shape"),
          data: { shapes: drafts }
        };
      },
      run: (input) => {
        const drafts = parseShapeDrafts(input, options.defaultShape);
        const shapes = drafts.map((shape, index) => toTldrawCreateShape(shape, index));
        editor.createShapes(shapes);
        selectCreated(editor, shapes);
        editor.zoomToSelection?.();
        return { createdCount: shapes.length };
      }
    },
    {
      name: "tldraw.updateShapes",
      description: "Update existing tldraw shapes",
      effect: "write",
      approval: "always",
      preview: (input) => {
        const updates = parseShapeDrafts(input);
        return {
          title: `Update ${updates.length} tldraw shape${updates.length === 1 ? "" : "s"}`,
          changes: updates.map((shape) => shape.id ?? "selected shape"),
          data: { shapes: updates }
        };
      },
      run: (input) => {
        const updates = parseShapeDrafts(input);
        const selected = editor.getSelectedShapes();
        const partials = updates.map((draft, index) => toTldrawUpdateShape(draft, selected[index]));
        editor.updateShapes(partials);
        return { updatedCount: partials.length };
      }
    },
    {
      name: "tldraw.deleteShapes",
      description: "Delete tldraw shapes",
      effect: "write",
      approval: "always",
      preview: (input) => {
        const ids = parseIds(input, editor.getSelectedShapeIds());
        return {
          title: `Delete ${ids.length} tldraw shape${ids.length === 1 ? "" : "s"}`,
          changes: ids,
          data: { ids }
        };
      },
      run: (input) => {
        const ids = parseIds(input, editor.getSelectedShapeIds());
        editor.deleteShapes(ids);
        return { deletedCount: ids.length };
      }
    },
    {
      name: "tldraw.organizeSelection",
      description: "Organize selected tldraw shapes into a row or column",
      effect: "write",
      approval: "always",
      preview: (input) => {
        const { direction, gap } = parseOrganizeInput(input);
        const selected = editor.getSelectedShapes();
        return {
          title: `Organize ${selected.length} selected shape${selected.length === 1 ? "" : "s"}`,
          changes: [`Direction: ${direction}`, `Gap: ${gap}`],
          data: { direction, gap, ids: selected.map((shape) => shape.id) }
        };
      },
      run: (input) => {
        const { direction, gap } = parseOrganizeInput(input);
        const selected = editor.getSelectedShapes();
        const origin = selected[0] ?? { x: 0, y: 0 };
        const partials = selected.map((shape, index) => ({
          id: shape.id,
          type: shape.type,
          x: direction === "row" ? (origin.x ?? 0) + index * (shapeWidth(shape) + gap) : origin.x ?? 0,
          y: direction === "column" ? (origin.y ?? 0) + index * (shapeHeight(shape) + gap) : origin.y ?? 0
        }));
        editor.updateShapes(partials);
        return { organizedCount: partials.length };
      }
    }
  ];

  return {
    capabilities,
    contextProviders
  };
}

function parseShapeDrafts(input: JsonValue, defaults: Partial<TldrawShapeDraft> = {}): TldrawShapeDraft[] {
  const object = asObject(input);
  const rawShapes = Array.isArray(object.shapes) ? object.shapes : [object];
  return rawShapes.map((shape, index) => ({
    type: "geo",
    x: 120 + index * 240,
    y: 120,
    w: 200,
    h: 120,
    color: "blue",
    ...defaults,
    ...asObject(shape)
  }));
}

function parseIds(input: JsonValue, fallback: string[]): string[] {
  const object = asObject(input);
  const ids = Array.isArray(object.ids) ? object.ids.filter((id): id is string => typeof id === "string") : [];
  return ids.length > 0 ? ids : fallback;
}

function parseOrganizeInput(input: JsonValue) {
  const object = asObject(input);
  return {
    direction: object.direction === "column" ? "column" as const : "row" as const,
    gap: typeof object.gap === "number" ? object.gap : 32
  };
}

function toTldrawCreateShape(shape: TldrawShapeDraft, index: number): Record<string, unknown> {
  const type = shape.type ?? "geo";
  return {
    ...(shape.id ? { id: shape.id } : {}),
    type,
    x: shape.x ?? 120 + index * 240,
    y: shape.y ?? 120,
    props: propsForShape(type, shape)
  };
}

function toTldrawUpdateShape(draft: TldrawShapeDraft, fallback?: TldrawShapeLike): Record<string, unknown> {
  const type = draft.type ?? fallback?.type ?? "geo";
  return {
    id: draft.id ?? fallback?.id ?? "",
    type,
    ...(typeof draft.x === "number" ? { x: draft.x } : {}),
    ...(typeof draft.y === "number" ? { y: draft.y } : {}),
    props: propsForShape(type, draft, fallback)
  };
}

function propsForShape(type: string, shape: TldrawShapeDraft, fallback?: TldrawShapeLike): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...jsonObjectFromRecord(recordFromUnknown(fallback?.props)),
    ...shape.props
  };
  const fallbackProps = recordFromUnknown(fallback?.props);
  const text = shape.text ?? stringFromUnknown(props.text) ?? stringFromUnknown(fallbackProps?.text);
  if (type === "geo" || type === "text" || type === "note") {
    props.richText = toRichText(text ?? "");
  }
  if (type === "geo") {
    props.color = shape.color ?? stringFromUnknown(props.color) ?? "blue";
    props.geo = stringFromUnknown(props.geo) ?? "rectangle";
    props.h = shape.h ?? numberFromUnknown(props.h) ?? 120;
    props.w = shape.w ?? numberFromUnknown(props.w) ?? 200;
  }
  return props;
}

function selectCreated(editor: TldrawEditorLike, shapes: Array<Record<string, unknown>>) {
  const ids = shapes.map((shape) => shape.id).filter((id): id is string => typeof id === "string");
  if (ids.length > 0) {
    if (editor.setSelectedShapes) {
      editor.setSelectedShapes(ids);
    } else {
      editor.select?.(...ids);
    }
  }
}

function shapeSummary(shape: TldrawShapeLike): JsonObject {
  return {
    id: shape.id,
    props: summarizeProps(recordFromUnknown(shape.props)),
    text: textFromShape(shape),
    type: shape.type,
    x: shape.x ?? 0,
    y: shape.y ?? 0
  };
}

function textFromShape(shape: TldrawShapeLike): string {
  const props = recordFromUnknown(shape.props);
  return stringFromUnknown(props?.text) ?? textFromRichText(props?.richText) ?? "";
}

function textFromRichText(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const fragments: string[] = [];
  collectText(value, fragments);
  return fragments.length > 0 ? fragments.join(" ") : undefined;
}

function collectText(value: unknown, fragments: string[]) {
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "text" && typeof child === "string") {
      fragments.push(child);
    } else if (Array.isArray(child)) {
      for (const item of child) {
        collectText(item, fragments);
      }
    } else {
      collectText(child, fragments);
    }
  }
}

function summarizeProps(props: Record<string, unknown> | undefined): JsonObject {
  return {
    color: stringFromUnknown(props?.color) ?? "",
    geo: stringFromUnknown(props?.geo) ?? "",
    h: numberFromUnknown(props?.h) ?? 0,
    w: numberFromUnknown(props?.w) ?? 0
  };
}

function normalizeBounds(bounds: null | { h?: number; height?: number; w?: number; width?: number; x: number; y: number }): JsonObject | null {
  if (!bounds) {
    return null;
  }
  return {
    h: bounds.h ?? bounds.height ?? 0,
    w: bounds.w ?? bounds.width ?? 0,
    x: bounds.x,
    y: bounds.y
  };
}

function shapeWidth(shape: TldrawShapeLike): number {
  return numberFromUnknown(recordFromUnknown(shape.props)?.w) ?? 200;
}

function shapeHeight(shape: TldrawShapeLike): number {
  return numberFromUnknown(recordFromUnknown(shape.props)?.h) ?? 120;
}

function asObject(value: JsonValue | unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

function jsonObjectFromRecord(value: Record<string, unknown> | undefined): JsonObject {
  if (!value) {
    return {};
  }
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      child === null ||
      typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "boolean" ||
      Array.isArray(child) ||
      typeof child === "object"
    ) {
      output[key] = child as JsonValue;
    }
  }
  return output;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
