import { Loader2 } from 'lucide-react';

interface LocalProviderFooterProps {
  saveError: string | null;
  isEditing: boolean;
  isValid: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => Promise<void>;
}

export function LocalProviderFooter({
  saveError,
  isEditing,
  isValid,
  saving,
  onCancel,
  onSave,
}: LocalProviderFooterProps) {
  return (
    <>
      {saveError && (
        <p className="text-[11px] text-[var(--status-error)]">{saveError}</p>
      )}
      <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button
          onClick={onCancel}
          className="h-8 rounded-md px-3 text-xs font-medium text-[var(--text-secondary)]
            transition-colors hover:bg-[var(--bg-elevated)]"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            void onSave();
          }}
          disabled={!isValid || saving}
          className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--banner-primary)]
            px-3 text-xs font-medium text-white transition-colors
            hover:bg-[var(--banner-primary)]/80 disabled:opacity-40"
        >
          {saving && <Loader2 className="size-3 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Add Provider'}
        </button>
      </div>
    </>
  );
}
