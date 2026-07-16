import { memo } from 'react';

interface ThemeEditorDetailsSectionProps {
  description: string;
  name: string;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
}

export const ThemeEditorDetailsSection = memo(function ThemeEditorDetailsSection({
  description,
  name,
  onDescriptionChange,
  onNameChange,
}: ThemeEditorDetailsSectionProps) {
  return (
    <div className="shrink-0 flex flex-col gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
      <input aria-label="Theme name"
        type="text"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Theme name..."
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-base font-medium text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
      />
      <input aria-label="Theme description"
        type="text"
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="Description (optional)"
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--border-focus)]"
      />
    </div>
  );
});
