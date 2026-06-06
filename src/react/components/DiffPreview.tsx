export type DiffPreviewProps = {
  changes?: string[] | undefined;
};

export function DiffPreview({ changes = [] }: DiffPreviewProps) {
  if (changes.length === 0) {
    return null;
  }

  return (
    <ul className="mc-diff-preview">
      {changes.map((change) => <li className="mc-change-row" key={change}>{change}</li>)}
    </ul>
  );
}
