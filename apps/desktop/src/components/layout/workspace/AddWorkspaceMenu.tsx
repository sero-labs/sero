import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { deriveRepoNameFromGitUrl } from '@sero-ai/common';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useGitHubAuthStore } from '@/stores/github-auth';
import { getContributions, useAppStore } from '@/stores/app';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import type { WorkspaceInfo } from '@/types/ipc';
import { IconAction } from '@/components/ui/IconAction';
import { CloneView, CreateView, ImportView, PickView } from './AddWorkspaceViews';
import { RemoteOriginManager } from './RemoteOriginManager';
import { WorkspaceSetupFailureNotice } from './WorkspaceSetupFailureNotice';
import { useWorkspaceSetup } from './workspace-setup';

// ── Add Workspace menu ─────────────────────────────────────────

type AddView = 'pick' | 'create' | 'clone' | 'import';

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
  const [createError, setCreateError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
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
  const workspaceCreationContributions = useMemo(
    () => getContributions(apps, 'workspace.create.option'),
    [apps],
  );
  const workspaceCreationOptions = workspaceCreationContributions.map((resolved) => ({
    id: resolved.key,
    label: resolved.contribution.control.label,
    enabled: workspaceCreationSelections[resolved.key]
      ?? resolved.contribution.control.defaultValue,
  }));
  const {
    activeFailure: activeWorkspaceSetupFailure,
    completePendingSetup: completePendingWorkspaceSetup,
    createSetup: createWorkspaceSetup,
    deferSetup: deferWorkspaceSetup,
    dismissActiveFailure: dismissActiveWorkspaceSetupFailure,
  } = useWorkspaceSetup(workspaceCreationContributions, workspaceCreationSelections);

  const reset = () => {
    setView('pick');
    setNewName('');
    setCreateError(null);
    setParentPath(null);
    setCloneUrl('');
    setCloneName('');
    cloneNameEditedRef.current = false;
    setCloneError(null);
    setCloneAuthHint(false);
    setImportError(null);
    setWorkspaceCreationSelections({});
  };

  const handleImportExisting = async () => {
    if (isImporting) return;
    setIsImporting(true);
    setImportError(null);
    pickingFolderRef.current = true;
    try {
      const folderPath = await window.sero.workspace.pickFolder();
      if (!folderPath) return;
      const ws = await addFolder(folderPath);
      await completeWorkspaceAddition(ws);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import workspace';
      console.error('Failed to import workspace:', err);
      setImportError(message);
      setView('import');
    } finally {
      pickingFolderRef.current = false;
      setIsImporting(false);
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

  const completeWorkspaceAddition = async (
    ws: WorkspaceInfo,
    promptForRemote = false,
  ): Promise<void> => {
    const setup = createWorkspaceSetup(ws);
    await loadSessions();
    setOpen(false);
    reset();
    if (promptForRemote) {
      deferWorkspaceSetup(setup);
      setNewWorkspace(ws);
    } else {
      setup();
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const ws = await createWorkspace(trimmed, parentPath ?? undefined);
      await completeWorkspaceAddition(ws, true);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create workspace');
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
      const ws = await cloneWorkspace(
        trimmedUrl,
        cloneName.trim() || undefined,
        parentPath ?? undefined,
      );
      await completeWorkspaceAddition(ws);
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

  const handleOptionChange = (id: string, enabled: boolean): void => {
    setWorkspaceCreationSelections((current) => ({ ...current, [id]: enabled }));
  };

  const workspaceSetupFailureNotice = activeWorkspaceSetupFailure
    ? (
        <WorkspaceSetupFailureNotice
          failure={activeWorkspaceSetupFailure}
          embedded={newWorkspace !== null}
          onDismiss={dismissActiveWorkspaceSetupFailure}
        />
      )
    : null;

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
        className="w-72 p-0"
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
            onImportExisting={() => {
              if (workspaceCreationOptions.length === 0) {
                void handleImportExisting();
                return;
              }
              setView('import');
            }}
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
            error={createError}
            options={workspaceCreationOptions}
            onOptionChange={handleOptionChange}
          />
        )}
        {view === 'import' && (
          <ImportView
            onBack={reset}
            onImport={handleImportExisting}
            isImporting={isImporting}
            error={importError}
            options={workspaceCreationOptions}
            onOptionChange={handleOptionChange}
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
            options={workspaceCreationOptions}
            onOptionChange={handleOptionChange}
          />
        )}
      </PopoverContent>
    </Popover>

    {/* Prompt to set up remote origin after workspace creation */}
    {newWorkspace && (
      <RemoteOriginManager
        open
        onOpenChange={(o) => {
          if (o) return;
          setNewWorkspace(null);
          completePendingWorkspaceSetup();
        }}
        onWorkspaceReady={completePendingWorkspaceSetup}
        workspace={newWorkspace}
      >
        {workspaceSetupFailureNotice}
      </RemoteOriginManager>
    )}

    {!newWorkspace && workspaceSetupFailureNotice}
    </>
  );
}
