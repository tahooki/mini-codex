import type { TodoCard, TodoColumn } from "./types.js";

export const todoColumns: TodoColumn[] = [
  { id: "inbox", title: "Inbox" },
  { id: "doing", title: "Doing" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" }
];

export const initialTodoCards: TodoCard[] = [
  {
    id: "task-foundation-docs",
    title: "Finalize Mini Codex design baseline",
    description: "Define tokens, component rules, and the UI redesign checklist before polishing screens.",
    priority: "high",
    status: "doing",
    labels: ["design", "foundation"],
    owner: "TH",
    dueDate: "2026-06-07",
    checklist: [
      { id: "task-foundation-docs-1", text: "Design tokens", done: true },
      { id: "task-foundation-docs-2", text: "Component rules", done: true },
      { id: "task-foundation-docs-3", text: "Screenshot checklist", done: false }
    ]
  },
  {
    id: "task-approval-preview",
    title: "Make approvals readable",
    description: "Replace raw capability payloads with human-readable change previews and clear actions.",
    priority: "high",
    status: "review",
    labels: ["approval", "runtime"],
    owner: "CX",
    dueDate: "2026-06-08",
    checklist: [
      { id: "task-approval-preview-1", text: "Pending state", done: true },
      { id: "task-approval-preview-2", text: "Approved state", done: false }
    ]
  },
  {
    id: "task-electron-demo",
    title: "Plan Electron todo demo",
    description: "Wrap the board in a desktop shell and save approved board mutations locally.",
    priority: "medium",
    status: "inbox",
    labels: ["electron", "local-first"],
    owner: "TH",
    dueDate: "2026-06-12",
    checklist: [
      { id: "task-electron-demo-1", text: "Preload bridge", done: false },
      { id: "task-electron-demo-2", text: "Save approval", done: false }
    ]
  },
  {
    id: "task-tldraw-polish",
    title: "Make tldraw canvas-first",
    description: "Reduce side-panel weight and show shape mutation previews without raw selection dumps.",
    priority: "medium",
    status: "doing",
    labels: ["tldraw", "canvas"],
    owner: "CX",
    checklist: [
      { id: "task-tldraw-polish-1", text: "Selection summary", done: false },
      { id: "task-tldraw-polish-2", text: "Visual preview", done: false }
    ]
  },
  {
    id: "task-package-smoke",
    title: "Package smoke install",
    description: "Install the tarball in a fresh app and verify all public exports still resolve.",
    priority: "low",
    status: "done",
    labels: ["release"],
    owner: "TH",
    checklist: [
      { id: "task-package-smoke-1", text: "Core import", done: true },
      { id: "task-package-smoke-2", text: "React render", done: true }
    ]
  }
];
