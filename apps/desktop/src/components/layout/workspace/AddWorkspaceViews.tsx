import { Check, FolderInput, FolderOpen, FolderPlus, Loader2, X } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { cn } from '@sero-ai/ui/lib/utils';

export type RuntimeChoice = 'default' | 'host' | 'apple-container' | 'openshell-local';

const RUNTIME_OPTIONS: Array<{
  value: RuntimeChoice;
  label: string;
  detail: string;
}> = [
  { value: 'default', label: 'Default', detail: 'Current behavior' },
  { value: 'host', label: 'Local macOS', detail: 'Run directly on this Mac' },
  { value: 'apple-container', label: 'Apple Container', detail: 'Isolated workspace runtime' },
  { value: 'openshell-local', label: 'OpenShell Local', detail: 'Experimental · requires Docker' },
];

/** Initial view — two action rows. */
export function PickView({
  onCreateNew,
  onImportExisting,
}: {
  onCreateNew: () => void;
  onImportExisting: () => void;
}) {
  return (
    <div className="flex flex-col py-1">
      <button
        onClick={onCreateNew}
        className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        <FolderPlus className="size-3.5 text-[var(--text-muted)]" />
        Create New
      </button>
      <button
        onClick={onImportExisting}
        className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        <FolderInput className="size-3.5 text-[var(--text-muted)]" />
        Import Existing
      </button>
    </div>
  );
}

/** Create form view — name input, optional location, create button. */
export function CreateView({
  inputRef,
  name,
  onNameChange,
  parentPath,
  onPickLocation,
  onClearLocation,
  runtimeChoice,
  onRuntimeChoiceChange,
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
  runtimeChoice: RuntimeChoice;
  onRuntimeChoiceChange: (choice: RuntimeChoice) => void;
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
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Name
        </label>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My Project"
          className="h-7 text-xs"
          autoFocus
        />
      </div>

      {/* Location */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Location
        </label>
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

      {/* Runtime */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Runtime
        </label>
        <div className="grid gap-1" role="radiogroup" aria-label="Workspace runtime">
          {RUNTIME_OPTIONS.map((option) => {
            const selected = runtimeChoice === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onRuntimeChoiceChange(option.value)}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                  selected
                    ? 'border-[var(--accent-primary)] bg-[var(--bg-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--accent-primary)]/40'
                    : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex size-3 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--bg-base)]' : 'border-[var(--border-default)]',
                )}>
                  {selected ? <Check className="size-2" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-[var(--text-muted)]">{option.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
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
