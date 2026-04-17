import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export const WORKSPACE_LINK_ENTRY = 'git-workspace-link';
export const CHECKPOINT_ENTRY = 'git-checkpoint';
export const TURN_UNDO_ENTRY = 'turn-undo';

interface CheckpointEntryLike {
  changeId: string;
  description: string;
  source: string;
}

interface TurnUndoEntryLike {
  snapshotId: string;
  targetUserEntryId: string;
  label: string;
}

export interface GitCheckpointSessionEntries {
  appendWorkspaceLink: (changeId: string | null) => void;
  appendCheckpointEntry: (checkpoint: CheckpointEntryLike) => void;
  appendTurnUndoEntry: (turnUndo: TurnUndoEntryLike) => void;
}

export function createGitCheckpointSessionEntries(
  pi: ExtensionAPI,
  workspaceId: string,
): GitCheckpointSessionEntries {
  return {
    appendWorkspaceLink(changeId) {
      pi.appendEntry(WORKSPACE_LINK_ENTRY, {
        workspaceId,
        changeId,
        recordedAt: new Date().toISOString(),
      });
    },

    appendCheckpointEntry(checkpoint) {
      pi.appendEntry(CHECKPOINT_ENTRY, {
        workspaceId,
        changeId: checkpoint.changeId,
        description: checkpoint.description,
        source: checkpoint.source,
        recordedAt: new Date().toISOString(),
      });
    },

    appendTurnUndoEntry(turnUndo) {
      pi.appendEntry(TURN_UNDO_ENTRY, {
        workspaceId,
        snapshotId: turnUndo.snapshotId,
        targetUserEntryId: turnUndo.targetUserEntryId,
        label: turnUndo.label,
        recordedAt: new Date().toISOString(),
      });
    },
  };
}
