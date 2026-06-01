import type { ThemeEditorDraft } from './types';

interface ThemeEditorDetailsSectionProps {
  draft: ThemeEditorDraft;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
}

export function ThemeEditorDetailsSection({
  draft,
  onDescriptionChange,
  onNameChange,
}: ThemeEditorDetailsSectionProps) {
  return (
    <div className="shrink-0 flex flex-col gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
      <input aria-label="Text input"
        type="text"
        value={draft.name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Theme name..."
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
      />
      <input aria-label="Text input"
        type="text"
        value={draft.description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="Description (optional)"
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--border-focus)]"
      />
    </div>
  );
}
