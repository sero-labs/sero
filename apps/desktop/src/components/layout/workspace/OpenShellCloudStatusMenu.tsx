import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { OpenShellCloudDiagnosticsIPC, WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { IconAction } from '@/components/ui/IconAction';
import { useWorkspaceStore } from '@/stores/workspace';
import type { OpenShellCloudAuthMode, OpenShellCloudGatewayEntry, WorkspaceInfo } from '@/types/ipc';

interface OpenShellCloudStatusMenuProps {
  workspace: WorkspaceInfo;
}

const AUTH_MODES: OpenShellCloudAuthMode[] = ['none', 'browser', 'external'];

export function OpenShellCloudStatusMenu({ workspace }: OpenShellCloudStatusMenuProps) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<WorkspaceRuntimeDiagnosticsIPC | null>(null);
  const [gateways, setGateways] = useState<OpenShellCloudGatewayEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [editGatewayName, setEditGatewayName] = useState('');
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editAuthMode, setEditAuthMode] = useState<OpenShellCloudAuthMode>('browser');
  const [editResourceLabel, setEditResourceLabel] = useState('');
  const [editCpuLabel, setEditCpuLabel] = useState('');
  const [editMemoryLabel, setEditMemoryLabel] = useState('');
  const [editGpuLabel, setEditGpuLabel] = useState('');
  const [editCostLabel, setEditCostLabel] = useState('');
  const [editIdleTimeoutMinutes, setEditIdleTimeoutMinutes] = useState('60');
  const currentWorkspace = useWorkspaceStore(
    (state) => state.workspaces.find((item) => item.id === workspace.id) ?? workspace,
  );

  const loadOpenShellCloudGateways = useWorkspaceStore((state) => state.loadOpenShellCloudGateways);
  const saveOpenShellCloudGateway = useWorkspaceStore((state) => state.saveOpenShellCloudGateway);
  const loginOpenShellCloudGateway = useWorkspaceStore((state) => state.loginOpenShellCloudGateway);
  const destroyOpenShellCloudSandbox = useWorkspaceStore((state) => state.destroyOpenShellCloudSandbox);
  const setRuntime = useWorkspaceStore((state) => state.setRuntime);
  const cloudDiagnostics = diagnostics?.openShellCloud ?? null;

  const selectedGateway = gateways.find((entry) => entry.id === currentWorkspace.runtime?.cloudGatewayId) ?? null;

  const populateEditForm = (nextGateways: OpenShellCloudGatewayEntry[]) => {
    const runtime = currentWorkspace.runtime;
    const gateway = nextGateways.find((entry) => entry.id === runtime?.cloudGatewayId);
    setEditGatewayName(gateway?.name ?? runtime?.gatewayName ?? 'sero-cloud');
    setEditEndpoint(gateway?.endpoint ?? cloudDiagnostics?.endpoint ?? '');
    setEditAuthMode(gateway?.authMode ?? 'browser');
    setEditResourceLabel(gateway?.resourceLabel ?? cloudDiagnostics?.resourceLabel ?? '');
    setEditCpuLabel(gateway?.cpuLabel ?? '');
    setEditMemoryLabel(gateway?.memoryLabel ?? '');
    setEditGpuLabel(gateway?.gpuLabel ?? '');
    setEditCostLabel(gateway?.costLabel ?? cloudDiagnostics?.costLabel ?? '');
    setEditIdleTimeoutMinutes(String(gateway?.idleTimeoutMinutes ?? runtime?.idleTimeoutMinutes ?? 60));
  };

  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [results, nextGateways] = await Promise.all([
        window.sero.workspace.getRuntimeDiagnostics(currentWorkspace.id),
        loadOpenShellCloudGateways(),
      ]);
      setDiagnostics(results.find((item) => item.workspaceId === currentWorkspace.id) ?? null);
      setGateways(nextGateways);
      populateEditForm(nextGateways);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OpenShell Cloud diagnostics are unavailable.');
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
      setLoginMessage(null);
    }
  };

  const saveGateway = async () => {
    const runtime = currentWorkspace.runtime;
    if (runtime?.providerId !== 'openshell-cloud') return;

    const name = editGatewayName.trim();
    const endpoint = editEndpoint.trim();
    const idleTimeoutMinutes = Number(editIdleTimeoutMinutes.trim());
    if (!name || !endpoint) {
      setError('OpenShell Cloud requires a gateway name and endpoint.');
      return;
    }
    if (!Number.isInteger(idleTimeoutMinutes) || idleTimeoutMinutes < 1) {
      setError('OpenShell Cloud idle timeout must be a positive integer.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const gateway = await saveOpenShellCloudGateway({
        id: runtime.cloudGatewayId ?? toCloudGatewayId(name),
        name,
        endpoint,
        authMode: editAuthMode,
        resourceLabel: optionalValue(editResourceLabel),
        cpuLabel: optionalValue(editCpuLabel),
        memoryLabel: optionalValue(editMemoryLabel),
        gpuLabel: optionalValue(editGpuLabel),
        costLabel: optionalValue(editCostLabel),
        idleTimeoutMinutes,
      });
      await setRuntime(currentWorkspace.id, {
        ...runtime,
        cloudGatewayId: gateway.id,
        gatewayName: gateway.name,
        idleTimeoutMinutes: gateway.idleTimeoutMinutes,
        experimental: runtime.experimental ?? true,
      });
      setEditing(false);
      await loadDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save OpenShell Cloud gateway.');
    } finally {
      setSaving(false);
    }
  };

  const login = async () => {
    const gatewayId = currentWorkspace.runtime?.cloudGatewayId;
    if (!gatewayId) {
      setError('Select an OpenShell Cloud gateway before logging in.');
      return;
    }
    setError(null);
    setLoginMessage(null);
    try {
      const result = await loginOpenShellCloudGateway(gatewayId);
      setLoginMessage(result.message);
      await loadDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OpenShell Cloud login failed.');
    }
  };

  const destroySandbox = async () => {
    setDestroying(true);
    setError(null);
    try {
      await destroyOpenShellCloudSandbox(currentWorkspace.id);
      await loadDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to destroy OpenShell Cloud sandbox.');
    } finally {
      setDestroying(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <IconAction
          as="span"
          role="button"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.stopPropagation();
          }}
          title="OpenShell Cloud status"
        >
          <Cloud className="size-3" />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-96 max-w-[calc(100vw-2rem)] p-0"
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">OpenShell Cloud status</h3>
              <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
                Hosted gateway auth, sandbox health, stale-session, resource, and cleanup diagnostics.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <HeaderButton title="Edit OpenShell Cloud metadata" onClick={() => setEditing((value) => !value)}>
                <Pencil className="size-3" />
              </HeaderButton>
              <HeaderButton title="Refresh OpenShell Cloud diagnostics" onClick={() => void loadDiagnostics()}>
                <RefreshCw className={loading ? 'size-3 animate-spin' : 'size-3'} />
              </HeaderButton>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <CloudSummary diagnostics={cloudDiagnostics} loading={loading} error={error} />
          {loginMessage && <StatusNote>{loginMessage}</StatusNote>}
          {editing ? (
            <CloudGatewayEditor
              gatewayName={editGatewayName}
              endpoint={editEndpoint}
              authMode={editAuthMode}
              resourceLabel={editResourceLabel}
              cpuLabel={editCpuLabel}
              memoryLabel={editMemoryLabel}
              gpuLabel={editGpuLabel}
              costLabel={editCostLabel}
              idleTimeoutMinutes={editIdleTimeoutMinutes}
              saving={saving}
              onGatewayNameChange={setEditGatewayName}
              onEndpointChange={setEditEndpoint}
              onAuthModeChange={setEditAuthMode}
              onResourceLabelChange={setEditResourceLabel}
              onCpuLabelChange={setEditCpuLabel}
              onMemoryLabelChange={setEditMemoryLabel}
              onGpuLabelChange={setEditGpuLabel}
              onCostLabelChange={setEditCostLabel}
              onIdleTimeoutMinutesChange={setEditIdleTimeoutMinutes}
              onCancel={() => setEditing(false)}
              onSave={() => void saveGateway()}
            />
          ) : (
            <CloudDetails workspace={currentWorkspace} diagnostics={cloudDiagnostics} gateway={selectedGateway} />
          )}
          <CloudActions
            authMode={selectedGateway?.authMode ?? 'browser'}
            destroying={destroying}
            onLogin={() => void login()}
            onDestroy={() => void destroySandbox()}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CloudSummary({ diagnostics, loading, error }: { diagnostics: OpenShellCloudDiagnosticsIPC | null; loading: boolean; error: string | null }) {
  if (loading && !diagnostics) return <StatusNote>Loading OpenShell Cloud diagnostics…</StatusNote>;
  if (error) return <StatusNote>{error}</StatusNote>;
  if (!diagnostics) return <StatusNote>Open this menu or refresh to check OpenShell Cloud endpoint, auth, sandbox, and stale status.</StatusNote>;

  const ready = diagnostics.status === 'ready';
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
      <div className="flex items-start gap-2">
        {ready ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--status-success)]" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--status-warning)]" />}
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--text-primary)]">{formatStatus(diagnostics.status)}</div>
          <p className="mt-1 break-words text-[11px] leading-snug text-[var(--text-muted)]">{diagnostics.message}</p>
        </div>
      </div>
    </div>
  );
}

function CloudDetails({ workspace, diagnostics, gateway }: { workspace: WorkspaceInfo; diagnostics: OpenShellCloudDiagnosticsIPC | null; gateway: OpenShellCloudGatewayEntry | null }) {
  const runtime = workspace.runtime;
  const latency = diagnostics?.latencyMs === undefined ? 'Not measured' : `${diagnostics.latencyMs} ms`;
  const idleTimeout = diagnostics?.idleTimeoutMinutes ?? gateway?.idleTimeoutMinutes ?? runtime?.idleTimeoutMinutes ?? 60;
  const lastActivity = diagnostics?.lastActivityAt ?? runtime?.lastActivityAt ?? 'No activity recorded yet';
  const resource = diagnostics?.resourceLabel ?? gateway?.resourceLabel ?? 'No resource metadata set';
  const cost = diagnostics?.costLabel ?? gateway?.costLabel ?? 'No cost metadata set';

  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Cloud runtime</h4>
      <div className="mt-1 grid gap-1.5">
        <DetailRow label="Endpoint" value={diagnostics?.endpoint ?? gateway?.endpoint ?? 'No endpoint selected'} />
        <DetailRow label="Gateway" value={diagnostics?.gatewayName ?? gateway?.name ?? runtime?.gatewayName ?? 'No cloud gateway selected'} />
        <DetailRow label="Auth" value={formatAuthMode(gateway?.authMode)} />
        <DetailRow label="Sandbox" value={diagnostics?.sandboxName ?? runtime?.sandboxName ?? 'Sandbox not created yet'} />
        <DetailRow label="Latency" value={latency} />
        <DetailRow label="Idle" value={`${idleTimeout} minutes`} />
        <DetailRow label="Last active" value={lastActivity} />
        <DetailRow label="Resources" value={resource} />
        <DetailRow label="Cost" value={cost} />
      </div>
      {diagnostics?.stale && (
        <p className="mt-2 rounded-md border border-[var(--status-warning)]/40 bg-[var(--bg-elevated)] p-2 text-[11px] leading-snug text-[var(--text-secondary)]">
          This sandbox appears stale. It may continue using hosted resources until a sandbox destroy succeeds.
        </p>
      )}
      <p className="mt-2 rounded-md bg-[var(--bg-elevated)] p-2 text-[11px] leading-snug text-[var(--text-muted)]">
        Resource and cost values are advisory metadata. Cleanup requires a successful sandbox destroy; removing or editing gateway metadata does not delete the sandbox.
      </p>
    </section>
  );
}

function CloudActions({ authMode, destroying, onLogin, onDestroy }: { authMode: OpenShellCloudAuthMode; destroying: boolean; onLogin: () => void; onDestroy: () => void }) {
  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Actions</h4>
      <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
        Login delegates auth to the OpenShell CLI. Destroy sandbox deletes only this workspace sandbox and keeps cloud gateway metadata.
      </p>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onLogin} disabled={authMode === 'none'}>
          Login
        </Button>
        <Button type="button" variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={onDestroy} disabled={destroying}>
          <Trash2 className="mr-1 size-3" />
          {destroying ? 'Destroying…' : 'Destroy sandbox'}
        </Button>
      </div>
    </section>
  );
}

function CloudGatewayEditor(props: {
  gatewayName: string;
  endpoint: string;
  authMode: OpenShellCloudAuthMode;
  resourceLabel: string;
  cpuLabel: string;
  memoryLabel: string;
  gpuLabel: string;
  costLabel: string;
  idleTimeoutMinutes: string;
  saving: boolean;
  onGatewayNameChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  onAuthModeChange: (value: OpenShellCloudAuthMode) => void;
  onResourceLabelChange: (value: string) => void;
  onCpuLabelChange: (value: string) => void;
  onMemoryLabelChange: (value: string) => void;
  onGpuLabelChange: (value: string) => void;
  onCostLabelChange: (value: string) => void;
  onIdleTimeoutMinutesChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Edit cloud metadata</h4>
      <div className="mt-2 grid gap-2">
        <GatewayInput label="Gateway name" value={props.gatewayName} onChange={props.onGatewayNameChange} placeholder="sero-cloud-prod" />
        <GatewayInput label="Endpoint" value={props.endpoint} onChange={props.onEndpointChange} placeholder="https://openshell.example.com" />
        <label className="grid gap-1 text-[11px] font-medium text-[var(--text-secondary)]">
          Auth mode
          <select value={props.authMode} onChange={(event) => props.onAuthModeChange(event.target.value as OpenShellCloudAuthMode)} className="h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-xs">
            {AUTH_MODES.map((mode) => <option key={mode} value={mode}>{formatAuthMode(mode)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <GatewayInput label="Resources" value={props.resourceLabel} onChange={props.onResourceLabelChange} placeholder="2 CPU / 4 GB" />
          <GatewayInput label="Cost" value={props.costLabel} onChange={props.onCostLabelChange} placeholder="$0.20/hr advisory" />
          <GatewayInput label="CPU" value={props.cpuLabel} onChange={props.onCpuLabelChange} placeholder="Optional" />
          <GatewayInput label="Memory" value={props.memoryLabel} onChange={props.onMemoryLabelChange} placeholder="Optional" />
          <GatewayInput label="GPU" value={props.gpuLabel} onChange={props.onGpuLabelChange} placeholder="Optional" />
          <GatewayInput label="Idle minutes" value={props.idleTimeoutMinutes} onChange={props.onIdleTimeoutMinutesChange} placeholder="60" />
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={props.onCancel} disabled={props.saving}>Cancel</Button>
        <Button type="button" size="sm" className="h-6 px-2 text-xs" onClick={props.onSave} disabled={props.saving}>{props.saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </section>
  );
}

function HeaderButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]" title={title}>{children}</button>;
}

function GatewayInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-1 text-[11px] font-medium text-[var(--text-secondary)]">{label}<Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-7 text-xs" /></label>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[5rem_1fr] gap-2 rounded-md border border-[var(--border-subtle)] px-2 py-1.5"><div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div><div className="min-w-0 break-words text-[11px] font-medium text-[var(--text-secondary)]">{value}</div></div>;
}

function StatusNote({ children }: { children: ReactNode }) {
  return <p className="break-words rounded-md bg-[var(--bg-elevated)] p-2 text-[11px] leading-snug text-[var(--text-muted)]">{children}</p>;
}

function formatStatus(status: OpenShellCloudDiagnosticsIPC['status']): string {
  if (status === 'ready') return 'Ready';
  if (status === 'auth-required') return 'Auth required';
  if (status === 'stale') return 'Stale sandbox';
  if (status === 'unsupported') return 'Unsupported';
  return 'Unavailable';
}

function formatAuthMode(mode: OpenShellCloudAuthMode | undefined): string {
  if (mode === 'none') return 'No auth';
  if (mode === 'external') return 'External auth';
  return 'Browser login';
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toCloudGatewayId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `openshell-cloud-${slug || 'gateway'}`;
}
