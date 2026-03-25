import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { cn } from '@sero-ai/ui/lib/utils';
import { Globe, Github, Link2, Loader2, Lock, Rocket } from 'lucide-react';

interface GitHubStatus {
  authenticated: boolean;
  username?: string;
}

interface PublishFeedback {
  tone: 'success' | 'error' | 'info';
  message: string;
  url?: string;
}

interface GitRemotePublishSectionProps {
  workspaceId: string;
  workspaceName: string;
  onPublished: () => Promise<void> | void;
}

export function GitRemotePublishSection({
  workspaceId,
  workspaceName,
  onPublished,
}: GitRemotePublishSectionProps) {
  const [mode, setMode] = useState<'github' | 'existing'>('github');
  const [name, setName] = useState(defaultRepoName(workspaceName, workspaceId));
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [action, setAction] = useState<'github' | 'existing' | null>(null);
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus | null>(null);
  const [feedback, setFeedback] = useState<PublishFeedback | null>(null);

  useEffect(() => {
    let active = true;
    setFeedback(null);
    setName(defaultRepoName(workspaceName, workspaceId));
    setRemoteUrl('');

    void window.sero.github.status()
      .then((status) => {
        if (!active) return;
        setGitHubStatus({
          authenticated: status.authenticated,
          username: status.username,
        });
      })
      .catch(() => {
        if (!active) return;
        setGitHubStatus({ authenticated: false });
      });

    return () => {
      active = false;
    };
  }, [workspaceId, workspaceName]);

  const githubHint = useMemo(() => {
    if (!githubStatus) return 'Checking GitHub login…';
    if (githubStatus.authenticated) {
      return githubStatus.username
        ? `Connected as ${githubStatus.username}. Create and wire an origin in one step.`
        : 'GitHub connected. Create and wire an origin in one step.';
    }
    return 'Connect GitHub in the sidebar to create a repository from here.';
  }, [githubStatus]);

  const handleCreateGitHub = async () => {
    const trimmed = name.trim();
    if (!trimmed || action) return;

    setAction('github');
    setFeedback(null);
    try {
      const auth = await window.sero.github.status();
      if (!auth.authenticated) {
        setFeedback({
          tone: 'error',
          message: 'GitHub is not connected. Connect it in the sidebar first, then retry.',
        });
        return;
      }

      const result = await window.sero.github.createRepo(workspaceId, {
        name: trimmed,
        visibility,
        addRemote: true,
      });
      const url = result.url ?? (auth.username ? `https://github.com/${auth.username}/${trimmed}` : undefined);

      if (!result.success) {
        setFeedback({ tone: 'error', message: result.message, url });
        return;
      }

      await onPublished();
      setFeedback({
        tone: 'success',
        message: 'Repository published and origin connected.',
        url,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to publish to GitHub',
      });
    } finally {
      setAction(null);
    }
  };

  const handleConnectExisting = async () => {
    const trimmed = remoteUrl.trim();
    if (!trimmed || action) return;

    setAction('existing');
    setFeedback(null);
    try {
      await window.sero.vcs.addRemote(workspaceId, 'origin', trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect remote';
      if (!message.includes('already exists')) {
        setFeedback({ tone: 'error', message });
        setAction(null);
        return;
      }

      await window.sero.vcs.setRemoteUrl(workspaceId, 'origin', trimmed);
    }

    await onPublished();
    setFeedback({
      tone: 'success',
      message: 'Origin connected. Push the current branch to publish it upstream.',
      url: toWebUrl(trimmed),
    });
    setAction(null);
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">Publish</h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            Add an origin so this workspace can push and open PRs.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5">
          <ModeButton active={mode === 'github'} onClick={() => setMode('github')}>
            <Github className="size-3.5" /> GitHub
          </ModeButton>
          <ModeButton active={mode === 'existing'} onClick={() => setMode('existing')}>
            <Link2 className="size-3.5" /> Existing
          </ModeButton>
        </div>
      </div>

      {mode === 'github' ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--status-info-border)] bg-[var(--status-info-faint)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {githubHint}
          </div>

          <label className="space-y-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <span>Repository name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-project"
              disabled={action === 'github'}
              className="h-8 text-[11px]"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <VisibilityButton
              active={visibility === 'private'}
              label="Private"
              icon={<Lock className="size-3.5" />}
              onClick={() => setVisibility('private')}
            />
            <VisibilityButton
              active={visibility === 'public'}
              label="Public"
              icon={<Globe className="size-3.5" />}
              onClick={() => setVisibility('public')}
            />
          </div>

          <Button
            onClick={() => void handleCreateGitHub()}
            disabled={!name.trim() || action !== null}
            className="h-8 w-full rounded-lg bg-[var(--accent-primary)] text-[11px] font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-hover)]"
          >
            {action === 'github' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Rocket className="mr-1 size-3.5" />}
            Create repo + publish
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Point <span className="font-medium text-[var(--text-primary)]">origin</span> at an existing GitHub or Git remote.
          </div>

          <label className="space-y-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <span>Remote URL</span>
            <Input
              value={remoteUrl}
              onChange={(event) => setRemoteUrl(event.target.value)}
              placeholder="https://github.com/you/repo.git"
              disabled={action === 'existing'}
              className="h-8 text-[11px]"
            />
          </label>

          <Button
            onClick={() => void handleConnectExisting()}
            disabled={!remoteUrl.trim() || action !== null}
            className="h-8 w-full rounded-lg bg-[var(--accent-primary)] text-[11px] font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-hover)]"
          >
            {action === 'existing' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Link2 className="mr-1 size-3.5" />}
            Connect origin
          </Button>
        </div>
      )}

      {feedback && (
        <div className={cn(
          'rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
          feedback.tone === 'success' && 'border-[var(--status-success-border)] bg-[var(--status-success-faint)] text-[var(--status-success)]',
          feedback.tone === 'error' && 'border-[var(--status-error-border)] bg-[var(--status-error-faint)] text-[var(--status-error)]',
          feedback.tone === 'info' && 'border-[var(--status-info-border)] bg-[var(--status-info-faint)] text-[var(--status-info)]',
        )}>
          <span>{feedback.message}</span>
          {feedback.url && (
            <a
              href={feedback.url}
              target="_blank"
              rel="noreferrer"
              className="ml-2 underline underline-offset-2"
            >
              Open
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium transition-colors',
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
      )}
    >
      {children}
    </button>
  );
}

function VisibilityButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium transition-colors',
        active
          ? 'border-[var(--accent-primary)]/30 bg-[var(--accent-muted)] text-[var(--accent-primary)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function defaultRepoName(workspaceName: string, workspaceId: string): string {
  const source = workspaceName.trim() || workspaceId;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'sero-workspace';
}

function toWebUrl(url: string): string | undefined {
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`;
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (sshMatch) return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
  return undefined;
}
