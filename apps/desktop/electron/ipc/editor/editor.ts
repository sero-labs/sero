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
import { IpcChannels } from '../../../src/types/ipc';
import type { EditorRoot } from '../../../src/types/ipc';
import { containerManager, workspaceManager } from '../../shared/infra/shared-infra';
import { SERO_AGENT_DIR } from '../../platform/env';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PRIMARY_ROOT_ID } from '../../features/workspace/roots';

const execFileAsync = promisify(execFile);

// ── Editor state persistence ──────────────────────────────────

const EDITOR_STATE_DIR = path.join(SERO_AGENT_DIR, 'editor-state');

function editorStatePath(workspaceId: string): string {
  return path.join(EDITOR_STATE_DIR, `${workspaceId}.json`);
}

// ── Path resolution helpers ───────────────────────────────────

const PRIMARY_ROOT_PREFIX = `/${PRIMARY_ROOT_ID}`; // "/workspace"

/** Maximum allowed path length (prevents DoS via absurdly long paths). */
const MAX_PATH_LENGTH = 4096;

/**
 * Quote a string for safe inclusion in a POSIX shell command.
 *
 * Wraps the value in single quotes and escapes any embedded single quotes
 * via the standard `'\''` trick. This is the only way arbitrary file paths
 * (which can contain apostrophes, spaces, $, backticks, etc.) get pasted
 * into container `exec` commands without becoming injection vectors.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Split a virtual path into `<rootId>` + remainder.
 *
 * - `/workspace/foo`   → `{ rootId: 'workspace', rest: '/foo' }`
 * - `/sero-source/x`   → `{ rootId: 'sero-source', rest: '/x' }`
 * - `/workspace`       → `{ rootId: 'workspace', rest: '' }`
 * - `foo/bar` (legacy) → `{ rootId: null, rest: 'foo/bar' }`
 */
function splitVirtualPath(virtualPath: string): { rootId: string | null; rest: string } {
  if (!virtualPath.startsWith('/')) return { rootId: null, rest: virtualPath };
  const trimmed = virtualPath.slice(1);
  const slash = trimmed.indexOf('/');
  if (slash === -1) return { rootId: trimmed || null, rest: '' };
  return { rootId: trimmed.slice(0, slash), rest: trimmed.slice(slash) };
}

/** Apply baseline path validation (null bytes, length). */
function validatePathBasics(filePath: string): void {
  if (filePath.includes('\0')) {
    throw new Error('Path contains null bytes');
  }
  if (filePath.length > MAX_PATH_LENGTH) {
    throw new Error(`Path too long (max ${MAX_PATH_LENGTH} characters)`);
  }
}

/**
 * Resolve a relative path against a host root and apply the sandbox checks.
 * Shared by `toHostPath` (multi-root path) and the legacy single-root path.
 */
function resolveAgainstRoot(rootHostPath: string, relative: string, originalForError: string): string {
  const raw = path.join(rootHostPath, relative);
  const resolved = path.resolve(raw);
  const root = path.resolve(rootHostPath);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes workspace: ${originalForError}`);
  }

  // Resolve symlinks to catch symlink escape attacks
  // (e.g., a symlink inside workspace pointing to /etc/).
  try {
    const realResolved = realpathSync(resolved);
    const realRoot = realpathSync(root);
    if (!realResolved.startsWith(realRoot + path.sep) && realResolved !== realRoot) {
      throw new Error(`Symlink escapes workspace: ${originalForError}`);
    }
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist yet — the path.resolve check above is sufficient
    } else if (err instanceof Error && err.message.includes('escapes workspace')) {
      throw err;
    }
    // Other errors (permission denied, etc.) — allow the operation to proceed
    // and let the actual fs operation handle the error.
  }

  return resolved;
}

/**
 * Translate a `/<rootId>/...`-prefixed virtual path to an absolute host path
 * for the given workspace.
 *
 * Multi-root resolution:
 *   - `/workspace/foo`     → `<workspace.path>/foo`
 *   - `/sero-source/foo`   → `<root["sero-source"].path>/foo`
 *   - `foo/bar` (no slash) → `<workspace.path>/foo/bar` (legacy fallback)
 *   - `/unknown-root/x`    → throws (rooted paths must reference a real root)
 *
 * **Security:** Each root has its own sandbox. Cross-root traversal is
 * structurally impossible: after slicing the prefix, the remainder is
 * joined only with the matching root's host path, so `..` segments can
 * never reach a sibling root or escape the host root.
 */
async function toHostPath(workspaceId: string, filePath: string): Promise<string> {
  validatePathBasics(filePath);

  const { rootId, rest } = splitVirtualPath(filePath);

  // Bare relative paths fall through to the primary root for legacy callers.
  if (!rootId) {
    const primary = workspaceManager.getPath(workspaceId);
    if (!primary) throw new Error(`Workspace not found: ${workspaceId}`);
    return resolveAgainstRoot(primary, filePath, filePath);
  }

  // Rooted paths must resolve to a known root — never silently fall back to
  // the primary, since that would mask renderer bugs (and could let a typo
  // like `/workspac/foo` succeed against `<primary>/workspac/foo`).
  const rootHost = await workspaceManager.resolveRootPath(workspaceId, rootId);
  if (!rootHost) {
    throw new Error(`Unknown workspace root: ${rootId}`);
  }

  return resolveAgainstRoot(rootHost, rest, filePath);
}



// ── Host-mode file operations ─────────────────────────────────

async function hostReadFile(workspaceId: string, filePath: string): Promise<string> {
  const absPath = await toHostPath(workspaceId, filePath);
  return fs.readFile(absPath, 'utf8');
}

async function hostWriteFile(workspaceId: string, filePath: string, content: string): Promise<void> {
  const absPath = await toHostPath(workspaceId, filePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

async function hostListFiles(
  workspaceId: string,
  dirPath: string,
): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
  const absDir = await toHostPath(workspaceId, dirPath);
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

/**
 * Translate a virtual `/<rootId>/...` path to the path the container should
 * see. Each extra root is bind-mounted at its host absolute path inside
 * `sero-<workspaceId>`, so the in-container path equals the host path.
 *
 * Primary-root paths (`/workspace/...`) are passed through unchanged because
 * the container's primary mount point IS `/workspace`. Bare relative paths
 * resolve under `/workspace` for legacy callers. Unknown root ids throw to
 * mirror `toHostPath`'s behaviour.
 */
async function toContainerPath(workspaceId: string, virtualPath: string): Promise<string> {
  // Reuse the same null-byte / length validation as the host path resolver.
  validatePathBasics(virtualPath);

  if (!virtualPath.startsWith('/')) {
    // Relative paths join under /workspace inside the container, mirroring legacy behaviour.
    return path.posix.join('/workspace', virtualPath);
  }

  const trimmed = virtualPath.slice(1);
  const slash = trimmed.indexOf('/');
  const rootId = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const rest = slash === -1 ? '' : trimmed.slice(slash);

  if (rootId === PRIMARY_ROOT_ID) return virtualPath; // already container-native

  const hostRoot = await workspaceManager.resolveRootPath(workspaceId, rootId);
  if (!hostRoot) {
    throw new Error(`Unknown workspace root: ${rootId}`);
  }

  // Container bind-mount preserves the host path, so the container path
  // equals `<hostRoot><rest>`. POSIX-join because container is always linux.
  return rest ? path.posix.join(hostRoot, rest.slice(1)) : hostRoot;
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
          const containerPath = await toContainerPath(workspaceId, filePath);
          return await containerManager.readFile(workspaceId, containerPath);
        } catch {
          // Container exec failed — fall through to host read
        }
      }
      return hostReadFile(workspaceId, filePath);
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
          const containerPath = await toContainerPath(workspaceId, filePath);
          const result = await containerManager.exec(workspaceId, `base64 < ${shellQuote(containerPath)}`);
          return result.stdout.trim();
        } catch {
          // Fall through to host read
        }
      }
      const absPath = await toHostPath(workspaceId, filePath);
      const buf = await fs.readFile(absPath);
      return buf.toString('base64');
    },
  );

  ipcMain.handle(
    IpcChannels.editor.writeFile,
    async (_e, workspaceId: string, filePath: string, content: string) => {
      if (await workspaceManager.isContainerEnabled(workspaceId)) {
        const containerPath = await toContainerPath(workspaceId, filePath);
        return containerManager.writeFile(workspaceId, containerPath, content);
      }
      return hostWriteFile(workspaceId, filePath, content);
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
          const containerPath = await toContainerPath(workspaceId, dirPath);
          return await containerManager.listFiles(workspaceId, containerPath);
        } catch {
          // Container exec failed — fall through to host listing
        }
      }
      return hostListFiles(workspaceId, dirPath);
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
      // New code should call `editor.getRoots` instead, which returns all roots
      // (primary + additional) for multi-root workspaces.
      return PRIMARY_ROOT_PREFIX;
    },
  );

  ipcMain.handle(
    IpcChannels.editor.getRoots,
    async (_e, workspaceId: string): Promise<EditorRoot[]> => {
      // Require a real workspace so callers don't silently work against
      // a nonexistent id and only fail when they hit an actual file op.
      const entry = workspaceManager.findEntry(workspaceId);
      if (!entry) throw new Error(`Workspace not found: ${workspaceId}`);
      const info = await workspaceManager.getConfig(workspaceId);
      const result: EditorRoot[] = [
        {
          id: PRIMARY_ROOT_ID,
          name: info?.name ?? entry.id ?? 'Workspace',
          virtualPath: PRIMARY_ROOT_PREFIX,
          kind: 'workspace',
        },
      ];
      for (const root of info?.roots ?? []) {
        result.push({
          id: root.id,
          name: root.name,
          virtualPath: `/${root.id}`,
          kind: root.kind ?? 'folder',
        });
      }
      return result;
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
          const cOld = await toContainerPath(workspaceId, oldPath);
          const cNew = await toContainerPath(workspaceId, newPath);
          const result = await containerManager.exec(workspaceId, `mv ${shellQuote(cOld)} ${shellQuote(cNew)}`);
          return result.exitCode === 0;
        }
        const hostOld = await toHostPath(workspaceId, oldPath);
        const hostNew = await toHostPath(workspaceId, newPath);
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
          const cItem = await toContainerPath(workspaceId, itemPath);
          const result = await containerManager.exec(workspaceId, `rm -rf ${shellQuote(cItem)}`);
          return result.exitCode === 0;
        }
        const hostItem = await toHostPath(workspaceId, itemPath);
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
          const cFile = await toContainerPath(workspaceId, filePath);
          const result = await containerManager.exec(workspaceId, `touch ${shellQuote(cFile)}`);
          return result.exitCode === 0;
        }
        const hostFile = await toHostPath(workspaceId, filePath);
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
          const cDir = await toContainerPath(workspaceId, dirPath);
          const result = await containerManager.exec(workspaceId, `mkdir -p ${shellQuote(cDir)}`);
          return result.exitCode === 0;
        }
        const hostDir = await toHostPath(workspaceId, dirPath);
        await fs.mkdir(hostDir, { recursive: true });
        return true;
      } catch (err: unknown) {
        console.warn('[editor:createDir]', err);
        return false;
      }
    },
  );
}

