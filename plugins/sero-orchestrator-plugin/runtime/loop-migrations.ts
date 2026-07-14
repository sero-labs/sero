import type { Loop } from '../shared/types';
import { migrateLegacyRunDisposition } from './run-disposition';

const OLD_DIRTY_PROMPT_DEFAULT_MS = 30_000;
const DIRTY_PROMPT_DEFAULT_MS = 60_000;

/** Applies backward-compatible persisted-state upgrades when a loop is loaded. */
export function migrateLoopState(loop: Loop): Loop {
  const disposition = migrateLegacyRunDisposition(loop);
  if (disposition.workspace.dirtyWorkspacePromptTimeoutMs !== OLD_DIRTY_PROMPT_DEFAULT_MS) {
    return disposition;
  }
  return {
    ...disposition,
    workspace: {
      ...disposition.workspace,
      dirtyWorkspacePromptTimeoutMs: DIRTY_PROMPT_DEFAULT_MS,
    },
  };
}
