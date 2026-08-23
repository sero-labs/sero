/**
 * Default values for new loops and Orchestrator state.
 */

import type {
  LibraryIndex,
  LoopLimits,
  LoopWorkspaceSettings,
  LogPolicy,
  OrchestratorIndex,
  OrchestratorState,
  RunIndex,
} from './types';
import { ROOM_SCHEMA_VERSION, type RoomIndex } from './room-types';

export const DEFAULT_STATE: OrchestratorState = {
  version: 1,
  loops: [],
  ui: {},
};

export const DEFAULT_INDEX: OrchestratorIndex = {
  version: 1,
  loops: [],
};

export const DEFAULT_RUN_INDEX: RunIndex = {
  version: 1,
  runs: [],
};

/** Empty Room index, for a workspace where Room mode has never run. */
export const DEFAULT_ROOM_INDEX: RoomIndex = {
  schemaVersion: ROOM_SCHEMA_VERSION,
  rooms: [],
};

/** Empty Loop Library index (profile-global; see specs/08-loop-library.md). */
export const DEFAULT_LIBRARY_INDEX: LibraryIndex = {
  version: 1,
  entries: [],
};

export const DEFAULT_WORKSPACE_SETTINGS: LoopWorkspaceSettings = {
  useManagedWorktree: true,
  reuseExistingWorktree: true,
  dirtyWorkspacePromptTimeoutMs: 60_000,
  dirtyWorkspaceDefaultAction: 'create-managed-worktree',
  allowDirtyWorkspaceRoot: false,
};

/**
 * Default management limits. Conservative caps so a misbehaving plan cannot
 * run unbounded. The LLM's `suggestedLimits` and user-supplied limits override
 * these.
 */
export const DEFAULT_LIMITS: Required<Pick<
  LoopLimits,
  'maxAttemptsPerStep' | 'maxAttemptsTotal' | 'maxConcurrentSteps'
>> & LoopLimits = {
  maxAttemptsPerStep: 3,
  maxAttemptsTotal: 50,
  maxConcurrentSteps: 3,
  maxWallClockMs: 30 * 60_000,
};

/** Durable run digests retained for reflection — many more than full runs, since each is tiny. */
export const DEFAULT_RETAIN_DIGESTS = 50;

export const DEFAULT_LOG_POLICY: LogPolicy = {
  retainRuns: 20,
  retainArtifacts: true,
  maxInlineOutputBytes: 8_000,
  retainDigests: DEFAULT_RETAIN_DIGESTS,
};
