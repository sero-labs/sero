import { useState, useCallback } from 'react';

import { useVcsStore } from '@/stores/vcs';
import { summarizeDiffFiles, type RestorePreviewFileChange } from '@/components/layout/CheckpointRestoreDialog';
import type { ChatCheckpointRef } from '@/types/checkpoints';

interface CheckpointRestoreState {
  dialogOpen: boolean;
  target: ChatCheckpointRef | null;
  previewFiles: RestorePreviewFileChange[];
  previewLoading: boolean;
  previewError: string | null;
  restoring: boolean;
}

interface CheckpointRestoreActions {
  requestRestore: (checkpoint: ChatCheckpointRef) => void;
  confirmRestore: () => void;
  setDialogOpen: (open: boolean) => void;
}

export function useCheckpointRestore(
  workspaceId: string | null,
): CheckpointRestoreState & CheckpointRestoreActions {
  const restoreCheckpoint = useVcsStore((s) => s.restoreCheckpoint);
  const fetchCheckpointDiff = useVcsStore((s) => s.fetchDiff);

  const [dialogOpen, setDialogOpenRaw] = useState(false);
  const [target, setTarget] = useState<ChatCheckpointRef | null>(null);
  const [previewFiles, setPreviewFiles] = useState<RestorePreviewFileChange[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const resetState = useCallback(() => {
    setTarget(null);
    setPreviewFiles([]);
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

  const setDialogOpen = useCallback(
    (open: boolean) => {
      setDialogOpenRaw(open);
      if (!open && !restoring) resetState();
    },
    [restoring, resetState],
  );

  const requestRestore = useCallback(
    (checkpoint: ChatCheckpointRef) => {
      if (!workspaceId) return;

      setTarget(checkpoint);
      setPreviewFiles([]);
      setPreviewError(null);
      setPreviewLoading(true);
      setDialogOpenRaw(true);

      void fetchCheckpointDiff(workspaceId, checkpoint.changeId)
        .then((diff) => {
          setPreviewFiles(summarizeDiffFiles(diff));
          setPreviewLoading(false);
        })
        .catch((err) => {
          setPreviewError(err instanceof Error ? err.message : 'Failed to load diff preview');
          setPreviewLoading(false);
        });
    },
    [workspaceId, fetchCheckpointDiff],
  );

  const confirmRestore = useCallback(() => {
    if (!workspaceId || !target || restoring) return;

    setRestoring(true);
    void restoreCheckpoint(workspaceId, target.changeId)
      .then(() => {
        setDialogOpenRaw(false);
        resetState();
      })
      .catch((err) => {
        setPreviewError(err instanceof Error ? err.message : 'Restore failed');
      })
      .finally(() => {
        setRestoring(false);
        setPreviewLoading(false);
      });
  }, [workspaceId, target, restoring, restoreCheckpoint, resetState]);

  return {
    dialogOpen,
    target,
    previewFiles,
    previewLoading,
    previewError,
    restoring,
    requestRestore,
    confirmRestore,
    setDialogOpen,
  };
}
