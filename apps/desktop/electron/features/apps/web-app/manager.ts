import path from 'node:path';
import { promises as fs } from 'node:fs';

import type { WebAppActionFailure, WebAppActionResult, WebAppRequest } from '@sero/common';
import {
  addBookmark,
  clearHistory,
  removeBookmark,
  removeDownload,
  resolveStatePath,
} from '@plugins/sero-web-plugin/extension/state-sync';
import { workspaceManager } from '@electron/features/workspace/manager';

function failure<A extends WebAppRequest['action']>(
  action: A,
  message: string,
): WebAppActionFailure<A> {
  return { ok: false, action, message };
}

function resolveWorkspaceItemPath(workspacePath: string, itemPath: string): string {
  const resolved = path.resolve(workspacePath, itemPath);
  const normalizedWorkspace = path.resolve(workspacePath);
  if (
    resolved !== normalizedWorkspace
    && !resolved.startsWith(`${normalizedWorkspace}${path.sep}`)
  ) {
    throw new Error(`Path escapes workspace: ${itemPath}`);
  }
  return resolved;
}

class WebWorkspaceActionManager {
  async runWorkspaceAction(workspaceId: string, params: WebAppRequest): Promise<WebAppActionResult> {
    const workspacePath = workspaceManager.getPath(workspaceId);
    if (!workspacePath) {
      return failure(params.action, `Workspace not found: ${workspaceId}`);
    }

    const stateFilePath = resolveStatePath(workspacePath);

    try {
      switch (params.action) {
        case 'clear-history':
          await clearHistory(stateFilePath);
          return { ok: true, action: params.action };

        case 'add-bookmark':
          await addBookmark(
            stateFilePath,
            params.url,
            params.title ?? '',
            params.description,
            params.tags,
          );
          return { ok: true, action: params.action };

        case 'remove-bookmark':
          await removeBookmark(stateFilePath, params.idOrUrl);
          return { ok: true, action: params.action };

        case 'delete-download':
          await this.deleteDownload(workspacePath, stateFilePath, params);
          return { ok: true, action: params.action };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure(params.action, message);
    }
  }

  private async deleteDownload(
    workspacePath: string,
    stateFilePath: string,
    params: Extract<WebAppRequest, { action: 'delete-download' }>,
  ): Promise<void> {
    if (params.completed && params.relativePath) {
      const targetPath = resolveWorkspaceItemPath(workspacePath, params.relativePath);
      await fs.rm(targetPath, { recursive: true, force: false });
    }

    await removeDownload(stateFilePath, params.downloadId);
  }
}

export const webWorkspaceActionManager = new WebWorkspaceActionManager();
