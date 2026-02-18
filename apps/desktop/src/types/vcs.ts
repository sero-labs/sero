export type VcsCheckpointSource = 'turn' | 'fs' | 'manual' | 'restore';

export interface VcsCheckpoint {
  changeId: string;
  description: string;
  source: VcsCheckpointSource;
  createdAt: string;
}

export interface VcsWorkspaceState {
  workspaceId: string;
  currentChangeId: string | null;
  hasWorkingCopyChanges: boolean;
  checkpoints: VcsCheckpoint[];
}

export type VcsEvent =
  | {
      type: 'checkpoint_created';
      workspaceId: string;
      checkpoint: VcsCheckpoint;
    }
  | {
      type: 'restored';
      workspaceId: string;
      checkpointId: string;
    }
  | {
      type: 'error';
      workspaceId: string;
      error: string;
    };
