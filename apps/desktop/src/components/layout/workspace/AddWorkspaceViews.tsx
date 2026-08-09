import { ChevronLeft, FolderInput, FolderOpen, FolderPlus, GitBranch, Loader2, X } from 'lucide-react';
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
    <div className="flex flex-col p-1.5">
      <PickRow icon={<FolderPlus className="size-4" />} label="Create New" onClick={onCreateNew} />
      <PickRow icon={<GitBranch className="size-4" />} label="Clone Repository" onClick={onCloneRepo} />
      <PickRow icon={<FolderInput className="size-4" />} label="Import Existing" onClick={onImportExisting} />
    </div>
  );
}

function PickRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] [&_svg]:text-[var(--text-muted)] hover:[&_svg]:text-[var(--text-primary)]"
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
  error,
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
  error: string | null;
  options: WorkspaceCreationOption[];
  onOptionChange: (id: string, enabled: boolean) => void;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onCreate(); }} className="flex flex-col">
      <FormHeader title="New Workspace" onBack={onBack} disabled={isCreating} />

      <FormBody>
        <Field label="Name" htmlFor="new-workspace-name">
          <Input
            id="new-workspace-name"
            ref={inputRef}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="My Project"
            className="h-8 text-xs"
            disabled={isCreating}
          />
        </Field>

        <LocationField parentPath={parentPath} onPick={onPickLocation} onClear={onClearLocation} disabled={isCreating} />
        <ErrorNotice message={error} />
      </FormBody>

      <WorkspaceCreationOptions options={options} onOptionChange={onOptionChange} disabled={isCreating} />
      <FormActions submitLabel="Create" busy={isCreating} disabled={!name.trim()} />
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
    <form onSubmit={(e) => { e.preventDefault(); onImport(); }} className="flex flex-col">
      <FormHeader title="Import Existing" onBack={onBack} disabled={isImporting} />

      {error && (
        <FormBody>
          <ErrorNotice message={error} />
        </FormBody>
      )}

      <WorkspaceCreationOptions options={options} onOptionChange={onOptionChange} disabled={isImporting} />
      <FormActions submitLabel="Choose Folder" busyLabel="Importing…" busy={isImporting} disabled={false} />
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
    <form onSubmit={(e) => { e.preventDefault(); onClone(); }} className="flex flex-col">
      <FormHeader title="Clone Repository" onBack={onBack} disabled={isCloning} />

      <FormBody>
        <Field label="Repository URL" htmlFor="clone-url">
          <Input
            id="clone-url"
            ref={inputRef}
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="github.com/user/repo"
            className="h-8 text-xs"
            disabled={isCloning}
          />
        </Field>

        <Field label="Name" htmlFor="clone-name">
          <Input
            id="clone-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Derived from URL"
            className="h-8 text-xs"
            disabled={isCloning}
          />
        </Field>

        <LocationField parentPath={parentPath} onPick={onPickLocation} onClear={onClearLocation} disabled={isCloning} />

        <ErrorNotice message={error}>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="self-start text-xs font-medium text-status-error underline underline-offset-2"
            >
              Sign in to GitHub and retry
            </button>
          )}
        </ErrorNotice>
      </FormBody>

      <WorkspaceCreationOptions options={options} onOptionChange={onOptionChange} disabled={isCloning} />
      <FormActions submitLabel="Clone" busyLabel="Cloning…" busy={isCloning} disabled={!url.trim()} />
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
  if (options.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5 border-t border-[var(--border-subtle)] px-3 py-2.5">
      {options.map((option) => (
        <label
          key={option.id}
          htmlFor={`workspace-create-option-${option.id}`}
          className={cn(
            'flex cursor-pointer items-center justify-between gap-3 text-xs text-[var(--text-secondary)]',
            disabled && 'cursor-default opacity-50',
          )}
        >
          {option.label}
          <Switch
            id={`workspace-create-option-${option.id}`}
            size="sm"
            checked={option.enabled}
            disabled={disabled}
            onCheckedChange={(enabled) => onOptionChange(option.id, enabled)}
          />
        </label>
      ))}
    </div>
  );
}

// ── Shared form pieces ─────────────────────────────────────────

function FormHeader({ title, onBack, disabled }: { title: string; onBack: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] px-1.5 py-1.5">
      <button
        type="button"
        onClick={onBack}
        disabled={disabled}
        aria-label="Back"
        className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="text-xs font-medium text-[var(--text-primary)]">{title}</span>
    </div>
  );
}

function FormBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 px-3 py-3">{children}</div>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs text-[var(--text-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorNotice({ message, children }: { message: string | null; children?: React.ReactNode }) {
  if (!message) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-status-error-muted px-2 py-1.5">
      <p role="alert" className="text-xs text-status-error">{message}</p>
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
      <div className="mb-1.5 block text-xs text-[var(--text-muted)]">Location</div>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-xs transition-colors',
          'border-[var(--border-default)] bg-transparent hover:bg-[var(--bg-elevated)]',
          disabled && 'pointer-events-none opacity-50',
          parentPath ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
        )}
        title={parentPath ?? 'Default (~/.sero-ui/workspaces)'}
      >
        <FolderOpen className="size-3.5 shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate text-left">{locationLabel ?? 'Default'}</span>
        {parentPath && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="shrink-0 rounded p-0.5 hover:bg-[var(--bg-base)]"
          >
            <X className="size-3 text-[var(--text-muted)]" />
          </span>
        )}
      </button>
    </div>
  );
}

function FormActions({
  submitLabel,
  busyLabel,
  busy,
  disabled,
}: {
  submitLabel: string;
  busyLabel?: string;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <div className="border-t border-[var(--border-subtle)] p-3">
      <Button type="submit" size="sm" className="h-8 w-full text-xs" disabled={disabled || busy}>
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
