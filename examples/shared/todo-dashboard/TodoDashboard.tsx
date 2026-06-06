import type { TodoAppTopBarProps, TodoCard, TodoDashboardProps, TodoInspectorProps } from "./types.js";
import { checklistProgress, extractPendingCards, isOverdue } from "./utils.js";

export function TodoAppTopBar({ cards, onCommand, title = "Mini Codex Tasks" }: TodoAppTopBarProps) {
  const activeCount = cards.filter((card) => card.status !== "done").length;
  const overdueCount = cards.filter(isOverdue).length;

  return (
    <header className="todo-topbar">
      <div className="todo-topbar-title">
        <strong>{title}</strong>
        <span>{activeCount} active tasks · {overdueCount} needs attention</span>
      </div>
      <div className="todo-topbar-actions" aria-label="Board commands">
        <button type="button" onClick={() => onCommand("Break down the Mini Codex UI redesign into implementation cards")}>
          Break down
        </button>
        <button type="button" onClick={() => onCommand("Plan this week sprint from the current board")}>
          Plan sprint
        </button>
        <button type="button" onClick={() => onCommand("Move the approval preview work into review")}>
          Move review
        </button>
      </div>
    </header>
  );
}

export function TodoDashboard({ cards, columns, pendingCards = [], selectedId, onSelectCard }: TodoDashboardProps) {
  const allCards = [...cards, ...pendingCards];

  return (
    <main className="todo-dashboard" aria-label="Task-board workspace">
      <section className="todo-board" aria-label="Todo board">
        {columns.map((column) => {
          const columnCards = allCards.filter((card) => card.status === column.id);
          return (
            <section className="todo-column" key={column.id} aria-label={column.title}>
              <header className="todo-column-header">
                <strong>{column.title}</strong>
                <span>{columnCards.length}</span>
              </header>
              <div className="todo-card-list">
                {columnCards.length === 0 ? <p className="todo-empty">No cards</p> : null}
                {columnCards.map((card) => (
                  <TaskCard
                    card={card}
                    isSelected={card.id === selectedId}
                    key={card.id}
                    onSelect={onSelectCard}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}

export function TodoInspector({ cards, columns, selectedId, snapshot }: TodoInspectorProps) {
  const selected = cards.find((card) => card.id === selectedId);
  const pendingApprovals = snapshot.approvals.filter((approval) => approval.status === "pending");
  const pendingCards = extractPendingCards(pendingApprovals);
  const overdue = cards.filter(isOverdue);

  return (
    <aside className="todo-inspector" aria-label="Todo inspector">
      <header className="todo-inspector-header">
        <div>
          <h2>Board info</h2>
          <span>{cards.length} cards · {columns.length} columns</span>
        </div>
      </header>
      <section className="todo-inspector-section">
        <h3>Selected card</h3>
        {selected ? (
          <article className="todo-detail">
            <div className="todo-detail-heading">
              <strong>{selected.title}</strong>
              <span className="todo-priority" data-priority={selected.priority}>{selected.priority}</span>
            </div>
            <p>{selected.description}</p>
            <div className="todo-meta-grid">
              <span>Owner {selected.owner ?? "Unassigned"}</span>
              <span>Due {selected.dueDate ?? "None"}</span>
              <span>Checklist {checklistProgress(selected)}</span>
              <span>Status {columnTitle(columns, selected.status)}</span>
            </div>
            <div className="todo-label-row">
              {selected.labels.map((label) => <span className="todo-label" key={label}>{label}</span>)}
            </div>
          </article>
        ) : <p className="todo-muted">Select a card to inspect it.</p>}
      </section>
      <section className="todo-inspector-section">
        <h3>Proposed changes</h3>
        {pendingCards.length === 0 ? <p className="todo-muted">No pending board changes.</p> : null}
        {pendingCards.map((card) => (
          <article className="todo-change" key={card.id}>
            <span className="todo-kicker">Pending create</span>
            <strong>{card.title}</strong>
            <p>{card.description}</p>
          </article>
        ))}
      </section>
      <section className="todo-inspector-section">
        <h3>Board health</h3>
        <div className="todo-health-grid">
          <span>{cards.filter((card) => card.priority === "high").length} high priority</span>
          <span>{overdue.length} overdue</span>
          <span>{cards.filter((card) => card.status === "review").length} in review</span>
          <span>{cards.filter((card) => card.status === "done").length} done</span>
        </div>
      </section>
      <section className="todo-inspector-section">
        <h3>Activity</h3>
        <div className="todo-activity">
          {snapshot.events.slice(-6).map((event) => (
            <div className="todo-activity-row" key={event.id}>
              <span>{event.type}</span>
              <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
          ))}
        </div>
      </section>
      <section className="todo-inspector-section">
        <details className="todo-debug">
          <summary>Developer data</summary>
          <pre>{JSON.stringify({ approvals: snapshot.approvals, contexts: snapshot.contexts }, null, 2)}</pre>
        </details>
      </section>
    </aside>
  );
}

function TaskCard({ card, isSelected, onSelect }: { card: TodoCard; isSelected: boolean; onSelect: (cardId: string) => void }) {
  const isPending = card.agentState === "pending";

  return (
    <button
      className={isPending ? "todo-card todo-card-pending" : isSelected ? "todo-card todo-card-selected" : "todo-card"}
      onClick={() => onSelect(card.id)}
      type="button"
    >
      <div className="todo-card-top">
        <span className="todo-priority" data-priority={card.priority}>{card.priority}</span>
        {isPending ? <span className="todo-agent-state">pending</span> : null}
      </div>
      <strong>{card.title}</strong>
      <p>{card.description}</p>
      <div className="todo-label-row">
        {card.labels.map((label) => <span className="todo-label" key={label}>{label}</span>)}
      </div>
      <div className="todo-card-footer">
        <span>{card.owner ?? "Unassigned"}</span>
        <span>{card.dueDate ?? "No due date"}</span>
        <span>{checklistProgress(card)}</span>
      </div>
    </button>
  );
}

function columnTitle(columns: Array<{ id: string; title: string }>, id: string) {
  return columns.find((column) => column.id === id)?.title ?? id;
}
