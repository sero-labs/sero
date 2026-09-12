import path from 'path';

import { SERO_HOST_RTK_STATE_ROOT } from '@electron/platform/env';

/**
 * Runtime root for session-scoped RTK tracking and recovery state.
 *
 * `/tmp/sero-home` is the container `HOME`, is writable, and is container-local,
 * so container RTK state stays tied to the container lifetime. It is not a host
 * mount, so it never writes into the profile from inside a container.
 */
export const RUNTIME_RTK_STATE_ROOT = '/tmp/sero-home/rtk';

/** Directory name for one session's state. Injectable so it cannot escape the root. */
export function rtkSessionKey(sessionId: string): string {
  if (!sessionId) throw new Error('RTK session state requires a session id');
  const key = encodeURIComponent(sessionId);
  if (key === '.' || key === '..' || key.includes('/') || key.includes('\\')) {
    throw new Error(`Invalid RTK session id: ${sessionId}`);
  }
  return key;
}

export function hostRtkStateDir(sessionId: string): string {
  return path.join(SERO_HOST_RTK_STATE_ROOT, rtkSessionKey(sessionId));
}

export function runtimeRtkStateDir(sessionId: string): string {
  return path.posix.join(RUNTIME_RTK_STATE_ROOT, rtkSessionKey(sessionId));
}

/**
 * RTK tracking and recovery locations for one state directory.
 *
 * `RTK_DB_PATH` names the database file, not the directory. An existing user
 * configuration may select a recovery mode, but these three locations keep its
 * writes inside the session's state directory.
 */
export function rtkStateEnv(stateDir: string): Record<string, string> {
  const normalized = stateDir.replace(/\\/g, '/');
  return {
    RTK_DB_PATH: `${normalized}/history.db`,
    RTK_RECALL_DB: `${normalized}/recall.db`,
    RTK_TEE_DIR: `${normalized}/tee`,
  };
}
