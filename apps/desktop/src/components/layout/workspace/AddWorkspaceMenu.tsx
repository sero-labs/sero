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
import type { WorkspaceInfo, WorkspaceRuntimeConfig } from '@/types/ipc';
import { IconAction } from '@/components/ui/IconAction';
import { PickView, CreateView, type RuntimeChoice } from './AddWorkspaceViews';
import { RemoteOriginManager } from './RemoteOriginManager';

// ── Add Workspace menu ─────────────────────────────────────────

type AddView = 'pick' | 'create';

interface RemoteGatewayRuntimeSelection {
  id: string;
  name: string;
}

function toRemoteGatewayId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `openshell-remote-${slug || 'gateway'}`;
}

export function toRuntimeConfig(
  choice: RuntimeChoice,
  policyProfileId: OpenShellPolicyProfileId = DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  remoteGateway?: RemoteGatewayRuntimeSelection,
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
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState<WorkspaceInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against Radix auto-closing the popover when a native dialog steals focus
  const pickingFolderRef = useRef(false);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const addFolder = useWorkspaceStore((s) => s.addFolder);
  const saveOpenShellRemoteGateway = useWorkspaceStore((s) => s.saveOpenShellRemoteGateway);
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

    let remoteGateway: RemoteGatewayRuntimeSelection | undefined;
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
    } else {
      setIsCreating(true);
    }

    try {
      const ws = await createWorkspace(
        trimmed,
        parentPath ?? undefined,
        toRuntimeConfig(runtimeChoice, policyProfileId, remoteGateway),
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
        className="no-drag max-h-[calc(100vh-5rem)] w-80 overflow-y-auto p-0 overscroll-contain"
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
