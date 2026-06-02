import { Button } from '@sero-ai/ui/components/ui/button';
import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';

interface ThemeEditorFooterProps {
  autoSave: boolean;
  canReset: boolean;
  canSave: boolean;
  onAutoSaveChange: (value: boolean) => void;
  onCancel: () => void;
  onReset: () => Promise<void>;
  onSave: () => Promise<void>;
}

export function ThemeEditorFooter({
  autoSave,
  canReset,
  canSave,
  onAutoSaveChange,
  onCancel,
  onReset,
  onSave,
}: ThemeEditorFooterProps) {
  return (
    <div className="shrink-0 border-t border-[var(--border-subtle)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          {canReset && (
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--text-muted)]"
              onClick={() => void onReset()}
            >
              Reset
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Checkbox
              checked={autoSave}
              disabled={!canSave}
              onCheckedChange={(checked) => onAutoSaveChange(checked === true)}
            />
            Auto-save
          </label>
          <Button size="sm" onClick={() => void onSave()} disabled={!canSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
