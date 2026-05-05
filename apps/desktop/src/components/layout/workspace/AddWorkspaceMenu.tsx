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

export function toRuntimeConfig(
  choice: RuntimeChoice,
  policyProfileId: OpenShellPolicyProfileId = DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
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
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState<WorkspaceInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against Radix auto-closing the popover when a native dialog steals focus
  const pickingFolderRef = useRef(false);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const addFolder = useWorkspaceStore((s) => s.addFolder);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const reset = () => {
    setView('pick');
    setNewName('');
    setParentPath(null);
    setRuntimeChoice('default');
    setPolicyProfileId(DEFAULT_OPENSHELL_POLICY_PROFILE_ID);
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
    setIsCreating(true);
    try {
      const ws = await createWorkspace(
        trimmed,
        parentPath ?? undefined,
        toRuntimeConfig(runtimeChoice, policyProfileId),
      );
      await loadSessions();
      setOpen(false);
      // Prompt user to set up remote origin for the new workspace
      setNewWorkspace(ws);
    } catch (err) {
      console.error('Failed to create workspace:', err);
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
        className="no-drag w-64 p-0"
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
            onRuntimeChoiceChange={setRuntimeChoice}
            policyProfileId={policyProfileId}
            onPolicyProfileChange={setPolicyProfileId}
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
