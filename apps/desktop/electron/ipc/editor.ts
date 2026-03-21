/**
 * Editor IPC handlers — dual-mode file I/O + editor state persistence.
 *
 * Each handler checks if the workspace uses containers:
 *   - Container mode: delegates to containerManager
 *   - Host mode: reads/writes directly on the host filesystem
 *
 * The renderer always works with /workspace-prefixed paths.
 * Host mode translates: /workspace/foo → <workspacePath>/foo
 */

import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync, realpathSync } from 'fs';
import path from 'path';
import { IpcChannels } from '../../src/types/ipc';
import { containerManager, workspaceManager } from './shared-infra';
import { SERO_AGENT_DIR } from '../env';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ── Editor state persistence ──────────────────────────────────

const EDITOR_STATE_DIR = path.join(SERO_AGENT_DIR, 'editor-state');

function editorStatePath(workspaceId: string): string {
  return path.join(EDITOR_STATE_DIR, `${workspaceId}.json`);
}

// ── Path resolution helpers ───────────────────────────────────

const WORKSPACE_PREFIX = '/workspace';

/** Maximum allowed path length (prevents DoS via absurdly long paths). */
const MAX_PATH_LENGTH = 4096;

/**
 * Translate a /workspace-prefixed path to an absolute host path.
 * If the path doesn't start with /workspace, treat it as relative.
 *
 * **Security:** The resolved path is checked against the workspace root.
 * Throws if the result escapes the workspace (e.g. via `..` traversal,
 * symlink escapes, null bytes, or excessively long paths).
 */
function toHostPath(workspacePath: string, filePath: string): string {
  // Reject null bytes (could truncate path in native code)
  if (filePath.includes('\0')) {
    throw new Error('Path contains null bytes');
  }

  // Reject excessively long paths
  if (filePath.length > MAX_PATH_LENGTH) {
    throw new Error(`Path too long (max ${MAX_PATH_LENGTH} characters)`);
  }

  let raw: string;
  if (filePath.startsWith(WORKSPACE_PREFIX)) {
    const relative = filePath.slice(WORKSPACE_PREFIX.length);
    raw = path.join(workspacePath, relative);
  } else {
    raw = path.join(workspacePath, filePath);
  }

  const resolved = path.resolve(raw);
  const root = path.resolve(workspacePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }

  // Resolve symlinks to catch symlink escape attacks
  // (e.g., a symlink inside workspace pointing to /etc/)
  try {
    const realResolved = realpathSync(resolved);
    const realRoot = realpathSync(root);
    if (!realResolved.startsWith(realRoot + path.sep) && realResolved !== realRoot) {
      throw new Error(`Symlink escapes workspace: ${filePath}`);
    }
  } catch (err) {
    // If the file doesn't exist yet (e.g., write to new file), realpathSync
    // will throw ENOENT. In that case, the resolve() check above is sufficient.
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist yet — the path.resolve check is sufficient
    } else if (err instanceof Error && err.message.includes('escapes workspace')) {
      throw err;
    }
    // Other errors (permission denied, etc.) — allow the operation to proceed
    // and let the actual fs operation handle the error
  }

  return resolved;
}

// ── Host-mode file operations ─────────────────────────────────

async function hostReadFile(workspacePath: string, filePath: string): Promise<string> {
  const absPath = toHostPath(workspacePath, filePath);
  return fs.readFile(absPath, 'utf8');
}

async function hostWriteFile(workspacePath: string, filePath: string, content: string): Promise<void> {
  const absPath = toHostPath(workspacePath, filePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

async function hostListFiles(
  workspacePath: string,
  dirPath: string,
): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
  const absDir = toHostPath(workspacePath, dirPath);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const results: Array<{ name: string; type: 'file' | 'directory'; size: number }> = [];

  for (const entry of entries) {
    const entryPath = path.join(absDir, entry.name);
    let size = 0;
    try {
      const stat = await fs.stat(entryPath);
      size = stat.size;
    } catch { /* skip stat errors */ }
    results.push({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size,
    });
  }
  return results;
}

async function hostExec(
  workspacePath: string,
  command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
      cwd: workspacePath,
      timeout: 30_000,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err: any) {
    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message,
    };
  }
}

// ── Registration ──────────────────────────────────────────────

export function registerEditorHandlers(): void {
  ipcMain.handle(
    IpcChannels.editor.readFile,
    async (_e, workspaceId: string, filePath: string) => {
      if (
        await workspaceManager.isContainerEnabled(workspaceId) &&
        containerManager.hasContainer(workspaceId)
      ) {
        try {
          return await containerManager.readFile(workspaceId, filePath);
        } catch {
          // Container exec failed — fall through to host read
        }
      }
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      return hostReadFile(wsPath, filePath);
    },
  );

  // Read a binary file as base64 (for media/document previews in the editor)
  ipcMain.handle(
    IpcChannels.editor.readBinaryFile,
    async (_e, workspaceId: string, filePath: string): Promise<string> => {
      // For containers, use container exec to base64-encode the file
      if (
        await workspaceManager.isContainerEnabled(workspaceId) &&
        containerManager.hasContainer(workspaceId)
      ) {
        try {
          const result = await containerManager.exec(workspaceId, `base64 < ${JSON.stringify(filePath)}`);
          return result.stdout.trim();
        } catch {
          // Fall through to host read
        }
      }
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      const absPath = toHostPath(wsPath, filePath);
      const buf = await fs.readFile(absPath);
      return buf.toString('base64');
    },
  );

  ipcMain.handle(
    IpcChannels.editor.writeFile,
    async (_e, workspaceId: string, filePath: string, content: string) => {
      if (await workspaceManager.isContainerEnabled(workspaceId)) {
        return containerManager.writeFile(workspaceId, filePath, content);
      }
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      return hostWriteFile(wsPath, filePath, content);
    },
  );

  ipcMain.handle(
    IpcChannels.editor.listFiles,
    async (_e, workspaceId: string, dirPath: string) => {
      // Use container listing only when the container is registered and running.
      // Otherwise fall back to host listing so the file tree works before the
      // container has been started (e.g. when clicking a workspace header).
      if (
        await workspaceManager.isContainerEnabled(workspaceId) &&
        containerManager.hasContainer(workspaceId)
      ) {
        try {
          return await containerManager.listFiles(workspaceId, dirPath);
        } catch {
          // Container exec failed — fall through to host listing
        }
      }
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      return hostListFiles(wsPath, dirPath);
    },
  );

  ipcMain.handle(
    IpcChannels.editor.exec,
    async (_e, workspaceId: string, command: string) => {
      if (await workspaceManager.isContainerEnabled(workspaceId)) {
        return containerManager.exec(workspaceId, command);
      }
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) throw new Error(`Workspace not found: ${workspaceId}`);
      return hostExec(wsPath, command);
    },
  );

  ipcMain.handle(
    IpcChannels.editor.saveState,
    async (_e, workspaceId: string, state: { openTabs: string[]; activeTab: string | null }) => {
      mkdirSync(EDITOR_STATE_DIR, { recursive: true });
      await fs.writeFile(editorStatePath(workspaceId), JSON.stringify(state, null, 2), 'utf8');
    },
  );

  ipcMain.handle(
    IpcChannels.editor.loadState,
    async (_e, workspaceId: string) => {
      const fp = editorStatePath(workspaceId);
      if (!existsSync(fp)) return null;
      try {
        const raw = await fs.readFile(fp, 'utf8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.editor.getRootPath,
    async (_e, _workspaceId: string) => {
      // Always return /workspace — the renderer uses this as a virtual root.
      // The main process translates /workspace/... → actual host path for non-container workspaces.
      return '/workspace';
    },
  );

  ipcMain.handle(
    IpcChannels.editor.isContainer,
    async (_e, workspaceId: string) => {
      return workspaceManager.isContainerEnabled(workspaceId);
    },
  );

  // ── First-class file operations (avoid shell commands) ────

  ipcMain.handle(
    IpcChannels.editor.rename,
    async (_e, workspaceId: string, oldPath: string, newPath: string): Promise<boolean> => {
      try {
        if (await workspaceManager.isContainerEnabled(workspaceId)) {
          const result = await containerManager.exec(workspaceId, `mv '${oldPath}' '${newPath}'`);
          return result.exitCode === 0;
        }
        const wsPath = workspaceManager.getPath(workspaceId);
        if (!wsPath) return false;
        const hostOld = toHostPath(wsPath, oldPath);
        const hostNew = toHostPath(wsPath, newPath);
        await fs.rename(hostOld, hostNew);
        return true;
      } catch (err: unknown) {
        console.warn('[editor:rename]', err);
        return false;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.editor.delete,
    async (_e, workspaceId: string, itemPath: string): Promise<boolean> => {
      try {
        if (await workspaceManager.isContainerEnabled(workspaceId)) {
          const result = await containerManager.exec(workspaceId, `rm -rf '${itemPath}'`);
          return result.exitCode === 0;
        }
        const wsPath = workspaceManager.getPath(workspaceId);
        if (!wsPath) return false;
        const hostItem = toHostPath(wsPath, itemPath);
        await fs.rm(hostItem, { recursive: true, force: true });
        return true;
      } catch (err: unknown) {
        console.warn('[editor:delete]', err);
        return false;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.editor.createFile,
    async (_e, workspaceId: string, filePath: string): Promise<boolean> => {
      try {
        if (await workspaceManager.isContainerEnabled(workspaceId)) {
          const result = await containerManager.exec(workspaceId, `touch '${filePath}'`);
          return result.exitCode === 0;
        }
        const wsPath = workspaceManager.getPath(workspaceId);
        if (!wsPath) return false;
        const hostFile = toHostPath(wsPath, filePath);
        await fs.mkdir(path.dirname(hostFile), { recursive: true });
        await fs.writeFile(hostFile, '', { flag: 'wx' }).catch(() =>
          fs.writeFile(hostFile, '', 'utf8'),
        );
        return true;
      } catch (err: unknown) {
        console.warn('[editor:createFile]', err);
        return false;
      }
    },
  );

  ipcMain.handle(
    IpcChannels.editor.createDir,
    async (_e, workspaceId: string, dirPath: string): Promise<boolean> => {
      try {
        if (await workspaceManager.isContainerEnabled(workspaceId)) {
          const result = await containerManager.exec(workspaceId, `mkdir -p '${dirPath}'`);
          return result.exitCode === 0;
        }
        const wsPath = workspaceManager.getPath(workspaceId);
        if (!wsPath) return false;
        const hostDir = toHostPath(wsPath, dirPath);
        await fs.mkdir(hostDir, { recursive: true });
        return true;
      } catch (err: unknown) {
        console.warn('[editor:createDir]', err);
        return false;
      }
    },
  );
}
