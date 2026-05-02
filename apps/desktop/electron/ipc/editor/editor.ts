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
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { IpcChannels } from '@/types/ipc-channels';
import type { EditorRoot } from '@/types/ipc';
import { containerManager, workspaceManager } from '@electron/shared/infra/shared-infra';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PRIMARY_ROOT_ID } from '@electron/features/workspace/roots';
import { resolveWorkspaceRuntime } from '@electron/features/workspace/runtime-resolution';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import { shellQuote } from './shell-quote';
import {
  PRIMARY_ROOT_PREFIX,
  toContainerPath as resolveContainerPath,
  toHostPath as resolveHostPath,
} from './path-resolution';

const execFileAsync = promisify(execFile);

interface ExecFailure extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
}

// ── Editor state persistence ──────────────────────────────────

const EDITOR_STATE_DIR = path.join(SERO_AGENT_DIR, 'editor-state');

function editorStatePath(workspaceId: string): string {
  return path.join(EDITOR_STATE_DIR, `${workspaceId}.json`);
}

async function shouldUseContainerRuntime(workspaceId: string): Promise<boolean> {
  return (await resolveWorkspaceRuntime(workspaceId)).actualRuntime === 'container';
}

// ── Host-mode file operations ─────────────────────────────────

async function hostReadFile(workspaceId: string, filePath: string): Promise<string> {
  const absPath = await resolveHostPath(workspaceManager, workspaceId, filePath);
  return fs.readFile(absPath, 'utf8');
}

async function hostWriteFile(workspaceId: string, filePath: string, content: string): Promise<void> {
  const absPath = await resolveHostPath(workspaceManager, workspaceId, filePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

function invalidateGitWorkspace(workspaceId: string, reason: string): void {
  gitWorkspaceStateManager.invalidateWorkspace(workspaceId, reason);
}

async function hostListFiles(
  workspaceId: string,
  dirPath: string,
): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
  const absDir = await resolveHostPath(workspaceManager, workspaceId, dirPath);
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
  } catch (error) {
    const failure = error as ExecFailure;
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
    };
  }
}

// ── Registration ──────────────────────────────────────────────

export function registerEditorHandlers(): void {
  ipcMain.handle(
    IpcChannels.editor.readFile,
    async (_e, workspaceId: string, filePath: string) => {
      if (await shouldUseContainerRuntime(workspaceId)) {
        try {
          const containerPath = await resolveContainerPath(workspaceManager, workspaceId, filePath);
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
      if (await shouldUseContainerRuntime(workspaceId)) {
        try {
          const containerPath = await resolveContainerPath(workspaceManager, workspaceId, filePath);
          const result = await containerManager.exec(workspaceId, `base64 < ${shellQuote(containerPath)}`);
          return result.stdout.trim();
        } catch {
          // Fall through to host read
        }
      }
      const absPath = await resolveHostPath(workspaceManager, workspaceId, filePath);
      const buf = await fs.readFile(absPath);
      return buf.toString('base64');
    },
  );

  ipcMain.handle(
    IpcChannels.editor.writeFile,
    async (_e, workspaceId: string, filePath: string, content: string) => {
      if (await shouldUseContainerRuntime(workspaceId)) {
        try {
          const containerPath = await resolveContainerPath(workspaceManager, workspaceId, filePath);
          await containerManager.writeFile(workspaceId, containerPath, content);
          invalidateGitWorkspace(workspaceId, 'editor:write-file');
          return;
        } catch {
          // Container write failed — fall through to host write
        }
      }
      await hostWriteFile(workspaceId, filePath, content);
      invalidateGitWorkspace(workspaceId, 'editor:write-file');
    },
  );

  ipcMain.handle(
    IpcChannels.editor.listFiles,
    async (_e, workspaceId: string, dirPath: string) => {
      // Use container listing only when the container is registered and running.
      // Otherwise fall back to host listing so the file tree works before the
      // container has been started (e.g. when clicking a workspace header).
      if (await shouldUseContainerRuntime(workspaceId)) {
        try {
          const containerPath = await resolveContainerPath(workspaceManager, workspaceId, dirPath);
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
      const runtime = await resolveWorkspaceRuntime(workspaceId);
      if (runtime.actualRuntime === 'container') {
        try {
          return await containerManager.exec(workspaceId, command);
        } catch {
          // Container exec failed — fall through to host exec
        }
      }
      return hostExec(runtime.workspacePath, command);
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
        if (await shouldUseContainerRuntime(workspaceId)) {
          try {
            const cOld = await resolveContainerPath(workspaceManager, workspaceId, oldPath);
            const cNew = await resolveContainerPath(workspaceManager, workspaceId, newPath);
            const result = await containerManager.exec(workspaceId, `mv ${shellQuote(cOld)} ${shellQuote(cNew)}`);
            if (result.exitCode === 0) invalidateGitWorkspace(workspaceId, 'editor:rename');
            return result.exitCode === 0;
          } catch {
            // Fall through to host rename
          }
        }
        const hostOld = await resolveHostPath(workspaceManager, workspaceId, oldPath);
        const hostNew = await resolveHostPath(workspaceManager, workspaceId, newPath);
        await fs.rename(hostOld, hostNew);
        invalidateGitWorkspace(workspaceId, 'editor:rename');
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
        if (await shouldUseContainerRuntime(workspaceId)) {
          try {
            const cItem = await resolveContainerPath(workspaceManager, workspaceId, itemPath);
            const result = await containerManager.exec(workspaceId, `rm -rf ${shellQuote(cItem)}`);
            if (result.exitCode === 0) invalidateGitWorkspace(workspaceId, 'editor:delete');
            return result.exitCode === 0;
          } catch {
            // Fall through to host delete
          }
        }
        const hostItem = await resolveHostPath(workspaceManager, workspaceId, itemPath);
        await fs.rm(hostItem, { recursive: true, force: true });
        invalidateGitWorkspace(workspaceId, 'editor:delete');
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
        if (await shouldUseContainerRuntime(workspaceId)) {
          try {
            const cFile = await resolveContainerPath(workspaceManager, workspaceId, filePath);
            const result = await containerManager.exec(workspaceId, `touch ${shellQuote(cFile)}`);
            if (result.exitCode === 0) invalidateGitWorkspace(workspaceId, 'editor:create-file');
            return result.exitCode === 0;
          } catch {
            // Fall through to host create
          }
        }
        const hostFile = await resolveHostPath(workspaceManager, workspaceId, filePath);
        await fs.mkdir(path.dirname(hostFile), { recursive: true });
        await fs.writeFile(hostFile, '', { flag: 'wx' }).catch(() =>
          fs.writeFile(hostFile, '', 'utf8'),
        );
        invalidateGitWorkspace(workspaceId, 'editor:create-file');
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
        if (await shouldUseContainerRuntime(workspaceId)) {
          try {
            const cDir = await resolveContainerPath(workspaceManager, workspaceId, dirPath);
            const result = await containerManager.exec(workspaceId, `mkdir -p ${shellQuote(cDir)}`);
            if (result.exitCode === 0) invalidateGitWorkspace(workspaceId, 'editor:create-dir');
            return result.exitCode === 0;
          } catch {
            // Fall through to host create
          }
        }
        const hostDir = await resolveHostPath(workspaceManager, workspaceId, dirPath);
        await fs.mkdir(hostDir, { recursive: true });
        invalidateGitWorkspace(workspaceId, 'editor:create-dir');
        return true;
      } catch (err: unknown) {
        console.warn('[editor:createDir]', err);
        return false;
      }
    },
  );
}

