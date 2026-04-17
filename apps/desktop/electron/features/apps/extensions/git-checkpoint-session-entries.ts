import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export const WORKSPACE_LINK_ENTRY = 'git-workspace-link';
export const CHECKPOINT_ENTRY = 'git-checkpoint';

interface CheckpointEntryLike {
  changeId: string;
  description: string;
  source: string;
}

export interface GitCheckpointSessionEntries {
  appendWorkspaceLink: (changeId: string | null) => void;
  appendCheckpointEntry: (checkpoint: CheckpointEntryLike) => void;
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
  };
}
