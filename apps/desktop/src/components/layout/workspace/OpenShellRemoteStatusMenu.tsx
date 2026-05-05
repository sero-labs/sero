import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from 'lucide-react';
import type { OpenShellRemoteDiagnosticsIPC, WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { IconAction } from '@/components/ui/IconAction';
import { useWorkspaceStore } from '@/stores/workspace';
import type { WorkspaceInfo } from '@/types/ipc';

interface OpenShellRemoteStatusMenuProps {
  workspace: WorkspaceInfo;
}

export function OpenShellRemoteStatusMenu({ workspace }: OpenShellRemoteStatusMenuProps) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<WorkspaceRuntimeDiagnosticsIPC | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentWorkspace = useWorkspaceStore(
    (state) => state.workspaces.find((item) => item.id === workspace.id) ?? workspace,
  );

  const remoteDiagnostics = diagnostics?.openShellRemote ?? null;

  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await window.sero.workspace.getRuntimeDiagnostics(currentWorkspace.id);
      setDiagnostics(results.find((item) => item.workspaceId === currentWorkspace.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OpenShell Remote diagnostics are unavailable.');
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadDiagnostics();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <IconAction
          as="span"
          role="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.stopPropagation();
            }
          }}
          title="OpenShell Remote status"
        >
          <Server className="size-3" />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">OpenShell Remote status</h3>
              <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
                SSH-backed Linux host and OpenShell remote gateway diagnostics.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDiagnostics()}
              className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              title="Refresh OpenShell Remote diagnostics"
            >
              <RefreshCw className={loading ? 'size-3 animate-spin' : 'size-3'} />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <RemoteSummary diagnostics={remoteDiagnostics} loading={loading} error={error} />
          <RemoteDetails workspace={currentWorkspace} diagnostics={remoteDiagnostics} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RemoteSummary({
  diagnostics,
  loading,
  error,
}: {
  diagnostics: OpenShellRemoteDiagnosticsIPC | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading && !diagnostics) {
    return <StatusNote>Loading OpenShell Remote diagnostics…</StatusNote>;
  }

  if (error) {
    return <StatusNote>{error}</StatusNote>;
  }

  if (!diagnostics) {
    return (
      <StatusNote>
        Open this menu or refresh to check SSH, Docker, gateway, and sandbox status. Endpoint/cloud gateways are Phase 5.
      </StatusNote>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
      <div className="flex items-start gap-2">
        {diagnostics.status === 'ready' ? (
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--status-success)]" />
        ) : (
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--status-warning)]" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--text-primary)]">{formatStatus(diagnostics.status)}</div>
          <p className="mt-1 break-words text-[11px] leading-snug text-[var(--text-muted)]">{diagnostics.message}</p>
        </div>
      </div>
    </div>
  );
}

function RemoteDetails({
  workspace,
  diagnostics,
}: {
  workspace: WorkspaceInfo;
  diagnostics: OpenShellRemoteDiagnosticsIPC | null;
}) {
  const runtime = workspace.runtime;
  const host = diagnostics?.sshHost ?? 'Missing SSH destination. Add a user@host gateway before running this workspace.';
  const gatewayName = diagnostics?.gatewayName ?? runtime?.gatewayName ?? 'No remote gateway selected';
  const sandboxName = diagnostics?.sandboxName ?? runtime?.sandboxName ?? 'Sandbox not created yet';
  const latency = diagnostics?.latencyMs === undefined ? 'Not measured' : `${diagnostics.latencyMs} ms`;

  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Connection</h4>
      <div className="mt-1 grid gap-1.5">
        <DetailRow label="Host" value={host} />
        <DetailRow label="Gateway" value={gatewayName} />
        <DetailRow label="Sandbox" value={sandboxName} />
        <DetailRow label="Latency" value={latency} />
      </div>
      <p className="mt-2 rounded-md bg-[var(--bg-elevated)] p-2 text-[11px] leading-snug text-[var(--text-muted)]">
        Refresh asks the main process for diagnostics only. It does not run SSH or OpenShell commands in the renderer.
      </p>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 rounded-md border border-[var(--border-subtle)] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="min-w-0 break-words text-[11px] font-medium text-[var(--text-secondary)]">{value}</div>
    </div>
  );
}

function StatusNote({ children }: { children: ReactNode }) {
  return <p className="break-words rounded-md bg-[var(--bg-elevated)] p-2 text-[11px] leading-snug text-[var(--text-muted)]">{children}</p>;
}

function formatStatus(status: OpenShellRemoteDiagnosticsIPC['status']): string {
  if (status === 'ready') return 'Ready';
  if (status === 'unsupported') return 'Unsupported';
  return 'Unavailable';
}
