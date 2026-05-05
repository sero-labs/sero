import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Pencil, RefreshCw, Server } from 'lucide-react';
import type { OpenShellRemoteDiagnosticsIPC, WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { IconAction } from '@/components/ui/IconAction';
import { useWorkspaceStore } from '@/stores/workspace';
import type { OpenShellRemoteGatewayEntry, WorkspaceInfo } from '@/types/ipc';

interface OpenShellRemoteStatusMenuProps {
  workspace: WorkspaceInfo;
}

export function OpenShellRemoteStatusMenu({ workspace }: OpenShellRemoteStatusMenuProps) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<WorkspaceRuntimeDiagnosticsIPC | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editGatewayName, setEditGatewayName] = useState('');
  const [editSshHost, setEditSshHost] = useState('');
  const [editSshKeyPath, setEditSshKeyPath] = useState('');
  const [editPort, setEditPort] = useState('18080');
  const [editGatewayHost, setEditGatewayHost] = useState('');
  const [saving, setSaving] = useState(false);
  const currentWorkspace = useWorkspaceStore(
    (state) => state.workspaces.find((item) => item.id === workspace.id) ?? workspace,
  );

  const loadOpenShellRemoteGateways = useWorkspaceStore((state) => state.loadOpenShellRemoteGateways);
  const saveOpenShellRemoteGateway = useWorkspaceStore((state) => state.saveOpenShellRemoteGateway);
  const setRuntime = useWorkspaceStore((state) => state.setRuntime);
  const remoteDiagnostics = diagnostics?.openShellRemote ?? null;

  const populateEditForm = (gateways: OpenShellRemoteGatewayEntry[]) => {
    const runtime = currentWorkspace.runtime;
    const gateway = gateways.find((entry) => entry.id === runtime?.remoteGatewayId);
    setEditGatewayName(gateway?.name ?? runtime?.gatewayName ?? 'sero-remote');
    setEditSshHost(gateway?.sshHost ?? '');
    setEditSshKeyPath(gateway?.sshKeyPath ?? '');
    setEditPort(String(gateway?.port ?? 18080));
    setEditGatewayHost(gateway?.gatewayHost ?? '');
  };

  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [results, gateways] = await Promise.all([
        window.sero.workspace.getRuntimeDiagnostics(currentWorkspace.id),
        loadOpenShellRemoteGateways(),
      ]);
      setDiagnostics(results.find((item) => item.workspaceId === currentWorkspace.id) ?? null);
      populateEditForm(gateways);
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
    } else {
      setEditing(false);
    }
  };

  const saveGateway = async () => {
    const runtime = currentWorkspace.runtime;
    if (runtime?.providerId !== 'openshell-remote') return;

    const name = editGatewayName.trim();
    const sshHost = editSshHost.trim();
    const port = editPort.trim() ? Number(editPort.trim()) : 18080;
    if (!name || !sshHost) {
      setError('OpenShell Remote requires a gateway name and SSH destination like user@host.');
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      setError('OpenShell Remote port must be an integer between 1 and 65535.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const gateway = await saveOpenShellRemoteGateway({
        id: runtime.remoteGatewayId ?? toRemoteGatewayId(name),
        name,
        sshHost,
        sshKeyPath: editSshKeyPath.trim() || undefined,
        port,
        gatewayHost: editGatewayHost.trim() || undefined,
      });
      await setRuntime(currentWorkspace.id, {
        ...runtime,
        remoteGatewayId: gateway.id,
        gatewayName: gateway.name,
        experimental: runtime.experimental ?? true,
      });
      setEditing(false);
      await loadDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save OpenShell Remote gateway.');
    } finally {
      setSaving(false);
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
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                title="Edit OpenShell Remote gateway"
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => void loadDiagnostics()}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                title="Refresh OpenShell Remote diagnostics"
              >
                <RefreshCw className={loading ? 'size-3 animate-spin' : 'size-3'} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <RemoteSummary diagnostics={remoteDiagnostics} loading={loading} error={error} />
          {editing ? (
            <RemoteGatewayEditor
              gatewayName={editGatewayName}
              sshHost={editSshHost}
              sshKeyPath={editSshKeyPath}
              port={editPort}
              gatewayHost={editGatewayHost}
              saving={saving}
              onGatewayNameChange={setEditGatewayName}
              onSshHostChange={setEditSshHost}
              onSshKeyPathChange={setEditSshKeyPath}
              onPortChange={setEditPort}
              onGatewayHostChange={setEditGatewayHost}
              onCancel={() => setEditing(false)}
              onSave={() => void saveGateway()}
            />
          ) : (
            <RemoteDetails workspace={currentWorkspace} diagnostics={remoteDiagnostics} />
          )}
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

function RemoteGatewayEditor({
  gatewayName,
  sshHost,
  sshKeyPath,
  port,
  gatewayHost,
  saving,
  onGatewayNameChange,
  onSshHostChange,
  onSshKeyPathChange,
  onPortChange,
  onGatewayHostChange,
  onCancel,
  onSave,
}: {
  gatewayName: string;
  sshHost: string;
  sshKeyPath: string;
  port: string;
  gatewayHost: string;
  saving: boolean;
  onGatewayNameChange: (value: string) => void;
  onSshHostChange: (value: string) => void;
  onSshKeyPathChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onGatewayHostChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Edit gateway</h4>
      <div className="mt-2 grid gap-2">
        <GatewayInput label="Gateway name" value={gatewayName} onChange={onGatewayNameChange} placeholder="sero-remote-gcp" />
        <GatewayInput label="SSH destination" value={sshHost} onChange={onSshHostChange} placeholder="user@host" />
        <GatewayInput label="SSH key path" value={sshKeyPath} onChange={onSshKeyPathChange} placeholder="Optional SSH key path" />
        <div className="grid grid-cols-2 gap-2">
          <GatewayInput label="Port" value={port} onChange={onPortChange} placeholder="18080" />
          <GatewayInput label="Gateway host" value={gatewayHost} onChange={onGatewayHostChange} placeholder="Public IP" />
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-6 px-2 text-xs" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </section>
  );
}

function GatewayInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-medium text-[var(--text-secondary)]">
      {label}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 text-xs"
      />
    </label>
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

function toRemoteGatewayId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `openshell-remote-${slug || 'gateway'}`;
}
