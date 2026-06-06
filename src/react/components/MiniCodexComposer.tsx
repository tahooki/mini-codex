import { useState, type FormEvent } from "react";

export type MiniCodexComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (content: string) => void | Promise<void>;
};

export function MiniCodexComposer({
  disabled = false,
  placeholder = "Ask Mini Codex...",
  onSubmit
}: MiniCodexComposerProps) {
  const [value, setValue] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = value.trim();
    if (!content || disabled) {
      return;
    }
    await onSubmit(content);
    setValue("");
  }

  return (
    <form className="mc-composer" onSubmit={(event) => void submit(event)}>
      <textarea
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <button disabled={disabled || !value.trim()} type="submit">Send</button>
    </form>
  );
}
