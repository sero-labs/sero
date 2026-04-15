import { Button } from '@sero-ai/ui/components/ui/button';

interface ThemeEditorFooterProps {
  canReset: boolean;
  canSave: boolean;
  onCancel: () => void;
  onReset: () => Promise<void>;
  onSave: () => Promise<void>;
}

export function ThemeEditorFooter({
  canReset,
  canSave,
  onCancel,
  onReset,
  onSave,
}: ThemeEditorFooterProps) {
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
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
      <Button size="sm" onClick={() => void onSave()} disabled={!canSave}>
        Save Theme
      </Button>
    </div>
  );
}
