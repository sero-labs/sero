/**
 * GitHub auth IPC handlers — device flow login, logout, status.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type { CreateGitHubRepoInput, CreateGitHubRepoResult } from '../../../src/types/ipc';
import type { DeviceFlowProgress, GitHubAuthStatus } from '../../features/auth/github/auth-manager';
import { githubAuth, githubRepoOps } from '../../shared/infra/shared-infra';

const Ch = IpcChannels.github;

let loginAbort: AbortController | null = null;

function broadcast(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
  }
}

export function registerGitHubHandlers(): void {
  ipcMain.handle(Ch.status, async (): Promise<GitHubAuthStatus> => {
    return githubAuth.getStatus();
  });

  ipcMain.handle(Ch.login, async (): Promise<void> => {
    // Cancel any in-flight login
    if (loginAbort) {
      loginAbort.abort();
      loginAbort = null;
    }

    loginAbort = new AbortController();

    try {
      await githubAuth.login(
        (event: DeviceFlowProgress) => {
          broadcast(Ch.event, event);
        },
        loginAbort.signal,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'AbortError' && !msg.includes('aborted')) {
        broadcast(Ch.event, {
          type: 'error' as const,
          message: msg,
        });
      }
    } finally {
      loginAbort = null;
    }
  });

  ipcMain.handle(Ch.logout, async (): Promise<void> => {
    githubAuth.logout();
  });

  ipcMain.handle(Ch.cancel, async (): Promise<void> => {
    if (loginAbort) {
      loginAbort.abort();
      loginAbort = null;
    }
  });

  ipcMain.handle(
    Ch.createRepo,
    async (_event, workspaceId: string, input: CreateGitHubRepoInput): Promise<CreateGitHubRepoResult> => {
      return githubRepoOps.createRepo(workspaceId, input);
    },
  );
}
