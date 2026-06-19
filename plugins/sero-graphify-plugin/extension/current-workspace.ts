import path from 'node:path';
import type { GraphifyState, WorkspaceIndexEntry } from '../shared/types';

/** Best-effort mapping of the session cwd to a profile workspace. Null when ambiguous. */
export function resolveCurrentWorkspace(
  state: GraphifyState,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): WorkspaceIndexEntry | null {
  if (env.SERO_WORKSPACE_ID && state.workspaces[env.SERO_WORKSPACE_ID]) {
    return state.workspaces[env.SERO_WORKSPACE_ID];
  }
  const entries = Object.values(state.workspaces);
  const byPath = entries.find((e) => cwd === e.path || cwd.startsWith(e.path + path.sep));
  if (byPath) return byPath;
  const base = path.basename(cwd);
  const byBase = entries.filter((e) => path.basename(e.path) === base);
  return byBase.length === 1 ? byBase[0] : null;
}
