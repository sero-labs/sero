/**
 * Editor IPC handlers backed by the selected RuntimeBackend.
 *
 * The renderer always works with /workspace-prefixed paths for the primary
 * root. Main process path resolution maps editor virtual paths to runtime
 * paths before delegating file operations to the runtime provider.
 */

import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { IpcChannels } from '@/types/ipc-channels';
import type { EditorRoot } from '@/types/ipc';
import { workspaceManager } from '@electron/shared/infra/shared-infra';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { PRIMARY_ROOT_ID } from '@electron/features/workspace/roots';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { RuntimeDirectoryEntry } from '@electron/features/workspace/runtime/types';
import {
  PRIMARY_ROOT_PREFIX,
  toContainerPath as resolveRuntimePath,
} from './path-resolution';

const EDITOR_STATE_DIR = path.join(SERO_AGENT_DIR, 'editor-state');

function editorStatePath(workspaceId: string): string {
  return path.join(EDITOR_STATE_DIR, `${workspaceId}.json`);
}

function invalidateGitWorkspace(workspaceId: string, reason: string): void {
  gitWorkspaceStateManager.invalidateWorkspace(workspaceId, reason);
}

async function getRuntimePath(workspaceId: string, editorPath: string): Promise<string> {
  return resolveRuntimePath(workspaceManager, workspaceId, editorPath);
}

function toEditorEntries(entries: RuntimeDirectoryEntry[]) {
  return entries.map((entry) => ({
    name: entry.name,
    type: entry.type,
    size: entry.size,
  }));
}

export function registerEditorHandlers(): void {
  ipcMain.handle(
    IpcChannels.editor.readFile,
    async (_e, workspaceId: string, filePath: string) => {
      const [runtime, runtimePath] = await Promise.all([
        runtimeManager.getRuntime(workspaceId),
        getRuntimePath(workspaceId, filePath),
      ]);
      return (await runtime.readFile({ path: runtimePath })).content;
    },
  );

  ipcMain.handle(
    IpcChannels.editor.readBinaryFile,
    async (_e, workspaceId: string, filePath: string): Promise<string> => {
      const [runtime, runtimePath] = await Promise.all([
        runtimeManager.getRuntime(workspaceId),
        getRuntimePath(workspaceId, filePath),
      ]);
      return (await runtime.readFile({ path: runtimePath, binary: true })).content;
    },
  );

  ipcMain.handle(
    IpcChannels.editor.writeFile,
    async (_e, workspaceId: string, filePath: string, content: string) => {
      const [runtime, runtimePath] = await Promise.all([
        runtimeManager.getRuntime(workspaceId),
        getRuntimePath(workspaceId, filePath),
      ]);
      await runtime.writeFile({ path: runtimePath, content });
      invalidateGitWorkspace(workspaceId, 'editor:write-file');
    },
  );

  ipcMain.handle(
    IpcChannels.editor.listFiles,
    async (_e, workspaceId: string, dirPath: string) => {
      const [runtime, runtimePath] = await Promise.all([
        runtimeManager.getRuntime(workspaceId),
        getRuntimePath(workspaceId, dirPath),
      ]);
      return toEditorEntries(await runtime.listFiles({ path: runtimePath }));
    },
  );

  ipcMain.handle(
    IpcChannels.editor.exec,
    async (_e, workspaceId: string, command: string) => {
      const runtime = await runtimeManager.getRuntime(workspaceId);
      return runtime.exec({ command, cwd: runtime.runtimeWorkspacePath, timeoutMs: 30_000 });
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

  ipcMain.handle(IpcChannels.editor.getRootPath, async () => PRIMARY_ROOT_PREFIX);

  ipcMain.handle(
    IpcChannels.editor.getRoots,
    async (_e, workspaceId: string): Promise<EditorRoot[]> => {
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
      // Compatibility channel: renderer callers still ask for a boolean, but
      // the source of truth is the provider-aware runtime backend.
      const runtime = await workspaceManager.getRuntimeConfig(workspaceId);
      return runtime.backend !== 'host';
    },
  );

  ipcMain.handle(
    IpcChannels.editor.rename,
    async (_e, workspaceId: string, oldPath: string, newPath: string): Promise<boolean> => {
      try {
        const runtime = await runtimeManager.getRuntime(workspaceId);
        await runtime.rename({
          oldPath: await getRuntimePath(workspaceId, oldPath),
          newPath: await getRuntimePath(workspaceId, newPath),
        });
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
        const runtime = await runtimeManager.getRuntime(workspaceId);
        await runtime.delete({ path: await getRuntimePath(workspaceId, itemPath), recursive: true });
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
        const runtime = await runtimeManager.getRuntime(workspaceId);
        await runtime.createFile({ path: await getRuntimePath(workspaceId, filePath), content: '', overwrite: true });
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
        const runtime = await runtimeManager.getRuntime(workspaceId);
        await runtime.createDirectory({ path: await getRuntimePath(workspaceId, dirPath), recursive: true });
        invalidateGitWorkspace(workspaceId, 'editor:create-dir');
        return true;
      } catch (err: unknown) {
        console.warn('[editor:createDir]', err);
        return false;
      }
    },
  );
}
