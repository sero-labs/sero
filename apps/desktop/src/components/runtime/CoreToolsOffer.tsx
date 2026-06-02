import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { ToolchainStatusIPC } from '@sero-ai/common';
import { cn } from '@sero-ai/ui/lib/utils';

interface CoreToolsOfferProps {
  reason: string;
  className?: string;
  autoInstall?: boolean;
}

function coreToolsMessage(status: ToolchainStatusIPC | null): string {
  if (!status) return 'Required for host terminals, Git, language servers, package installs, and dev servers.';
  if (status.state === 'ready') return 'Installed or provided by your system and ready for host workspaces.';
  if (status.state === 'installing') return 'Installing. You can continue setup while Sero verifies the toolchain.';
  if (status.state === 'failed') return status.error?.message ?? 'Install failed. Retry or use a container runtime.';
  const missingTool = status.tools.find((tool) => tool.state !== 'ready')?.tool;
  return missingTool
    ? `${missingTool} is missing or incompatible. Sero can install its managed core tools.`
    : 'Sero can install its managed core tools for host workspaces.';
}

function updateStatusFromProgress(
  current: ToolchainStatusIPC | null,
  progress: NonNullable<ToolchainStatusIPC['progress']>,
): ToolchainStatusIPC | null {
  if (!current) return null;
  if (progress.phase === 'ready') return { ...current, state: 'ready', progress };
  if (progress.phase === 'failed') return { ...current, state: 'failed', error: progress.error, progress };
  return { ...current, state: 'installing', progress };
}

export function CoreToolsOffer({ reason, className, autoInstall = false }: CoreToolsOfferProps) {
  const [status, setStatus] = useState<ToolchainStatusIPC | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const nextStatus = await window.sero.workspace.getToolchainStatus?.();
      if (cancelled || !nextStatus) return;
      setStatus(nextStatus);
      if (autoInstall && nextStatus.state === 'missing') {
        await installFromStatus(nextStatus);
      }
    };

    const installFromStatus = async (currentStatus: ToolchainStatusIPC) => {
      if (cancelled || currentStatus.error?.installable === false) return;
      setBusy(true);
      try {
        const installedStatus = await window.sero.workspace.ensureCoreTools?.(reason);
        if (!cancelled && installedStatus) setStatus(installedStatus);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    void load().catch(() => undefined);
    const unsubscribe = window.sero.workspace.onToolchainProgress?.((event) => {
      setStatus((current) => updateStatusFromProgress(current, event));
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [autoInstall, reason]);

  const canRetry = status?.state === 'failed'
    && status.error?.retryable === true
    && status.error.installable === true;
  const canInstall = Boolean(window.sero.workspace?.ensureCoreTools)
    && status !== null
    && status.state !== 'ready'
    && status.state !== 'installing'
    && status.error?.installable !== false
    && (status.state !== 'failed' || canRetry);

  const install = async () => {
    if (!canInstall || busy) return;
    const ensureCoreTools = window.sero.workspace.ensureCoreTools;
    if (!ensureCoreTools) return;
    setBusy(true);
    try {
      const nextStatus = await ensureCoreTools(reason);
      setStatus(nextStatus);
    } finally {
      setBusy(false);
    }
  };

  const ready = status?.state === 'ready';
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
          {ready ? <CheckCircle2 className="size-4 text-status-success" /> : failed ? <AlertCircle className="size-4 text-status-warning" /> : <Download className="size-4 text-[var(--accent-primary)]" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="font-medium text-[var(--text-primary)]">Core development tools</p>
            <p className={cn(failed ? 'text-status-error' : 'text-[var(--text-muted)]')}>
              {coreToolsMessage(status)}
            </p>
          </div>
          {!ready && (canInstall || installing) ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="h-7 text-xs" disabled={!canInstall || installing} onClick={() => void install()}>
                {installing ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : null}
                {failed ? 'Retry install' : installing ? 'Installing...' : 'Install core tools'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
