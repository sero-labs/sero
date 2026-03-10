/**
 * PresetCard — thumbnail card for a theme preset in the browser grid.
 */

import type { ThemePresetMeta } from '@/types/theme';

interface PresetCardProps {
  preset: ThemePresetMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function PresetCard({ preset, isActive, onSelect, onDelete }: PresetCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(preset.id)}
      className={`
        group relative flex flex-col items-start gap-1 rounded-lg border p-3
        transition-colors text-left w-full
        ${isActive
          ? 'border-[var(--border-focus)] bg-[var(--accent-muted)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)]'
        }
      `}
    >
      <span className="text-sm font-medium text-[var(--text-primary)] truncate w-full">
        {preset.name}
      </span>
      {preset.description && (
        <span className="text-xs text-[var(--text-muted)] truncate w-full">
          {preset.description}
        </span>
      )}
      {preset.author && (
        <span className="text-xs text-[var(--text-muted)]">
          by {preset.author}
        </span>
      )}
      <div className="flex items-center gap-1 mt-1">
        {preset.builtin && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            Built-in
          </span>
        )}
        {isActive && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--status-success-muted)] text-[var(--status-success)]">
            Active
          </span>
        )}
      </div>

      {onDelete && !preset.builtin && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(preset.id);
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded
            text-[var(--text-muted)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-muted)]
            transition-opacity"
          title="Delete theme"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </button>
  );
}
