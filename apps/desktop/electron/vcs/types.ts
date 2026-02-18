// Re-export shared VCS types from the canonical renderer location.
// Electron-only types (JjResult, CreateCheckpointOptions) are defined below.
export type {
  VcsCheckpointSource,
  VcsCheckpoint,
  VcsWorkspaceState,
  VcsEvent,
} from '../../src/types/vcs';

export interface JjResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CreateCheckpointOptions {
  source: import('../../src/types/vcs').VcsCheckpointSource;
  description?: string;
}
