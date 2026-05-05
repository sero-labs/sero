import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  type OpenShellPolicyProfileId,
} from '@sero-ai/common';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import type { OpenShellCloudAuthMode, WorkspaceInfo, WorkspaceRuntimeConfig } from '@/types/ipc';
import { IconAction } from '@/components/ui/IconAction';
import { PickView, CreateView, type RuntimeChoice } from './AddWorkspaceViews';
import { RemoteOriginManager } from './RemoteOriginManager';

// ── Add Workspace menu ─────────────────────────────────────────

type AddView = 'pick' | 'create';

interface RemoteGatewayRuntimeSelection {
  id: string;
  name: string;
}

interface CloudGatewayRuntimeSelection {
  id: string;
  name: string;
  idleTimeoutMinutes: number;
}

function toRemoteGatewayId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `openshell-remote-${slug || 'gateway'}`;
}

export function toCloudGatewayId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `openshell-cloud-${slug || 'gateway'}`;
}

export function validateCloudEndpoint(endpoint: string): string | null {
  const trimmed = endpoint.trim();
  if (!trimmed) return 'OpenShell Cloud requires an HTTPS endpoint.';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return null;
    if (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return null;
    }
  } catch {
    return 'OpenShell Cloud endpoint must be a valid URL.';
  }

  return 'OpenShell Cloud endpoints must use HTTPS unless they are localhost test endpoints.';
}

export function toRuntimeConfig(
  choice: RuntimeChoice,
  policyProfileId: OpenShellPolicyProfileId = DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  remoteGateway?: RemoteGatewayRuntimeSelection,
  cloudGateway?: CloudGatewayRuntimeSelection,
): WorkspaceRuntimeConfig | undefined {
  if (choice === 'default') return undefined;
  if (choice === 'openshell-local') {
    const changedAt = new Date().toISOString();
    return {
      providerId: choice,
      gatewayName: 'sero-local',
      experimental: true,
      policyProfileId,
      policyProfileUpdatedAt: changedAt,
      policyProfileHistory: [
        {
          profileId: policyProfileId,
          changedAt,
          message: 'Selected during workspace creation',
        },
      ],
    };
  }
  if (choice === 'openshell-remote') {
    if (!remoteGateway) return undefined;
    return {
      providerId: 'openshell-remote',
      remoteGatewayId: remoteGateway.id,
      gatewayName: remoteGateway.name,
      experimental: true,
    };
  }
  if (choice === 'openshell-cloud') {
    if (!cloudGateway) return undefined;
    return {
      providerId: 'openshell-cloud',
      cloudGatewayId: cloudGateway.id,
      gatewayName: cloudGateway.name,
      idleTimeoutMinutes: cloudGateway.idleTimeoutMinutes,
      experimental: true,
    };
  }
  return { providerId: choice };
}

export function AddWorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AddView>('pick');
  const [newName, setNewName] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [runtimeChoice, setRuntimeChoice] = useState<RuntimeChoice>('default');
  const [policyProfileId, setPolicyProfileId] = useState<OpenShellPolicyProfileId>(
    DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  );
  const [remoteGatewayName, setRemoteGatewayName] = useState('sero-remote');
  const [remoteSshHost, setRemoteSshHost] = useState('');
  const [remoteSshKeyPath, setRemoteSshKeyPath] = useState('');
  const [remotePort, setRemotePort] = useState('8080');
  const [remoteGatewayHost, setRemoteGatewayHost] = useState('');
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [cloudGatewayName, setCloudGatewayName] = useState('sero-cloud');
  const [cloudEndpoint, setCloudEndpoint] = useState('');
  const [cloudAuthMode, setCloudAuthMode] = useState<OpenShellCloudAuthMode>('browser');
  const [cloudResourceLabel, setCloudResourceLabel] = useState('');
  const [cloudCostLabel, setCloudCostLabel] = useState('');
  const [cloudIdleTimeoutMinutes, setCloudIdleTimeoutMinutes] = useState('60');
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState<WorkspaceInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against Radix auto-closing the popover when a native dialog steals focus
  const pickingFolderRef = useRef(false);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const addFolder = useWorkspaceStore((s) => s.addFolder);
  const saveOpenShellRemoteGateway = useWorkspaceStore((s) => s.saveOpenShellRemoteGateway);
  const saveOpenShellCloudGateway = useWorkspaceStore((s) => s.saveOpenShellCloudGateway);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const reset = () => {
    setView('pick');
    setNewName('');
    setParentPath(null);
    setRuntimeChoice('default');
    setPolicyProfileId(DEFAULT_OPENSHELL_POLICY_PROFILE_ID);
    setRemoteGatewayName('sero-remote');
    setRemoteSshHost('');
    setRemoteSshKeyPath('');
    setRemotePort('8080');
    setRemoteGatewayHost('');
    setRemoteError(null);
    setCloudGatewayName('sero-cloud');
    setCloudEndpoint('');
    setCloudAuthMode('browser');
    setCloudResourceLabel('');
    setCloudCostLabel('');
    setCloudIdleTimeoutMinutes('60');
    setCloudError(null);
  };

  const handleImportExisting = async () => {
    setOpen(false);
    pickingFolderRef.current = true;
    try {
      const folderPath = await window.sero.workspace.pickFolder();
      if (!folderPath) return;
      await addFolder(folderPath);
      await loadSessions();
    } catch (err) {
      console.error('Failed to import workspace:', err);
    } finally {
      pickingFolderRef.current = false;
    }
  };

  const handlePickLocation = async () => {
    pickingFolderRef.current = true;
    try {
      const picked = await window.sero.workspace.pickFolder();
      if (picked) setParentPath(picked);
    } finally {
      pickingFolderRef.current = false;
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || isCreating) return;
    setRemoteError(null);
    setCloudError(null);

    let remoteGateway: RemoteGatewayRuntimeSelection | undefined;
    let cloudGateway: CloudGatewayRuntimeSelection | undefined;
    if (runtimeChoice === 'openshell-remote') {
      const gatewayName = remoteGatewayName.trim();
      const sshHost = remoteSshHost.trim();
      if (!gatewayName || !sshHost) {
        setRemoteError('OpenShell Remote requires a gateway name and SSH destination like user@host.');
        return;
      }

      const port = remotePort.trim() ? Number(remotePort.trim()) : 8080;
      if (!Number.isInteger(port) || port <= 0) {
        setRemoteError('OpenShell Remote port must be a positive number.');
        return;
      }

      setIsCreating(true);
      try {
        const gateway = await saveOpenShellRemoteGateway({
          id: toRemoteGatewayId(gatewayName),
          name: gatewayName,
          sshHost,
          sshKeyPath: remoteSshKeyPath.trim() || undefined,
          port,
          gatewayHost: remoteGatewayHost.trim() || undefined,
        });
        remoteGateway = { id: gateway.id, name: gateway.name };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save OpenShell Remote gateway.';
        setRemoteError(message);
        setIsCreating(false);
        return;
      }
    } else if (runtimeChoice === 'openshell-cloud') {
      const gatewayName = cloudGatewayName.trim();
      const endpoint = cloudEndpoint.trim();
      if (!gatewayName) {
        setCloudError('OpenShell Cloud requires a gateway name.');
        return;
      }

      const endpointError = validateCloudEndpoint(endpoint);
      if (endpointError) {
        setCloudError(endpointError);
        return;
      }

      const idleTimeoutMinutes = cloudIdleTimeoutMinutes.trim()
        ? Number(cloudIdleTimeoutMinutes.trim())
        : 60;
      if (!Number.isInteger(idleTimeoutMinutes) || idleTimeoutMinutes <= 0) {
        setCloudError('OpenShell Cloud idle timeout must be a positive number of minutes.');
        return;
      }

      setIsCreating(true);
      try {
        const gateway = await saveOpenShellCloudGateway({
          id: toCloudGatewayId(gatewayName),
          name: gatewayName,
          endpoint,
          authMode: cloudAuthMode,
          resourceLabel: cloudResourceLabel.trim() || undefined,
          costLabel: cloudCostLabel.trim() || undefined,
          idleTimeoutMinutes,
        });
        cloudGateway = {
          id: gateway.id,
          name: gateway.name,
          idleTimeoutMinutes: gateway.idleTimeoutMinutes,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save OpenShell Cloud gateway.';
        setCloudError(message);
        setIsCreating(false);
        return;
      }
    } else {
      setIsCreating(true);
    }

    try {
      const ws = await createWorkspace(
        trimmed,
        parentPath ?? undefined,
        toRuntimeConfig(runtimeChoice, policyProfileId, remoteGateway, cloudGateway),
      );
      await loadSessions();
      setOpen(false);
      // Prompt user to set up remote origin for the new workspace
      setNewWorkspace(ws);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      if (runtimeChoice === 'openshell-remote') {
        const message = err instanceof Error ? err.message : 'Failed to create OpenShell Remote workspace.';
        setRemoteError(message);
      }
      if (runtimeChoice === 'openshell-cloud') {
        const message = err instanceof Error ? err.message : 'Failed to create OpenShell Cloud workspace.';
        setCloudError(message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
    <Popover open={open} onOpenChange={(o) => {
      if (!o && pickingFolderRef.current) return; // Native dialog stole focus — don't close
      setOpen(o);
      if (!o) reset();
    }}>
      <PopoverTrigger asChild>
        <IconAction
          className="rounded-md hover:bg-[var(--bg-elevated)]"
          title="Add workspace"
        >
          <Plus className="size-3.5" />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="no-drag max-h-[calc(var(--radix-popover-content-available-height)-0.5rem)] min-h-0 w-80 overflow-y-auto p-0 overscroll-contain"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {view === 'pick' ? (
          <PickView
            onCreateNew={() => {
              setView('create');
              // Focus the input after the view transition renders
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onImportExisting={handleImportExisting}
          />
        ) : (
          <CreateView
            inputRef={inputRef}
            name={newName}
            onNameChange={setNewName}
            parentPath={parentPath}
            onPickLocation={handlePickLocation}
            onClearLocation={() => setParentPath(null)}
            runtimeChoice={runtimeChoice}
            onRuntimeChoiceChange={(choice) => {
              setRuntimeChoice(choice);
              setRemoteError(null);
              setCloudError(null);
            }}
            policyProfileId={policyProfileId}
            onPolicyProfileChange={setPolicyProfileId}
            remoteGatewayName={remoteGatewayName}
            onRemoteGatewayNameChange={(value) => {
              setRemoteGatewayName(value);
              setRemoteError(null);
            }}
            remoteSshHost={remoteSshHost}
            onRemoteSshHostChange={(value) => {
              setRemoteSshHost(value);
              setRemoteError(null);
            }}
            remoteSshKeyPath={remoteSshKeyPath}
            onRemoteSshKeyPathChange={setRemoteSshKeyPath}
            remotePort={remotePort}
            onRemotePortChange={(value) => {
              setRemotePort(value);
              setRemoteError(null);
            }}
            remoteGatewayHost={remoteGatewayHost}
            onRemoteGatewayHostChange={setRemoteGatewayHost}
            remoteError={remoteError}
            cloudGatewayName={cloudGatewayName}
            onCloudGatewayNameChange={(value) => {
              setCloudGatewayName(value);
              setCloudError(null);
            }}
            cloudEndpoint={cloudEndpoint}
            onCloudEndpointChange={(value) => {
              setCloudEndpoint(value);
              setCloudError(null);
            }}
            cloudAuthMode={cloudAuthMode}
            onCloudAuthModeChange={(value) => {
              setCloudAuthMode(value);
              setCloudError(null);
            }}
            cloudResourceLabel={cloudResourceLabel}
            onCloudResourceLabelChange={setCloudResourceLabel}
            cloudCostLabel={cloudCostLabel}
            onCloudCostLabelChange={setCloudCostLabel}
            cloudIdleTimeoutMinutes={cloudIdleTimeoutMinutes}
            onCloudIdleTimeoutMinutesChange={(value) => {
              setCloudIdleTimeoutMinutes(value);
              setCloudError(null);
            }}
            cloudError={cloudError}
            onBack={reset}
            onCreate={handleCreate}
            isCreating={isCreating}
          />
        )}
      </PopoverContent>
    </Popover>

    {/* Prompt to set up remote origin after workspace creation */}
    {newWorkspace && (
      <RemoteOriginManager
        open={!!newWorkspace}
        onOpenChange={(o) => { if (!o) setNewWorkspace(null); }}
        workspace={newWorkspace}
      />
    )}
    </>
  );
}
