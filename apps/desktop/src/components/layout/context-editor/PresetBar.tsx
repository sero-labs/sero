import { RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui/components/ui/select';
import type { ContextPreset } from '@/types/ipc';
import { SavePresetInput } from '../context-editor-parts';

interface PresetBarProps {
  allPresets: ContextPreset[];
  activePresetId: string | null;
  activeUserPreset: ContextPreset | null;
  hasOverrides: boolean;
  showSaveInput: boolean;
  onPresetChange: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onReset: () => void;
  onShowSave: () => void;
  onSave: (name: string) => void;
  onCancelSave: () => void;
}

export function PresetBar({
  allPresets,
  activePresetId,
  activeUserPreset,
  hasOverrides,
  showSaveInput,
  onPresetChange,
  onDelete,
  onReset,
  onShowSave,
  onSave,
  onCancelSave,
}: PresetBarProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-[var(--text-muted)]">
          Preset:
        </span>
        <Select value={activePresetId ?? ''} onValueChange={onPresetChange}>
          <SelectTrigger size="sm" className="h-7 w-40 text-xs">
            <SelectValue placeholder="Custom" />
          </SelectTrigger>
          <SelectContent>
            {allPresets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeUserPreset && (
          <button type="button"
            onClick={() => void onDelete(activeUserPreset.id)}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[var(--text-muted)] transition-colors hover:bg-status-error-muted hover:text-status-error"
            title={`Delete "${activeUserPreset.name}"`}
          >
            <Trash2 className="size-3" />
          </button>
        )}

        {!showSaveInput && (
          <button type="button"
            onClick={onShowSave}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          >
            <Save className="size-3" />
            Save as
          </button>
        )}

        {hasOverrides && (
          <button type="button"
            onClick={onReset}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        )}
      </div>

      {showSaveInput && (
        <SavePresetInput onSave={onSave} onCancel={onCancelSave} />
      )}
    </>
  );
}
