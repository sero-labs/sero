/**
 * PresetCard, thumbnail card for a theme preset in the browser grid.
 * Shows name, description, author, active/builtin badges.
 * Actions: select, edit (custom or duplicate builtin), delete.
 */

import { IconAction } from '@/components/ui/IconAction';
import type { ThemePresetMeta } from '@/types/theme';

interface PresetCardProps {
  preset: ThemePresetMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
}

export function PresetCard({ preset, isActive, onSelect, onDelete, onEdit }: PresetCardProps) {
  return (
    <div
      className={`
        group relative flex flex-col items-start gap-1 rounded-lg border p-3
        transition-colors text-left w-full
        ${isActive
          ? 'border-[var(--border-focus)] bg-[var(--accent-muted)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)]'
        }
      `}
    >
      {/* Select on click */}
      <button
        type="button"
        onClick={() => onSelect(preset.id)}
        className="absolute inset-0 z-0"
        aria-label={`Select ${preset.name} theme`}
      />

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

      {/* Badges */}
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

      {/* Hover actions, rendered above the select button */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <IconAction
            onClick={(e) => { e.stopPropagation(); onEdit(preset.id); }}
            className="p-1 hover:bg-[var(--bg-elevated)]"
            title={preset.builtin ? 'Duplicate & edit' : 'Edit theme'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </IconAction>
        )}
        {onDelete && !preset.builtin && (
          <IconAction
            onClick={(e) => { e.stopPropagation(); onDelete(preset.id); }}
            className="p-1 hover:bg-[var(--status-error-muted)] hover:text-[var(--status-error)]"
            title="Delete theme"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </IconAction>
        )}
      </div>
    </div>
  );
}
