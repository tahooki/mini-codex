import type { ApprovalRequest, MiniCodexSnapshot } from "mini-codex";

export type TodoColumnId = "inbox" | "doing" | "review" | "done";

export type TodoPriority = "low" | "medium" | "high";

export type TodoChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TodoCard = {
  id: string;
  title: string;
  description: string;
  priority: TodoPriority;
  status: TodoColumnId;
  labels: string[];
  owner?: string;
  dueDate?: string;
  checklist: TodoChecklistItem[];
  agentState?: "none" | "pending" | "approved" | "rejected";
};

export type TodoColumn = {
  id: TodoColumnId;
  title: string;
};

export type PendingTodoCard = TodoCard & {
  pendingApprovalId: string;
};

export type TodoDashboardProps = {
  cards: TodoCard[];
  columns: TodoColumn[];
  pendingCards?: PendingTodoCard[];
  selectedId?: string;
  onSelectCard: (cardId: string) => void;
};

export type TodoInspectorProps = {
  cards: TodoCard[];
  columns: TodoColumn[];
  selectedId?: string;
  snapshot: MiniCodexSnapshot;
};

export type TodoAppTopBarProps = {
  cards: TodoCard[];
  onCommand: (prompt: string) => void;
  title?: string;
};

export type TodoCardInput = {
  title?: string;
  description?: string;
  priority?: TodoPriority;
  status?: TodoColumnId;
  labels?: string[];
  owner?: string;
  dueDate?: string;
  checklist?: string[];
};

export type TodoCreateCardsInput = {
  cards?: TodoCardInput[];
};

export type TodoUpdateCardInput = {
  cardId?: string;
  title?: string;
  description?: string;
  priority?: TodoPriority;
  labels?: string[];
  owner?: string;
  dueDate?: string;
};

export type TodoMoveCardInput = {
  cardId?: string;
  status?: TodoColumnId;
};

export type TodoDeleteCardInput = {
  cardId?: string;
};

export type TodoChecklistInput = {
  cardId?: string;
  items?: string[];
};

export type TodoPlanSprintInput = {
  cards?: TodoCardInput[];
};

export type TodoPendingApproval = ApprovalRequest & {
  input: TodoCreateCardsInput;
};
