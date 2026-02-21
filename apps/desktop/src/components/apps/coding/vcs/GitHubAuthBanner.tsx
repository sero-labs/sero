/**
 * GitHubAuthBanner — inline login prompt for the VCS panel.
 *
 * Shows when GitHub is not authenticated. Drives the Device Flow
 * OAuth directly from the Source Control panel — no settings detour.
 */

import { useCallback, useEffect, useState } from 'react';
import { Github, Loader2, Check, X, Copy } from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';

type FlowState =
  | { step: 'idle' }
  | { step: 'code'; userCode: string; verificationUri: string }
  | { step: 'polling' }
  | { step: 'success'; username: string }
  | { step: 'error'; message: string };

interface Props {
  className?: string;
}

export function GitHubAuthBanner({ className }: Props) {
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    username?: string;
  } | null>(null);
  const [flow, setFlow] = useState<FlowState>({ step: 'idle' });
  const [copied, setCopied] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    void window.sero.github.status().then(setAuthStatus).catch(() => {});
  }, []);

  // Subscribe to device flow events
  useEffect(() => {
    const unsub = window.sero.github.onEvent((event) => {
      switch (event.type) {
        case 'code':
          setFlow({
            step: 'code',
            userCode: event.userCode ?? '',
            verificationUri: event.verificationUri ?? '',
          });
          break;
        case 'polling':
          // Don't overwrite 'code' state — keep showing the code while polling.
          // The 'code' view already has its own "Waiting for authorization…" spinner.
          setFlow((prev) => (prev.step === 'code' ? prev : { step: 'polling' }));
          break;
        case 'success':
          setFlow({ step: 'success', username: event.username ?? '' });
          setAuthStatus({ authenticated: true, username: event.username });
          break;
        case 'error':
          setFlow({ step: 'error', message: event.message ?? 'Login failed' });
          break;
      }
    });
    return unsub;
  }, []);

  const handleLogin = useCallback(() => {
    setFlow({ step: 'idle' });
    void window.sero.github.login();
  }, []);

  const handleLogout = useCallback(() => {
    void window.sero.github.logout().then(() => {
      setAuthStatus({ authenticated: false });
      setFlow({ step: 'idle' });
    });
  }, []);

  const handleCancel = useCallback(() => {
    void window.sero.github.cancel();
    setFlow({ step: 'idle' });
  }, []);

  const handleCopyCode = useCallback((code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Already authenticated — show compact indicator
  if (authStatus?.authenticated) {
    return (
      <div className={cn('flex items-center justify-between rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-2 py-1.5', className)}>
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <Github className="size-3" />
          <span>Connected as <strong>{authStatus.username}</strong></span>
        </span>
        <button
          onClick={handleLogout}
          className="text-[10px] text-[var(--text-muted)] hover:text-red-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Not authenticated — show login flow
  return (
    <div className={cn('rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-2 py-2', className)}>
      {flow.step === 'idle' && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]">
            Connect GitHub to push, fetch, and create PRs.
          </span>
          <button
            onClick={handleLogin}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium',
              'bg-[var(--bg-muted)] text-[var(--text-secondary)]',
              'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
              'transition-colors',
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
              className="text-blue-300 underline"
            >
              github.com/login/device
            </a>
          </p>
          <div className="flex items-center gap-1.5">
            <code className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-blue-200">
              {flow.userCode}
            </code>
            <button
              onClick={() => handleCopyCode(flow.userCode)}
              title="Copy code"
              className="text-[var(--text-muted)] hover:text-blue-300 transition-colors"
            >
              {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            </button>
            <button
              onClick={handleCancel}
              title="Cancel"
              className="ml-auto text-[var(--text-muted)] hover:text-red-400 transition-colors"
            >
              <X className="size-3" />
            </button>
          </div>
          <p className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]/60">
            <Loader2 className="size-3 animate-spin" />
            Waiting for authorization…
          </p>
        </div>
      )}

      {flow.step === 'polling' && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <Loader2 className="size-3 animate-spin" />
          Waiting for authorization…
          <button
            onClick={handleCancel}
            className="ml-auto text-[var(--text-muted)] hover:text-red-400 transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {flow.step === 'success' && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <Check className="size-3" />
          Connected as <strong>{flow.username}</strong>
        </div>
      )}

      {flow.step === 'error' && (
        <div className="space-y-1">
          <p className="text-[10px] text-red-400">{flow.message}</p>
          <button
            onClick={handleLogin}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
