/**
 * GitHubAuthBanner — inline login prompt for the VCS panel.
 *
 * Shows when GitHub is not authenticated. Drives the Device Flow
 * OAuth directly from the Source Control panel — no settings detour.
 */

import { Check, Copy, Github, Loader2, X } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useGitHubAuthFlow } from '@/hooks/useGitHubAuthFlow';

interface Props {
  className?: string;
}

export function GitHubAuthBanner({ className }: Props) {
  const {
    authStatus,
    flow,
    copied,
    copyFailed,
    startLogin,
    logout,
    cancel,
    copyCode,
  } = useGitHubAuthFlow();

  if (authStatus?.authenticated) {
    return (
      <div className={cn('flex items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-2 py-1.5', className)}>
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--status-success)]">
          <Github className="size-3" />
          <span>Connected as <strong>{authStatus.username}</strong></span>
        </span>
        <button
          onClick={logout}
          className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--status-error)]"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className={cn('rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-2 py-2', className)}>
      {flow.step === 'idle' && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]">
            Connect GitHub to push, fetch, and create PRs.
          </span>
          <button
            onClick={startLogin}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium',
              'bg-[var(--bg-muted)] text-[var(--text-secondary)]',
              'transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
            )}
          >
            <Github className="size-3" />
            Connect GitHub
          </button>
        </div>
      )}

      {flow.step === 'code' && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-[var(--text-muted)]">
            Enter this code at{' '}
            <a
              href={flow.verificationUri}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--status-info)] underline"
            >
              github.com/login/device
            </a>
          </p>
          <div className="flex items-center gap-1.5">
            <code className="rounded border border-[var(--status-info-subtle)] bg-[var(--status-info-muted)] px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-[var(--status-info)]">
              {flow.userCode}
            </code>
            <button
              onClick={() => void copyCode(flow.userCode)}
              title="Copy code"
              className="text-[var(--text-muted)] transition-colors hover:text-[var(--status-info)]"
            >
              {copied ? <Check className="size-3 text-[var(--status-success)]" /> : <Copy className="size-3" />}
            </button>
            <button
              onClick={cancel}
              title="Cancel"
              className="ml-auto text-[var(--text-muted)] transition-colors hover:text-[var(--status-error)]"
            >
              <X className="size-3" />
            </button>
          </div>
          <p className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]/60">
            <Loader2 className="size-3 animate-spin" />
            Waiting for authorization…
          </p>
          {copyFailed ? (
            <p className="text-[10px] text-[var(--status-error)]">Copy failed — enter the code manually.</p>
          ) : null}
        </div>
      )}

      {flow.step === 'polling' && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <Loader2 className="size-3 animate-spin" />
          Waiting for authorization…
          <button
            onClick={cancel}
            className="ml-auto text-[var(--text-muted)] transition-colors hover:text-[var(--status-error)]"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {flow.step === 'success' && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--status-success)]">
          <Check className="size-3" />
          Connected as <strong>{flow.username}</strong>
        </div>
      )}

      {flow.step === 'error' && (
        <div className="space-y-1">
          <p className="text-[10px] text-[var(--status-error)]">{flow.message}</p>
          <button
            onClick={startLogin}
            className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
