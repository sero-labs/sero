/**
 * RemoteOriginManager — manage the git remote origin for a workspace.
 *
 * Three modes:
 * 1. **No origin** → choose "Create new on GitHub" or "Connect existing repo"
 * 2. **Create new** → GitHub repo creation form (name, description, visibility)
 * 3. **Connect existing** → paste a remote URL
 *
 * When origin already exists, shows the current remote with options to change it.
 * Opened from WorkspaceTree hover actions and after workspace creation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@sero-ai/ui/components/ui/dialog';
import type { WorkspaceInfo } from '@/types/ipc';
import { ErrorSurface } from '../ErrorSurface';
import {
  LoadingView,
  ChooseView,
  CreateGitHubView,
  ConnectExistingView,
  ConnectedView,
} from './remote-origin-views';
import { fetchOriginInfo, toOriginInfo, type GitRemoteOriginInfo } from '../git-remote/workflow';

// ── Types ────────────────────────────────────────────────────

interface RemoteOriginManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: WorkspaceInfo;
}

type View = 'loading' | 'load-error' | 'choose' | 'create-github' | 'connect-existing' | 'connected';

// ── Main component ───────────────────────────────────────────

export function RemoteOriginManager({
  open,
  onOpenChange,
  workspace,
}: RemoteOriginManagerProps) {
  const [view, setView] = useState<View>('loading');
  const [origin, setOrigin] = useState<GitRemoteOriginInfo | null>(null);
  const [originLoadError, setOriginLoadError] = useState<string | null>(null);
  const prevOpenRef = useRef(false);

  const loadOrigin = useCallback(async () => {
    setView('loading');
    setOrigin(null);
    setOriginLoadError(null);

    const result = await fetchOriginInfo(workspace.id);
    if (!result.ok) {
      setView('load-error');
      setOriginLoadError(result.message);
      return;
    }

    setOrigin(result.origin);
    setView(result.origin ? 'connected' : 'choose');
  }, [workspace.id]);

  // Fetch origin when dialog opens (acceptable useEffect: IPC on external state change)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      void loadOrigin();
    }
    prevOpenRef.current = open;
  }, [loadOrigin, open]);

  const handleOriginSet = (url: string) => {
    setOrigin(toOriginInfo(url));
    setView('connected');
  };

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remote Origin</DialogTitle>
          <DialogDescription>
            {view === 'connected'
              ? `Remote origin for "${workspace.name}".`
              : `Set up the remote origin for "${workspace.name}".`}
          </DialogDescription>
        </DialogHeader>

        {view === 'loading' && <LoadingView />}
        {view === 'load-error' && originLoadError && (
          <ErrorSurface
            title="Couldn't load remote origin"
            message={originLoadError}
            onRetry={() => {
              void loadOrigin();
            }}
          />
        )}
        {view === 'choose' && (
          <ChooseView
            onCreateNew={() => setView('create-github')}
            onConnectExisting={() => setView('connect-existing')}
          />
        )}
        {view === 'create-github' && (
          <CreateGitHubView
            workspace={workspace}
            onBack={() => setView('choose')}
            onCreated={handleOriginSet}
          />
        )}
        {view === 'connect-existing' && (
          <ConnectExistingView
            workspace={workspace}
            onBack={() => setView('choose')}
            onConnected={handleOriginSet}
          />
        )}
        {view === 'connected' && origin && (
          <ConnectedView
            origin={origin}
            onChangeOrigin={() => setView('choose')}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
