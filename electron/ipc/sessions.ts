/**
 * Session IPC handlers.
 *
 * Uses Pi SDK SessionManager directly against ~/.sero-ui/agent/sessions/.
 * No abstraction layer — the SDK is the abstraction.
 *
 * All Sero sessions use os.homedir() as their cwd so they land in a single
 * subdirectory. SessionManager.list(cwd, sessionDir) scans that subdirectory.
 */

import { ipcMain } from 'electron';
import { SessionManager } from '@mariozechner/pi-coding-agent';
import { promises as fs, appendFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { IpcChannels } from '../../src/types/ipc';
import type { SeroSessionInfo } from '../../src/types/ipc';

/** Root directory for all Sero sessions. */
const SERO_SESSION_DIR = path.join(os.homedir(), '.sero-ui', 'agent', 'sessions');

/**
 * The cwd we stamp on every Sero session.
 * Since we don't scope by project, all sessions share a single cwd bucket.
 */
const SERO_CWD = os.homedir();

/** Ensure the session directory exists. */
async function ensureSessionDir(): Promise<void> {
  await fs.mkdir(SERO_SESSION_DIR, { recursive: true });
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
    name: info.name,
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    messageCount: info.messageCount,
    firstMessage: info.firstMessage,
  };
}

export function registerSessionHandlers(): void {
  // ── List all sessions ──────────────────────────────────────
  ipcMain.handle(IpcChannels.sessions.list, async (): Promise<SeroSessionInfo[]> => {
    await ensureSessionDir();
    try {
      const sessions = await SessionManager.list(SERO_CWD, SERO_SESSION_DIR);
      return sessions.map(toSeroSessionInfo);
    } catch (err) {
      console.error('[sessions:list]', err);
      return [];
    }
  });

  // ── Create a new session ───────────────────────────────────
  ipcMain.handle(
    IpcChannels.sessions.create,
    async (): Promise<SeroSessionInfo> => {
      await ensureSessionDir();
      const sm = SessionManager.create(SERO_CWD, SERO_SESSION_DIR);
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
        cwd: SERO_CWD,
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
