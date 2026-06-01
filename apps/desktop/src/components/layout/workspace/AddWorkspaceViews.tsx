import { FolderInput, FolderOpen, FolderPlus, Loader2, X } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { cn } from '@sero-ai/ui/lib/utils';

/** Initial view, two action rows. */
export function PickView({
  onCreateNew,
  onImportExisting,
}: {
  onCreateNew: () => void;
  onImportExisting: () => void;
}) {
  return (
    <div className="flex flex-col py-1">
      <button type="button"
        onClick={onCreateNew}
        className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        <FolderPlus className="size-3.5 text-[var(--text-muted)]" />
        Create New
      </button>
      <button type="button"
        onClick={onImportExisting}
        className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        <FolderInput className="size-3.5 text-[var(--text-muted)]" />
        Import Existing
      </button>
    </div>
  );
}

/** Create form view, name input, optional location, create button. */
export function CreateView({
  inputRef,
  name,
  onNameChange,
  parentPath,
  onPickLocation,
  onClearLocation,
  onBack,
  onCreate,
  isCreating,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  name: string;
  onNameChange: (v: string) => void;
  parentPath: string | null;
  onPickLocation: () => void;
  onClearLocation: () => void;
  onBack: () => void;
  onCreate: () => void;
  isCreating: boolean;
}) {
  const locationLabel = parentPath
    ? parentPath.split('/').filter(Boolean).pop()
    : null;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onCreate(); }}
      className="flex flex-col gap-2.5 p-3"
    >
      {/* Name */}
      <div>
        <label htmlFor="new-workspace-name" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Name
        </label>
        <Input
          id="new-workspace-name"
          ref={inputRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My Project"
          className="h-7 text-xs"
        />
      </div>

      {/* Location */}
      <div>
        <div className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Location
        </div>
        <button
          type="button"
          onClick={onPickLocation}
          className={cn(
            'flex h-7 w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
            'border-[var(--border-default)] bg-[var(--bg-base)] hover:bg-[var(--bg-elevated)]',
            parentPath ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
          )}
          title={parentPath ?? 'Default (~/.sero-ui/workspaces)'}
        >
          <FolderOpen className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {locationLabel ?? 'Default'}
          </span>
          {parentPath && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onClearLocation(); }}
              className="shrink-0 rounded p-0.5 hover:bg-[var(--bg-base)]"
            >
              <X className="size-2.5 text-[var(--text-muted)]" />
            </span>
          )}
        </button>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={!name.trim() || isCreating}
        >
          {isCreating ? <Loader2 className="size-3 animate-spin" /> : 'Create'}
        </Button>
      </div>
    </form>
  );
}
