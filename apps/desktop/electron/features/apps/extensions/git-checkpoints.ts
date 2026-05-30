import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createGitCheckpointSessionEntries } from './git-checkpoint-session-entries';
import { registerManualGitCheckpointCommands } from './git-checkpoint-commands';
import { registerGitTurnUndoCapture } from './git-turn-undo-capture';

export function registerGitCheckpointFeatures(
  pi: ExtensionAPI,
  workspaceId: string,
): void {
  const entries = createGitCheckpointSessionEntries(pi, workspaceId);
  registerGitTurnUndoCapture(pi, workspaceId, entries);
  registerManualGitCheckpointCommands(pi, workspaceId, entries);
}
