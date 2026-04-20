/**
 * Sub-views for the RemoteOriginManager dialog.
 *
 * Extracted to keep RemoteOriginManager.tsx under 500 LOC.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  Globe,
  Loader2,
  Lock,
  Plus,
  Link as LinkIcon,
  Pencil,
} from 'lucide-react';
import { IconAction } from '@/components/ui/IconAction';
import type { WorkspaceInfo } from '@/types/ipc';
import { useGitHubAuthStore } from '@/stores/github-auth';
import {
  connectOrigin,
  createGitHubOrigin,
  defaultRepoName,
  displayOriginUrl,
  toGitHubWebUrl,
  type GitRemoteOriginInfo,
  type GitRemoteVisibility,
} from '../git-remote/workflow';
import {
  RemoteOriginGitHubAuthNotice,
  type RemoteOriginGitHubAuthOutcome,
} from './RemoteOriginGitHubAuthNotice';

// ── Types ────────────────────────────────────────────────────

export type Visibility = GitRemoteVisibility;
export type OriginInfo = GitRemoteOriginInfo;

// ── Loading ──────────────────────────────────────────────────

export function LoadingView() {
  return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="size-5 animate-spin text-[var(--text-muted)]" />
    </div>
  );
}

// ── Choose: Create new or Connect existing ───────────────────

export function ChooseView({
  onCreateNew,
  onConnectExisting,
}: {
  onCreateNew: () => void;
  onConnectExisting: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 pt-1">
      <button
        onClick={onCreateNew}
        className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] p-3 text-left transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
      >
        <div className="flex size-8 items-center justify-center rounded-md bg-[var(--bg-elevated)]">
          <Plus className="size-4 text-[var(--text-secondary)]" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[var(--text-primary)]">Create new on GitHub</span>
          <span className="text-xs text-[var(--text-muted)]">Create a repository and set it as origin</span>
        </div>
      </button>
      <button
        onClick={onConnectExisting}
        className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] p-3 text-left transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
      >
        <div className="flex size-8 items-center justify-center rounded-md bg-[var(--bg-elevated)]">
          <LinkIcon className="size-4 text-[var(--text-secondary)]" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[var(--text-primary)]">Connect existing repository</span>
          <span className="text-xs text-[var(--text-muted)]">Add an existing remote URL as origin</span>
        </div>
      </button>
    </div>
  );
}

// ── Create GitHub repo ───────────────────────────────────────

export function CreateGitHubView({
  workspace,
  onBack,
  onCreated,
}: {
  workspace: WorkspaceInfo;
  onBack: () => void;
  onCreated: (url: string) => void;
}) {
  const {
    authStatus,
    statusReady,
    openGitHubAuthDialog,
    refreshStatus,
  } = useGitHubAuthStore(
    useShallow((state) => ({
      authStatus: state.authStatus,
      statusReady: state.statusReady,
      openGitHubAuthDialog: state.openGitHubAuthDialog,
      refreshStatus: state.refreshStatus,
    })),
  );
  const [name, setName] = useState(() => defaultRepoName(workspace.name, workspace.id));
  const [description, setDescription] = useState(workspace.description ?? '');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [isCreating, setIsCreating] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAuthOutcome, setLastAuthOutcome] = useState<RemoteOriginGitHubAuthOutcome | null>(null);
  const mountedRef = useRef(false);
  const authLaunchInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!authStatus?.authenticated) return;
    setAuthRequired(false);
    setLastAuthOutcome(null);
  }, [authStatus?.authenticated]);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isCreating) return;

    setIsCreating(true);
    setError(null);
    setLastAuthOutcome(null);

    try {
      const result = await createGitHubOrigin({
        workspaceId: workspace.id,
        name: trimmedName,
        description: description.trim() || undefined,
        visibility,
      });

      if (!mountedRef.current) return;

      if (result.ok) {
        setAuthRequired(false);
        onCreated(result.url);
        return;
      }

      if (result.reason === 'auth') {
        await refreshStatus();
        if (!mountedRef.current) return;
        setAuthRequired(true);
        return;
      }

      setAuthRequired(false);
      if (result.reason === 'missing-url') {
        setError('Repository created, but Sero could not determine its URL. Refresh remotes and reconnect if needed.');
      } else {
        setError(result.message ?? 'Failed to create repository');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setAuthRequired(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (mountedRef.current) {
        setIsCreating(false);
      }
    }
  }, [description, isCreating, name, onCreated, refreshStatus, visibility, workspace.id]);

  const handleConnectGitHub = useCallback(async () => {
    if (authLaunchInFlightRef.current) return;

    authLaunchInFlightRef.current = true;
    setLastAuthOutcome(null);

    try {
      const result = await openGitHubAuthDialog({ source: 'remote-origin' });
      if (!mountedRef.current) return;

      const status = await refreshStatus();
      if (!mountedRef.current) return;

      if (result.outcome !== 'success' || !status.authenticated) {
        setAuthRequired(!status.authenticated);
        if (result.outcome !== 'success') {
          setLastAuthOutcome(result);
        }
        return;
      }

      await handleCreate();
    } finally {
      authLaunchInFlightRef.current = false;
    }
  }, [handleCreate, openGitHubAuthDialog, refreshStatus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCreating && name.trim()) {
      e.preventDefault();
      void handleCreate();
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-1" onKeyDown={handleKeyDown}>
      <BackButton onClick={onBack} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repo-name" className="text-sm font-medium text-[var(--text-secondary)]">
          Repository name
        </Label>
        <Input
          id="repo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          autoFocus
          disabled={isCreating}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="repo-desc" className="text-sm font-medium text-[var(--text-secondary)]">
          Description
          <span className="ml-1 text-xs text-[var(--text-muted)]">(optional)</span>
        </Label>
        <Input
          id="repo-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short description of the project"
          disabled={isCreating}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-[var(--text-secondary)]">Visibility</Label>
        <div className="flex gap-2">
          <VisibilityButton
            active={visibility === 'private'}
            onClick={() => setVisibility('private')}
            disabled={isCreating}
            icon={<Lock className="size-3.5" />}
            label="Private"
          />
          <VisibilityButton
            active={visibility === 'public'}
            onClick={() => setVisibility('public')}
            disabled={isCreating}
            icon={<Globe className="size-3.5" />}
            label="Public"
          />
        </div>
      </div>

      {authRequired ? (
        <RemoteOriginGitHubAuthNotice
          authStatus={authStatus}
          statusReady={statusReady}
          lastOutcome={lastAuthOutcome}
          onConnect={() => {
            void handleConnectGitHub();
          }}
        />
      ) : null}

      {error && <ErrorBanner message={error} />}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onBack} disabled={isCreating}>Cancel</Button>
        <Button onClick={() => {
          void handleCreate();
        }} disabled={isCreating || !name.trim()}>
          {isCreating ? (
            <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Creating…</>
          ) : (
            'Create Repository'
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Connect existing repo ────────────────────────────────────

export function ConnectExistingView({
  workspace,
  onBack,
  onConnected,
}: {
  workspace: WorkspaceInfo;
  onBack: () => void;
  onConnected: (url: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    const trimmed = url.trim();
    if (!trimmed || isConnecting) return;

    setIsConnecting(true);
    setError(null);
    try {
      const result = await connectOrigin({ workspaceId: workspace.id, url: trimmed });
      if (result.ok) {
        onConnected(result.url);
        return;
      }

      setError(result.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnecting && url.trim()) {
      e.preventDefault();
      handleConnect();
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-1" onKeyDown={handleKeyDown}>
      <BackButton onClick={onBack} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="remote-url" className="text-sm font-medium text-[var(--text-secondary)]">
          Remote URL
        </Label>
        <Input
          id="remote-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          autoFocus
          disabled={isConnecting}
        />
        <span className="text-xs text-[var(--text-muted)]">
          HTTPS or SSH URL for the remote repository
        </span>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onBack} disabled={isConnecting}>Cancel</Button>
        <Button onClick={handleConnect} disabled={isConnecting || !url.trim()}>
          {isConnecting ? (
            <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Connecting…</>
          ) : (
            'Connect'
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Connected: show current origin ───────────────────────────

export function ConnectedView({
  origin,
  onChangeOrigin,
  onClose,
}: {
  origin: OriginInfo;
  onChangeOrigin: () => void;
  onClose: () => void;
}) {
  const isGitHub = !!origin.owner;
  const webUrl = isGitHub ? toGitHubWebUrl(origin.url) ?? null : null;

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
        <GitBranch className="mt-0.5 size-4 shrink-0 text-[var(--status-success)]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {displayOriginUrl(origin.url)}
          </span>
          <span className="truncate text-xs text-[var(--text-muted)]" title={origin.url}>
            {origin.url}
          </span>
        </div>
        {webUrl && (
          <IconAction
            as="a"
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1 hover:bg-[var(--bg-elevated)]"
            title="Open on GitHub"
          >
            <ExternalLink className="size-3.5" />
          </IconAction>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onChangeOrigin}>
          <Pencil className="mr-1.5 size-3" />
          Change
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

// ── Shared subcomponents ─────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 self-start text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
    >
      <ArrowLeft className="size-3" />
      Back
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-md bg-[var(--status-error-muted)] p-2 text-xs text-[var(--status-error)]">
      {message}
    </p>
  );
}

function VisibilityButton({
  active,
  onClick,
  disabled,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-[var(--status-info-subtle)] bg-[var(--status-info-muted)] text-[var(--text-primary)]'
          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {icon}
      {label}
    </button>
  );
}
