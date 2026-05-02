/**
 * App control IPC handlers — navigation, screenshots, interaction, recording.
 *
 * The renderer exposes `window.__appControl` (set up by `initAppControlBridge`
 * in src/lib/app-control-bridge.ts). The main process calls those functions
 * via `webContents.executeJavaScript()`. Screenshots use Electron's native
 * `webContents.capturePage()`.
 */

import { ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
} from '@/types/ipc';
import { appControlHostService } from '@electron/features/apps/app-control/host-service';

export function registerAppControlHandlers(): void {
  ipcMain.handle(IpcChannels.appControl.list, async (): Promise<AppControlEntry[]> => {
    return appControlHostService.list();
  });

  ipcMain.handle(IpcChannels.appControl.active, async (): Promise<string> => {
    return appControlHostService.active();
  });

  ipcMain.handle(IpcChannels.appControl.open, async (_e, appId: string): Promise<boolean> => {
    return appControlHostService.open(appId);
  });

  ipcMain.handle(IpcChannels.appControl.info, async (_e, appId: string): Promise<AppControlEntry | null> => {
    return appControlHostService.info(appId);
  });

  ipcMain.handle(IpcChannels.appControl.openFile, async (_e, workspaceId: string, filePath: string): Promise<boolean> => {
    return appControlHostService.openFile(workspaceId, filePath);
  });

  ipcMain.handle(IpcChannels.appControl.getAppRect, async (): Promise<AppPanelRect | null> => {
    return appControlHostService.getAppRect();
  });

  ipcMain.handle(IpcChannels.appControl.screenshot, async (): Promise<string | null> => {
    try {
      return await appControlHostService.screenshot();
    } catch (err) {
      console.error('[app-control] Screenshot failed:', err);
      return null;
    }
  });

  ipcMain.handle(
    IpcChannels.appControl.interact,
    async (_e, params: AppInteractionParams): Promise<AppInteractionResult> => {
      return appControlHostService.interact(params);
    },
  );

  ipcMain.handle(IpcChannels.appControl.recordStart, async (): Promise<boolean> => {
    return appControlHostService.recordStart();
  });

  ipcMain.handle(IpcChannels.appControl.recordStop, async (): Promise<AppRecordingResult | null> => {
    return appControlHostService.recordStop();
  });

  ipcMain.handle(IpcChannels.appControl.recordStatus, async (): Promise<AppRecordingStatus> => {
    return appControlHostService.recordStatus();
  });
}
