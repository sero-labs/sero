/**
 * CreateGitHubRepoDialog — dialog for creating a GitHub repository
 * from a Sero workspace.
 *
 * Opened from the WorkspaceTree hover actions (GitHub icon).
 * Creates a repo via `gh repo create` and optionally sets it as
 * the workspace's 'origin' remote.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@sero/ui/components/ui/dialog';
import { Button } from '@sero/ui/components/ui/button';
import { Input } from '@sero/ui/components/ui/input';
import { Label } from '@sero/ui/components/ui/label';
import { Switch } from '@sero/ui/components/ui/switch';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { WorkspaceInfo, CreateGitHubRepoResult } from '@/types/ipc';

interface CreateGitHubRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: WorkspaceInfo;
}

type Visibility = 'public' | 'private';

export function CreateGitHubRepoDialog({
  open,
  onOpenChange,
  workspace,
}: CreateGitHubRepoDialogProps) {
  const [name, setName] = useState(workspace.id);
  const [description, setDescription] = useState(workspace.description ?? '');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [addRemote, setAddRemote] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<CreateGitHubRepoResult | null>(null);

  const reset = () => {
    setName(workspace.id);
    setDescription(workspace.description ?? '');
    setVisibility('private');
    setAddRemote(true);
    setIsCreating(false);
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isCreating) return;

    setIsCreating(true);
    setResult(null);
    try {
      const res = await window.sero.github.createRepo(workspace.id, {
        name: trimmedName,
        description: description.trim() || undefined,
        visibility,
        addRemote,
      });
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCreating && name.trim()) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {result?.success ? 'Repository Created' : 'Create GitHub Repository'}
          </DialogTitle>
          <DialogDescription>
            {result?.success
              ? 'Your repository is ready on GitHub.'
              : `Create a GitHub repository for "${workspace.name}".`}
          </DialogDescription>
        </DialogHeader>

        {result?.success ? (
          <SuccessView url={result.url} onClose={handleClose} />
        ) : (
          <FormView
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            addRemote={addRemote}
            onAddRemoteChange={setAddRemote}
            isCreating={isCreating}
            error={result?.success === false ? result.message : undefined}
            onSubmit={handleCreate}
            onCancel={handleClose}
            onKeyDown={handleKeyDown}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Success view ──────────────────────────────────────────────

function SuccessView({ url, onClose }: { url?: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
        >
          <ExternalLink className="size-3.5" />
          {url}
        </a>
      )}
      <div className="flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

// ── Form view ────────────────────────────────────────────────

interface FormViewProps {
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
  addRemote: boolean;
  onAddRemoteChange: (v: boolean) => void;
  isCreating: boolean;
  error?: string;
  onSubmit: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function FormView({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  visibility,
  onVisibilityChange,
  addRemote,
  onAddRemoteChange,
  isCreating,
  error,
  onSubmit,
  onCancel,
  onKeyDown,
}: FormViewProps) {
  return (
    <div className="flex flex-col gap-4 pt-1" onKeyDown={onKeyDown}>
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repo-name" className="text-sm font-medium text-[var(--text-secondary)]">
          Repository name
        </Label>
        <Input
          id="repo-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="my-project"
          autoFocus
          disabled={isCreating}
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repo-desc" className="text-sm font-medium text-[var(--text-secondary)]">
          Description
          <span className="ml-1 text-xs text-[var(--text-muted)]">(optional)</span>
        </Label>
        <Input
          id="repo-desc"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="A short description of the project"
          disabled={isCreating}
        />
      </div>

      {/* Visibility */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-[var(--text-secondary)]">Visibility</Label>
        <div className="flex gap-2">
          <VisibilityButton
            active={visibility === 'private'}
            onClick={() => onVisibilityChange('private')}
            disabled={isCreating}
            label="Private"
            hint="Only you can see this repository"
          />
          <VisibilityButton
            active={visibility === 'public'}
            onClick={() => onVisibilityChange('public')}
            disabled={isCreating}
            label="Public"
            hint="Anyone on the internet can see"
          />
        </div>
      </div>

      {/* Add remote */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <Label htmlFor="add-remote" className="text-sm font-medium text-[var(--text-secondary)]">
            Add as remote
          </Label>
          <span className="text-xs text-[var(--text-muted)]">
            Set the new repo as the &apos;origin&apos; remote
          </span>
        </div>
        <Switch
          id="add-remote"
          checked={addRemote}
          onCheckedChange={onAddRemoteChange}
          disabled={isCreating}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={isCreating}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={isCreating || !name.trim()}>
          {isCreating ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Creating…
            </>
          ) : (
            'Create Repository'
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Visibility toggle button ──────────────────────────────────

function VisibilityButton({
  active,
  onClick,
  disabled,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 flex-col rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-blue-500/50 bg-blue-500/10 text-[var(--text-primary)]'
          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-[var(--text-muted)]">{hint}</span>
    </button>
  );
}
