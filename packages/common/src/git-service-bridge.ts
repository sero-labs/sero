/**
 * Host bridge for the git service.
 *
 * In Sero, Pi extensions run inside the Electron main process. The host owns
 * the git service (execution, state.json, refresh invalidation) and registers
 * an implementation here at startup; the sero-git-plugin extension resolves
 * it via globalThis so the plugin bundle needs no host imports (same pattern
 * as the user-feedback bus).
 */

import type { GitActionResult, GitManagerRequest } from './git-app';

export interface GitServiceBridge {
  /** Run a git_manager action for the repo at `cwd` and update its state file. */
  runAction(params: GitManagerRequest, cwd: string): Promise<GitActionResult>;
  /** Refresh the state file for the repo at `cwd` (session start sync). */
  syncState(cwd: string): Promise<void>;
}

const BRIDGE_KEY = '__seroGitServiceBridge';

export function setGitServiceBridge(bridge: GitServiceBridge): void {
  (globalThis as Record<string, unknown>)[BRIDGE_KEY] = bridge;
}

export function getGitServiceBridge(): GitServiceBridge | null {
  const bridge = (globalThis as Record<string, unknown>)[BRIDGE_KEY];
  return (bridge as GitServiceBridge | undefined) ?? null;
}
