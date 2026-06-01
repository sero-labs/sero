import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { BrowserPackStatusIPC } from '@sero-ai/common';
import { cn } from '@sero-ai/ui/lib/utils';

interface BrowserPackOfferProps {
  reason: string;
  className?: string;
  compact?: boolean;
}

function browserPackMessage(status: BrowserPackStatusIPC | null): string {
  if (!status) return 'Large download for browser screenshots, recordings, and web tasks in Host mode.';
  if (status.state === 'ready') return 'Installed and ready for host workspaces.';
  if (status.state === 'installing') return 'Installing. You can continue setup while it downloads.';
  if (status.state === 'missing') {
    return status.error?.message ?? 'Browser automation is not available for this machine yet. Use a container runtime for browser tasks.';
  }
  if (status.state === 'failed') return status.error?.message ?? 'Install failed. You can retry later or use a container runtime.';
  return 'Large download for browser screenshots, recordings, and web tasks in Host mode.';
}

function updateStatusFromProgress(
  current: BrowserPackStatusIPC | null,
  progress: NonNullable<BrowserPackStatusIPC['progress']>,
): BrowserPackStatusIPC | null {
  if (!current) return null;
  if (progress.phase === 'ready') return { ...current, state: 'ready', progress };
  if (progress.phase === 'failed') return { ...current, state: 'failed', error: progress.error, progress };
  return { ...current, state: 'installing', progress };
}

export function BrowserPackOffer({ reason, className, compact = false }: BrowserPackOfferProps) {
  const [status, setStatus] = useState<BrowserPackStatusIPC | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.sero.workspace.getBrowserPackStatus?.().then((nextStatus) => {
      if (!cancelled && nextStatus) setStatus(nextStatus);
    }).catch(() => undefined);
    const unsubscribe = window.sero.workspace.onBrowserPackProgress?.((event) => {
      setStatus((current) => updateStatusFromProgress(current, event));
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const canRetry = status?.state === 'failed'
    && status.error?.retryable === true
    && status.error.installable === true;
  const canInstall = Boolean(window.sero.workspace?.ensureBrowserPack)
    && status !== null
    && status.state !== 'missing'
    && status.state !== 'ready'
    && status.state !== 'installing'
    && (status.state !== 'failed' || canRetry);

  const install = async () => {
    if (!canInstall || busy) return;
    setBusy(true);
    try {
      const nextStatus = await window.sero.workspace.ensureBrowserPack(reason);
      setStatus(nextStatus);
    } finally {
      setBusy(false);
    }
  };

  const ready = status?.state === 'ready';
  const missing = status?.state === 'missing';
  const installing = busy || status?.state === 'installing';
  const failed = status?.state === 'failed';

  return (
    <div className={cn(
      'rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-3 text-sm text-[var(--text-secondary)]',
      className,
    )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-base)]">
          {ready ? <CheckCircle2 className="size-4 text-[var(--status-success)]" /> : missing ? <AlertCircle className="size-4 text-[var(--status-warning)]" /> : <Download className="size-4 text-[var(--accent-primary)]" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="font-medium text-[var(--text-primary)]">Browser automation</p>
            <p className={cn(compact ? 'text-xs' : undefined, failed ? 'text-[var(--status-error)]' : 'text-[var(--text-muted)]')}>
              {browserPackMessage(status)}
            </p>
          </div>
          {!ready && (canInstall || installing) ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="h-7 text-xs" disabled={!canInstall || installing} onClick={() => void install()}>
                {installing ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : null}
                {failed ? 'Retry install' : installing ? 'Installing...' : 'Install browser support'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
