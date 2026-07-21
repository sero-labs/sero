import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { cn } from '@sero-ai/ui/lib/utils';
import { Globe, Github, Link2, Loader2, Lock, Rocket } from 'lucide-react';
import { GitHubAuthOutcomeNote } from '@/components/layout/auth/github/GitHubAuthOutcomeNote';
import { GitHubAuthSummary } from '@/components/layout/auth/github/GitHubAuthSummary';
import type { GitHubAuthDialogResult } from '@/stores/github-auth';
import { useGitHubAuthStore } from '@/stores/github-auth';
import { connectOrigin, createGitHubOrigin, defaultRepoName } from '../../git-remote/origin-utils';

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

type PublishGitHubAuthOutcome = Extract<GitHubAuthDialogResult, { outcome: 'cancelled' | 'error' }>;

export function GitRemotePublishSection({
  workspaceId,
  workspaceName,
  onPublished,
}: GitRemotePublishSectionProps) {
  const {
    authStatus,
    statusReady,
    init,
    openGitHubAuthDialog,
    refreshStatus,
  } = useGitHubAuthStore(
    useShallow((state) => ({
      authStatus: state.authStatus,
      statusReady: state.statusReady,
      init: state.init,
      openGitHubAuthDialog: state.openGitHubAuthDialog,
      refreshStatus: state.refreshStatus,
    })),
  );
  const [mode, setMode] = useState<'github' | 'existing'>('github');
  const [name, setName] = useState(() => defaultRepoName(workspaceName, workspaceId));
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [action, setAction] = useState<'github' | 'existing' | null>(null);
  const [feedback, setFeedback] = useState<PublishFeedback | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [lastAuthOutcome, setLastAuthOutcome] = useState<PublishGitHubAuthOutcome | null>(null);
  const mountedRef = useRef(false);
  const authLaunchInFlightRef = useRef(false);
  const resumeBlockedPublishRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    void init();
    return () => {
      mountedRef.current = false;
    };
  }, [init]);

  useEffect(() => {
    setFeedback(null);
    setName(defaultRepoName(workspaceName, workspaceId));
    setRemoteUrl('');
    setAuthRequired(false);
    setLastAuthOutcome(null);
    resumeBlockedPublishRef.current = false;
  }, [workspaceId, workspaceName]);

  useEffect(() => {
    if (!authStatus?.authenticated) return;
    setAuthRequired(false);
    setLastAuthOutcome(null);
  }, [authStatus?.authenticated]);

  const githubNoticeDescription = useMemo(() => {
    if (!statusReady) {
      return 'Checking your GitHub connection before publishing this workspace.';
    }

    if (authStatus?.authenticated) {
      return authStatus.username
        ? `Connected as ${authStatus.username}. Create and wire an origin in one step.`
        : 'GitHub connected. Create and wire an origin in one step.';
    }

    if (authRequired) {
      return 'Connect GitHub to finish creating and publishing this repository without leaving the title bar.';
    }

    return 'Connect GitHub now, or start publishing first and Sero will pause here until auth is ready.';
  }, [authRequired, authStatus?.authenticated, authStatus?.username, statusReady]);

  const githubDisconnectedCopy = authRequired
    ? 'GitHub needs to be connected before Sero can create and publish this repository.'
    : 'Connect GitHub to create and publish a repository from here.';

  const handleCreateGitHub = async () => {
    const trimmed = name.trim();
    if (!trimmed || action) return;

    setAction('github');
    setFeedback(null);
    setLastAuthOutcome(null);
    try {
      const result = await createGitHubOrigin({
        workspaceId,
        name: trimmed,
        visibility,
      });

      if (!mountedRef.current) return;

      if (!result.ok) {
        if (result.reason === 'auth') {
          const status = await refreshStatus();
          if (!mountedRef.current) return;
          resumeBlockedPublishRef.current = !status.authenticated;
          setAuthRequired(!status.authenticated);
          return;
        }

        resumeBlockedPublishRef.current = false;
        setAuthRequired(false);
        setFeedback({
          tone: 'error',
          message:
            result.reason === 'missing-url'
              ? 'Repository was created, but Sero could not determine its URL. Refresh and reconnect if needed.'
              : (result.message ?? 'Failed to publish to GitHub'),
          url: result.url,
        });
        return;
      }

      resumeBlockedPublishRef.current = false;
      setAuthRequired(false);
      await onPublished();
      if (!mountedRef.current) return;
      setFeedback({
        tone: 'success',
        message: 'Repository published and origin connected.',
        url: result.url,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      resumeBlockedPublishRef.current = false;
      setAuthRequired(false);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to publish to GitHub',
      });
    } finally {
      if (mountedRef.current) {
        setAction(null);
      }
    }
  };

  const handleConnectGitHub = async ({ resumeBlockedPublish }: { resumeBlockedPublish: boolean }) => {
    if (authLaunchInFlightRef.current) return;

    authLaunchInFlightRef.current = true;
    resumeBlockedPublishRef.current = resumeBlockedPublish;
    setFeedback(null);
    setLastAuthOutcome(null);

    try {
      const result = await openGitHubAuthDialog({ source: 'publish' });
      if (!mountedRef.current) return;

      const status = await refreshStatus();
      if (!mountedRef.current) return;

      if (result.outcome !== 'success' || !status.authenticated) {
        setAuthRequired(resumeBlockedPublish && !status.authenticated);
        if (result.outcome !== 'success') {
          setLastAuthOutcome(result);
        }
        return;
      }

      setAuthRequired(false);
      if (!resumeBlockedPublishRef.current) {
        return;
      }

      resumeBlockedPublishRef.current = false;
      await handleCreateGitHub();
    } finally {
      authLaunchInFlightRef.current = false;
    }
  };

  const handleConnectExisting = async () => {
    const trimmed = remoteUrl.trim();
    if (!trimmed || action) return;

    setAction('existing');
    setFeedback(null);
    const result = await connectOrigin({ workspaceId, url: trimmed });
    if (!result.ok) {
      setFeedback({ tone: 'error', message: result.message });
      setAction(null);
      return;
    }

    await onPublished();
    setFeedback({
      tone: 'success',
      message: 'Origin connected. Push the current branch to publish it upstream.',
      url: result.webUrl,
    });
    setAction(null);
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Publish</h3>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
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
          <div
            className={cn(
              'space-y-3 rounded-lg border p-3',
              authRequired
                ? 'border-status-info-border bg-status-info-faint'
                : 'border-[var(--border-subtle)] bg-[var(--bg-base)]',
            )}
          >
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {authRequired ? 'GitHub connection required' : 'GitHub connection'}
              </p>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {githubNoticeDescription}
              </p>
            </div>

            <GitHubAuthSummary
              authStatus={authStatus}
              statusReady={statusReady}
              disconnectedCopy={githubDisconnectedCopy}
              onConnect={() => {
                void handleConnectGitHub({ resumeBlockedPublish: authRequired });
              }}
              className="bg-[var(--bg-elevated)]/30"
            />

            {!authStatus?.authenticated && lastAuthOutcome ? (
              <GitHubAuthOutcomeNote
                outcome={lastAuthOutcome.outcome}
                message={lastAuthOutcome.outcome === 'error' ? lastAuthOutcome.message : undefined}
                onRetry={() => {
                  void handleConnectGitHub({ resumeBlockedPublish: authRequired });
                }}
              />
            ) : null}
          </div>

          <label htmlFor="publish-repo-name" className="space-y-1 text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <span>Repository name</span>
            <Input
              id="publish-repo-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-project"
              disabled={action === 'github'}
              className="h-8 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 mt-4">
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
            className="h-8 w-full rounded-lg bg-[var(--accent-primary)] text-sm font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-hover)]"
          >
            {action === 'github' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Rocket className="mr-1 size-3.5" />}
            Create repo + publish
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Point <span className="font-medium text-[var(--text-primary)]">origin</span> at an existing GitHub or Git remote.
          </div>

          <label htmlFor="publish-remote-url" className="space-y-1 text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <span>Remote URL</span>
            <Input
              id="publish-remote-url"
              value={remoteUrl}
              onChange={(event) => setRemoteUrl(event.target.value)}
              placeholder="https://github.com/you/repo.git"
              disabled={action === 'existing'}
              className="h-8 text-sm"
            />
          </label>

          <Button
            onClick={() => void handleConnectExisting()}
            disabled={!remoteUrl.trim() || action !== null}
            className="h-8 w-full rounded-lg bg-[var(--accent-primary)] text-sm font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-hover)]"
          >
            {action === 'existing' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Link2 className="mr-1 size-3.5" />}
            Connect origin
          </Button>
        </div>
      )}

      {feedback && (
        <div className={cn(
          'rounded-xl border px-3 py-2 text-sm leading-relaxed',
          feedback.tone === 'success' && 'border-status-success-border bg-status-success-faint text-status-success',
          feedback.tone === 'error' && 'border-status-error-border bg-status-error-faint text-status-error',
          feedback.tone === 'info' && 'border-status-info-border bg-status-info-faint text-status-info',
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
    <button type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors',
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
    <button type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors',
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
