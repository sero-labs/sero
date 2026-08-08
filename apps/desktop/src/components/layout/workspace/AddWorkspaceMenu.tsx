import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { deriveRepoNameFromGitUrl } from '@sero-ai/common';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useGitHubAuthStore } from '@/stores/github-auth';
import { getWorkspaceCreationContributionApps, useAppStore } from '@/stores/app';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import type { WorkspaceInfo } from '@/types/ipc';
import { IconAction } from '@/components/ui/IconAction';
import { PickView, CreateView, CloneView } from './AddWorkspaceViews';
import { RemoteOriginManager } from './RemoteOriginManager';

// ── Add Workspace menu ─────────────────────────────────────────

type AddView = 'pick' | 'create' | 'clone';

/** Errors that mean "you need GitHub credentials", as opposed to a bad URL. */
function looksLikeAuthError(message: string): boolean {
  return /authentication|authenticate|permission denied|access denied|403|terminal prompts disabled|could not read username|repository not found/i.test(
    message,
  );
}

function isGitHubUrl(url: string): boolean {
  return url.includes('github.com');
}

export function AddWorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AddView>('pick');
  const [newName, setNewName] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState<WorkspaceInfo | null>(null);
  const [workspaceCreationSelections, setWorkspaceCreationSelections] = useState<Record<string, boolean>>({});

  // Clone view state
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneAuthHint, setCloneAuthHint] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const cloneInputRef = useRef<HTMLInputElement>(null);
  const cloneNameEditedRef = useRef(false);
  // Guards against Radix auto-closing the popover when a native dialog steals focus
  const pickingFolderRef = useRef(false);
  const authInFlightRef = useRef(false);

  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const cloneWorkspace = useWorkspaceStore((s) => s.cloneWorkspace);
  const addFolder = useWorkspaceStore((s) => s.addFolder);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const openGitHubAuthDialog = useGitHubAuthStore((s) => s.openGitHubAuthDialog);
  const apps = useAppStore((s) => s.apps);
  const workspaceCreationContributions = getWorkspaceCreationContributionApps(apps);
  const workspaceCreationOptions = workspaceCreationContributions.map((app) => ({
    id: app.id,
    label: app.manifest!.workspaceCreation!.label,
    enabled: workspaceCreationSelections[app.id]
      ?? app.manifest!.workspaceCreation!.defaultEnabled
      ?? false,
  }));

  const reset = () => {
    setView('pick');
    setNewName('');
    setParentPath(null);
    setCloneUrl('');
    setCloneName('');
    cloneNameEditedRef.current = false;
    setCloneError(null);
    setCloneAuthHint(false);
    setWorkspaceCreationSelections({});
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
      const ws = await createWorkspace(trimmed, parentPath ?? undefined);
      const enabledContributions = workspaceCreationContributions.filter((app) => (
        workspaceCreationSelections[app.id]
          ?? app.manifest!.workspaceCreation!.defaultEnabled
          ?? false
      ));
      const results = await Promise.allSettled(enabledContributions.map((app) => {
        const contribution = app.manifest!.workspaceCreation!;
        return window.sero.appAgent.invokeTool(app.id, ws.id, contribution.tool, {
          ...contribution.params,
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspacePath: ws.path,
        });
      }));
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            `[workspace] ${enabledContributions[index].label} setup failed:`,
            result.reason,
          );
        }
      });
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

  const handleUrlChange = (value: string) => {
    setCloneUrl(value);
    // Keep the name in sync with the URL until the user edits it themselves.
    if (!cloneNameEditedRef.current) setCloneName(deriveRepoNameFromGitUrl(value) ?? '');
  };

  const handleClone = async () => {
    const trimmedUrl = cloneUrl.trim();
    if (!trimmedUrl || isCloning) return;
    setIsCloning(true);
    setCloneError(null);
    setCloneAuthHint(false);
    try {
      await cloneWorkspace(trimmedUrl, cloneName.trim() || undefined, parentPath ?? undefined);
      await loadSessions();
      setOpen(false);
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clone repository';
      setCloneError(message);
      setCloneAuthHint(looksLikeAuthError(message) && isGitHubUrl(trimmedUrl));
    } finally {
      setIsCloning(false);
    }
  };

  const handleSignInAndRetry = async () => {
    authInFlightRef.current = true;
    try {
      const result = await openGitHubAuthDialog({ source: 'remote-origin' });
      if (result.outcome === 'success') await handleClone();
    } finally {
      authInFlightRef.current = false;
    }
  };

  return (
    <>
    <Popover open={open} onOpenChange={(o) => {
      // Native folder dialog or GitHub auth dialog stole focus, don't close
      if (!o && (pickingFolderRef.current || authInFlightRef.current)) return;
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
        className="w-64 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {view === 'pick' && (
          <PickView
            onCreateNew={() => {
              setView('create');
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onCloneRepo={() => {
              setView('clone');
              requestAnimationFrame(() => cloneInputRef.current?.focus());
            }}
            onImportExisting={handleImportExisting}
          />
        )}
        {view === 'create' && (
          <CreateView
            inputRef={inputRef}
            name={newName}
            onNameChange={setNewName}
            parentPath={parentPath}
            onPickLocation={handlePickLocation}
            onClearLocation={() => setParentPath(null)}
            onBack={reset}
            onCreate={handleCreate}
            isCreating={isCreating}
            options={workspaceCreationOptions}
            onOptionChange={(id, enabled) => setWorkspaceCreationSelections((current) => ({
              ...current,
              [id]: enabled,
            }))}
          />
        )}
        {view === 'clone' && (
          <CloneView
            inputRef={cloneInputRef}
            url={cloneUrl}
            onUrlChange={handleUrlChange}
            name={cloneName}
            onNameChange={(v) => { cloneNameEditedRef.current = true; setCloneName(v); }}
            parentPath={parentPath}
            onPickLocation={handlePickLocation}
            onClearLocation={() => setParentPath(null)}
            onBack={() => { setView('pick'); reset(); }}
            onClone={handleClone}
            isCloning={isCloning}
            error={cloneError}
            onSignIn={cloneAuthHint ? handleSignInAndRetry : undefined}
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
