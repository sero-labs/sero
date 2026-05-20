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
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { IpcChannels } from '@/types/ipc-channels';
import type { SeroSessionInfo } from '@/types/ipc';
import { workspaceManager } from '@electron/features/workspace/manager';
import { SERO_SESSION_DIR } from '@electron/shared/infra/shared-infra';
import { extractOriginalCollaborationQuery } from '@electron/ipc/collaboration/collaboration-message';

/**
 * Legacy cwd used before workspaces existed.
 * Sessions with this cwd are attributed to global.
 */
const LEGACY_CWD = os.homedir();

/** Ensure the session directory exists. */
async function ensureSessionDir(): Promise<void> {
  await fs.mkdir(SERO_SESSION_DIR, { recursive: true });
}

interface WorkspaceResolver {
  findByPath(absPath: string): { id: string } | undefined;
  readConfig(workspacePath: string): Promise<{ id?: string } | null>;
}

interface PathTools {
  resolve(...paths: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
}

function detachedWorkspaceId(cwd: string): string {
  return `detached:${Buffer.from(cwd).toString('base64url')}`;
}

export function isPathInsideDirectory(
  candidatePath: string,
  directoryPath: string,
  pathTools: PathTools = path,
): boolean {
  const relativePath = pathTools.relative(pathTools.resolve(directoryPath), pathTools.resolve(candidatePath));
  return relativePath === '' || (
    relativePath.length > 0
    && !relativePath.startsWith('..')
    && !pathTools.isAbsolute(relativePath)
  );
}

/**
 * Map a session's cwd to a workspace ID.
 *
 * Looks up registered workspaces first. If the workspace was closed/removed
 * from the registry but its folder still exists, read `.sero-workspace.json`
 * so the session keeps its original workspace identity instead of appearing
 * under Global. Truly unknown paths become detached, not global.
 */
export async function resolveSessionWorkspaceId(
  cwd: string,
  resolver: WorkspaceResolver = workspaceManager,
): Promise<string> {
  const entry = resolver.findByPath(cwd);
  if (entry) return entry.id;

  if (cwd === LEGACY_CWD) return 'global';

  const config = await resolver.readConfig(cwd);
  if (config?.id) return config.id;

  return detachedWorkspaceId(cwd);
}

/** Convert Pi SDK SessionInfo to our serialisable IPC shape. */
async function toSeroSessionInfo(info: {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}): Promise<SeroSessionInfo> {
  return {
    path: info.path,
    id: info.id,
    cwd: info.cwd,
    workspaceId: await resolveSessionWorkspaceId(info.cwd),
    name: info.name,
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    messageCount: info.messageCount,
    firstMessage: extractOriginalCollaborationQuery(info.firstMessage),
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
        const mapped = await Promise.all(allSessions.map(toSeroSessionInfo));

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
      await fs.appendFile(sessionFile, header + '\n', 'utf8');

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
      if (!isPathInsideDirectory(resolved, SERO_SESSION_DIR)) {
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
