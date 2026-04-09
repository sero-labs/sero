import { Check, Copy, Github, Loader2, X } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { useGitHubAuthFlow } from '@/hooks/useGitHubAuthFlow';

export function GitHubConnectCard({ showConnectedState = false }: { showConnectedState?: boolean }) {
  const {
    authStatus,
    statusReady,
    flow,
    copied,
    copyFailed,
    startLogin,
    cancel,
    copyCode,
  } = useGitHubAuthFlow();

  if (!statusReady) return null;
  if (authStatus?.authenticated && flow.step === 'idle' && !showConnectedState) return null;

  return (
    <div className="rounded-lg border border-[var(--status-info)]/20 bg-[var(--status-info)]/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <Github className="size-4 text-[var(--text-primary)]" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">Connect GitHub</p>
              <span className="rounded-full border border-[var(--status-warning)]/25 bg-[var(--status-warning)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--status-warning)]">
                Recommended
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Strongly suggested if you work with repos. You can skip this for now and connect later from Explorer.
            </p>
          </div>

          {flow.step === 'idle' && !authStatus?.authenticated && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={startLogin}>
                <Github className="mr-2 size-3.5" />
                Connect GitHub
              </Button>
              <span className="text-[11px] text-[var(--text-muted)]">
                Enables clone, commit, push, fetch, and PR workflows.
              </span>
            </div>
          )}

          {flow.step === 'code' && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">
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
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded border border-[var(--status-info)]/20 bg-[var(--bg-base)] px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-[var(--status-info)]">
                  {flow.userCode}
                </code>
                <button
                  onClick={() => void copyCode(flow.userCode)}
                  title="Copy code"
                  className="text-[var(--text-muted)] transition-colors hover:text-[var(--status-info)]"
                >
                  {copied ? <Check className="size-4 text-[var(--status-success)]" /> : <Copy className="size-4" />}
                </button>
                <button
                  onClick={cancel}
                  title="Cancel"
                  className="text-[var(--text-muted)] transition-colors hover:text-[var(--status-error)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <Loader2 className="size-3.5 animate-spin" />
                Waiting for authorization. Continue below to skip for now.
              </p>
              {copyFailed ? (
                <p className="text-[11px] text-[var(--status-error)]">
                  Copy failed — enter the code manually.
                </p>
              ) : null}
            </div>
          )}

          {flow.step === 'polling' && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <Loader2 className="size-3.5 animate-spin" />
              Waiting for authorization…
              <button
                onClick={cancel}
                className="ml-auto text-[var(--text-muted)] transition-colors hover:text-[var(--status-error)]"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {(flow.step === 'success' || (showConnectedState && authStatus?.authenticated && flow.step === 'idle')) && (
            <div className="flex items-center gap-2 text-xs text-[var(--status-success)]">
              <Check className="size-4" />
              Connected as <strong>{flow.step === 'success' ? flow.username : (authStatus?.username ?? 'GitHub user')}</strong>
            </div>
          )}

          {flow.step === 'error' && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--status-error)]">{flow.message}</p>
              <Button size="sm" variant="outline" onClick={startLogin}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
