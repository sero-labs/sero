/**
 * Session IPC handlers.
 *
 * Uses Pi SDK SessionManager against ~/.sero-ui/agent/sessions/.
 * Sessions are bound to workspaces at creation time via the cwd parameter.
 *
 * SessionManager.create(cwd, sessionDir) stamps the workspace path as cwd
 * in the session header. We derive workspaceId by mapping cwd → workspace.
 */

import { ipcMain } from 'electron';
import { SessionManager } from '@mariozechner/pi-coding-agent';
import { promises as fs, appendFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { IpcChannels } from '../../src/types/ipc';
import type { SeroSessionInfo } from '../../src/types/ipc';
import { workspaceManager } from '../workspace';
import { SERO_SESSION_DIR } from './shared-infra';

/**
 * Legacy cwd used before workspaces existed.
 * Sessions with this cwd are attributed to global.
 */
const LEGACY_CWD = os.homedir();

/** Ensure the session directory exists. */
async function ensureSessionDir(): Promise<void> {
  await fs.mkdir(SERO_SESSION_DIR, { recursive: true });
}

/**
 * Map a session's cwd to a workspace ID.
 *
 * Looks up the cwd in the workspace registry. Falls back to 'global'
 * for legacy sessions or sessions whose workspace has been removed.
 */
function resolveWorkspaceId(cwd: string): string {
  // Try exact match against registered workspace paths
  const entry = workspaceManager.findByPath(cwd);
  if (entry) return entry.id;

  // Legacy sessions used os.homedir() as cwd
  if (cwd === LEGACY_CWD) return 'global';

  // Unknown cwd — attribute to global
  return 'global';
}

/** Convert Pi SDK SessionInfo to our serialisable IPC shape. */
function toSeroSessionInfo(info: {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}): SeroSessionInfo {
  return {
    path: info.path,
    id: info.id,
    cwd: info.cwd,
    workspaceId: resolveWorkspaceId(info.cwd),
    name: info.name,
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    messageCount: info.messageCount,
    firstMessage: info.firstMessage,
  };
}

export function registerSessionHandlers(): void {
  // ── List all sessions ──────────────────────────────────────
  //    Optional workspaceId filter.
  //
  //    SessionManager.list(cwd, sessionDir) with an explicit sessionDir
  //    lists all .jsonl files in that directory regardless of cwd.
  //    We use LEGACY_CWD as a dummy — the sessionDir override is what matters.
  ipcMain.handle(
    IpcChannels.sessions.list,
    async (_event, workspaceId?: string): Promise<SeroSessionInfo[]> => {
      await ensureSessionDir();
      try {
        const allSessions = await SessionManager.list(LEGACY_CWD, SERO_SESSION_DIR);
        const mapped = allSessions.map(toSeroSessionInfo);

        // Filter by workspace if requested
        if (workspaceId) {
          return mapped.filter((s) => s.workspaceId === workspaceId);
        }
        return mapped;
      } catch (err) {
        console.error('[sessions:list]', err);
        return [];
      }
    },
  );

  // ── Create a new session ───────────────────────────────────
  //    Requires workspaceId. Defaults to global.
  ipcMain.handle(
    IpcChannels.sessions.create,
    async (_event, workspaceId?: string): Promise<SeroSessionInfo> => {
      await ensureSessionDir();

      // Resolve workspace path — default to global
      const wsId = workspaceId || 'global';
      const wsPath = workspaceManager.getPath(wsId);
      if (!wsPath) {
        throw new Error(`Workspace not found: ${wsId}`);
      }

      const sm = SessionManager.create(wsPath, SERO_SESSION_DIR);
      const sessionFile = sm.getSessionFile()!;
      const now = new Date();

      // Pi SDK defers writing until an assistant message exists.
      // We need the file on disk immediately so it shows up in list().
      // Write the session header ourselves — matches the SDK's JSONL format.
      const header = JSON.stringify(sm.getHeader());
      appendFileSync(sessionFile, header + '\n');

      return {
        path: sessionFile,
        id: sm.getSessionId(),
        cwd: wsPath,
        workspaceId: wsId,
        created: now.toISOString(),
        modified: now.toISOString(),
        messageCount: 0,
        firstMessage: '',
      };
    },
  );

  // ── Delete a session ───────────────────────────────────────
  ipcMain.handle(
    IpcChannels.sessions.delete,
    async (_event, sessionPath: string): Promise<void> => {
      // Safety: only allow deleting files inside our session dir
      const resolved = path.resolve(sessionPath);
      if (!resolved.startsWith(SERO_SESSION_DIR)) {
        throw new Error('Refusing to delete file outside session directory');
      }
      try {
        await fs.unlink(resolved);
      } catch (err: unknown) {
        // Ignore if already gone
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
  );
}
