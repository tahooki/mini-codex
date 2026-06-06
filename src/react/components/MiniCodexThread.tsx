import type { MiniCodexMessage } from "../../core/index.js";

export type MiniCodexThreadProps = {
  messages: MiniCodexMessage[];
};

export function MiniCodexThread({ messages }: MiniCodexThreadProps) {
  if (messages.length === 0) {
    return (
      <div className="mc-empty-thread">
        <strong>Mini Codex</strong>
        <span>Ready.</span>
      </div>
    );
  }

  return (
    <div className="mc-thread" aria-label="Mini Codex thread">
      {messages.map((message) => (
        <article className="mc-message" data-role={message.role} key={message.id}>
          <span className="mc-kicker">{labelForRole(message.role)}</span>
          <p>{message.content}</p>
        </article>
      ))}
    </div>
  );
}

function labelForRole(role: MiniCodexMessage["role"]) {
  if (role === "assistant") {
    return "Mini Codex";
  }
  if (role === "user") {
    return "You";
  }
  if (role === "tool") {
    return "Tool";
  }
  return "System";
}
