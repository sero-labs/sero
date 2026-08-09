import { FolderInput, FolderOpen, FolderPlus, GitBranch, Loader2, X } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { cn } from '@sero-ai/ui/lib/utils';

export interface WorkspaceCreationOption {
  id: string;
  label: string;
  enabled: boolean;
}

/** Initial view, three action rows. */
export function PickView({
  onCreateNew,
  onCloneRepo,
  onImportExisting,
}: {
  onCreateNew: () => void;
  onCloneRepo: () => void;
  onImportExisting: () => void;
}) {
  return (
    <div className="flex flex-col py-1">
      <PickRow icon={<FolderPlus className="size-3.5 text-[var(--text-muted)]" />} label="Create New" onClick={onCreateNew} />
      <PickRow icon={<GitBranch className="size-3.5 text-[var(--text-muted)]" />} label="Clone Repository" onClick={onCloneRepo} />
      <PickRow icon={<FolderInput className="size-3.5 text-[var(--text-muted)]" />} label="Import Existing" onClick={onImportExisting} />
    </div>
  );
}

function PickRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-left text-base text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
    >
      {icon}
      {label}
    </button>
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
  options,
  onOptionChange,
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
  options: WorkspaceCreationOption[];
  onOptionChange: (id: string, enabled: boolean) => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onCreate(); }}
      className="flex flex-col gap-2.5 p-3"
    >
      <Field label="Name" htmlFor="new-workspace-name">
        <Input
          id="new-workspace-name"
          ref={inputRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My Project"
          className="h-7 text-xs"
        />
      </Field>

      <LocationField parentPath={parentPath} onPick={onPickLocation} onClear={onClearLocation} />
      <WorkspaceCreationOptions
        options={options}
        onOptionChange={onOptionChange}
        disabled={isCreating}
      />
      <FormActions onBack={onBack} submitLabel="Create" busy={isCreating} disabled={!name.trim()} />
    </form>
  );
}

/** Import form view: plugin options followed by the native folder picker. */
export function ImportView({
  onBack,
  onImport,
  isImporting,
  error,
  options,
  onOptionChange,
}: {
  onBack: () => void;
  onImport: () => void;
  isImporting: boolean;
  error: string | null;
  options: WorkspaceCreationOption[];
  onOptionChange: (id: string, enabled: boolean) => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onImport(); }}
      className="flex flex-col gap-2.5 p-3"
    >
      <WorkspaceCreationOptions
        options={options}
        onOptionChange={onOptionChange}
        disabled={isImporting}
      />
      {error && (
        <div className="rounded-md bg-status-error-muted p-2">
          <p role="alert" className="text-xs text-status-error">{error}</p>
        </div>
      )}
      <FormActions
        onBack={onBack}
        submitLabel="Choose Folder"
        busyLabel="Importing…"
        busy={isImporting}
        disabled={false}
      />
    </form>
  );
}

/** Clone form view: git URL, derived name, optional location. */
export function CloneView({
  inputRef,
  url,
  onUrlChange,
  name,
  onNameChange,
  parentPath,
  onPickLocation,
  onClearLocation,
  onBack,
  onClone,
  isCloning,
  error,
  onSignIn,
  options,
  onOptionChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  url: string;
  onUrlChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  parentPath: string | null;
  onPickLocation: () => void;
  onClearLocation: () => void;
  onBack: () => void;
  onClone: () => void;
  isCloning: boolean;
  error: string | null;
  onSignIn?: () => void;
  options: WorkspaceCreationOption[];
  onOptionChange: (id: string, enabled: boolean) => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onClone(); }}
      className="flex flex-col gap-2.5 p-3"
    >
      <Field label="Repository URL" htmlFor="clone-url">
        <Input
          id="clone-url"
          ref={inputRef}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          className="h-7 text-xs"
          disabled={isCloning}
        />
      </Field>

      <Field label="Name" htmlFor="clone-name">
        <Input
          id="clone-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Derived from URL"
          className="h-7 text-xs"
          disabled={isCloning}
        />
      </Field>

      <LocationField parentPath={parentPath} onPick={onPickLocation} onClear={onClearLocation} disabled={isCloning} />
      <WorkspaceCreationOptions
        options={options}
        onOptionChange={onOptionChange}
        disabled={isCloning}
      />

      {error && (
        <div className="flex flex-col gap-1.5 rounded-md bg-status-error-muted p-2">
          <p className="text-xs text-status-error">{error}</p>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="self-start text-xs font-medium text-status-error underline underline-offset-2"
            >
              Sign in to GitHub and retry
            </button>
          )}
        </div>
      )}

      <FormActions onBack={onBack} submitLabel="Clone" busyLabel="Cloning…" busy={isCloning} disabled={!url.trim()} />
    </form>
  );
}

function WorkspaceCreationOptions({
  options,
  onOptionChange,
  disabled,
}: {
  options: WorkspaceCreationOption[];
  onOptionChange: (id: string, enabled: boolean) => void;
  disabled: boolean;
}) {
  return options.map((option) => (
    <label
      key={option.id}
      htmlFor={`workspace-create-option-${option.id}`}
      className={cn(
        'flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]',
        disabled && 'opacity-50',
      )}
    >
      {option.label}
      <Switch
        id={`workspace-create-option-${option.id}`}
        checked={option.enabled}
        disabled={disabled}
        onCheckedChange={(enabled) => onOptionChange(option.id, enabled)}
      />
    </label>
  ));
}

// ── Shared form pieces ─────────────────────────────────────────

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function LocationField({
  parentPath,
  onPick,
  onClear,
  disabled,
}: {
  parentPath: string | null;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const locationLabel = parentPath ? parentPath.split('/').filter(Boolean).pop() : null;

  return (
    <div>
      <div className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Location</div>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={cn(
          'flex h-7 w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
          'border-[var(--border-default)] bg-[var(--bg-base)] hover:bg-[var(--bg-elevated)]',
          disabled && 'opacity-50',
          parentPath ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
        )}
        title={parentPath ?? 'Default (~/.sero-ui/workspaces)'}
      >
        <FolderOpen className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{locationLabel ?? 'Default'}</span>
        {parentPath && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="shrink-0 rounded p-0.5 hover:bg-[var(--bg-base)]"
          >
            <X className="size-2.5 text-[var(--text-muted)]" />
          </span>
        )}
      </button>
    </div>
  );
}

function FormActions({
  onBack,
  submitLabel,
  busyLabel,
  busy,
  disabled,
}: {
  onBack: () => void;
  submitLabel: string;
  busyLabel?: string;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onBack} disabled={busy}>
        Back
      </Button>
      <Button type="submit" size="sm" className="h-6 px-2 text-xs" disabled={disabled || busy}>
        {busy ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            {busyLabel ?? submitLabel}
          </span>
        ) : (
          submitLabel
        )}
      </Button>
    </div>
  );
}
