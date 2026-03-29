/**
 * App control IPC handlers — navigation, screenshots, interaction, recording.
 *
 * The renderer exposes `window.__appControl` (set up by `initAppControlBridge`
 * in src/lib/app-control-bridge.ts). The main process calls those functions
 * via `webContents.executeJavaScript()`. Screenshots use Electron's native
 * `webContents.capturePage()`.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type {
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
} from '../../../src/types/ipc';
import { captureRegion } from '../../shared/media/capture';
import { encodeFramesToMp4 } from '../../shared/media/video-encoder';

// ── Recording State ──────────────────────────────────────────

interface RecordingFrame {
  timestamp: number;
  base64: string;
}

const recordingState = {
  active: false,
  startedAt: null as string | null,
  frames: [] as RecordingFrame[],
  interval: null as ReturnType<typeof setInterval> | null,
};

// ── Helpers ──────────────────────────────────────────────────

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}

async function execRenderer<T>(code: string): Promise<T> {
  const win = getMainWindow();
  if (!win) throw new Error('No main window');
  return win.webContents.executeJavaScript(code) as Promise<T>;
}

async function captureRect(rect: AppPanelRect): Promise<string | null> {
  const win = getMainWindow();
  if (!win) return null;
  return captureRegion(win, rect);
}

async function captureRecordingFrame(): Promise<void> {
  try {
    const rect = await execRenderer<AppPanelRect | null>('window.__appControl?.getAppRect() ?? null');
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const screenshot = await captureRect(rect);
    if (screenshot) recordingState.frames.push({ timestamp: Date.now(), base64: screenshot });
  } catch {
    // Skip frame capture failures during recording
  }
}

// ── Registration ─────────────────────────────────────────────

export function registerAppControlHandlers(): void {
  ipcMain.handle(IpcChannels.appControl.list, async (): Promise<AppControlEntry[]> => {
    return execRenderer<AppControlEntry[]>('window.__appControl?.getList() ?? []');
  });

  ipcMain.handle(IpcChannels.appControl.active, async (): Promise<string> => {
    return execRenderer<string>('window.__appControl?.getActive() ?? "coding"');
  });

  ipcMain.handle(IpcChannels.appControl.open, async (_e, appId: string): Promise<boolean> => {
    return execRenderer<boolean>(`window.__appControl?.openApp(${JSON.stringify(appId)}) ?? false`);
  });

  ipcMain.handle(IpcChannels.appControl.info, async (_e, appId: string): Promise<AppControlEntry | null> => {
    return execRenderer<AppControlEntry | null>(`window.__appControl?.getInfo(${JSON.stringify(appId)}) ?? null`);
  });

  ipcMain.handle(IpcChannels.appControl.openFile, async (_e, workspaceId: string, filePath: string): Promise<boolean> => {
    return execRenderer<boolean>(
      `window.__appControl?.openFile(${JSON.stringify(workspaceId)}, ${JSON.stringify(filePath)}) ?? false`,
    );
  });

  ipcMain.handle(IpcChannels.appControl.getAppRect, async (): Promise<AppPanelRect | null> => {
    return execRenderer<AppPanelRect | null>('window.__appControl?.getAppRect() ?? null');
  });

  ipcMain.handle(IpcChannels.appControl.screenshot, async (): Promise<string | null> => {
    try {
      const rect = await execRenderer<AppPanelRect | null>('window.__appControl?.getAppRect() ?? null');
      if (!rect) return null;
      return captureRect(rect);
    } catch (err) {
      console.error('[app-control] Screenshot failed:', err);
      return null;
    }
  });

  ipcMain.handle(
    IpcChannels.appControl.interact,
    async (_e, params: AppInteractionParams): Promise<AppInteractionResult> => {
      try {
        const result = await execRenderer<AppInteractionResult>(
          `window.__appControl?.interact(${JSON.stringify(params)})`,
        );

        // Auto-screenshot after interaction (unless disabled)
        if (params.captureAfter !== false && result.success) {
          await new Promise((r) => setTimeout(r, 200));
          const rect = await execRenderer<AppPanelRect | null>('window.__appControl?.getAppRect() ?? null');
          if (rect) {
            const screenshot = await captureRect(rect);
            if (screenshot) result.screenshot = screenshot;
          }
        }
        return result;
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Interaction failed' };
      }
    },
  );

  // Recording — start (periodic screenshots at ~2 FPS)
  ipcMain.handle(IpcChannels.appControl.recordStart, async (): Promise<boolean> => {
    if (recordingState.active) return false;
    const started = await execRenderer<boolean>('window.__appControl?.recordStart() ?? false');
    if (!started) return false;

    recordingState.active = true;
    recordingState.startedAt = new Date().toISOString();
    recordingState.frames = [];
    await captureRecordingFrame();
    recordingState.interval = setInterval(() => {
      void captureRecordingFrame();
    }, 500);
    return true;
  });

  // Recording — stop (encode frames to MP4 video)
  ipcMain.handle(IpcChannels.appControl.recordStop, async (): Promise<AppRecordingResult | null> => {
    if (!recordingState.active) return null;
    if (recordingState.interval) { clearInterval(recordingState.interval); recordingState.interval = null; }
    await captureRecordingFrame();
    await execRenderer<boolean>('window.__appControl?.recordStop() ?? false');

    const frames = [...recordingState.frames];
    recordingState.active = false;
    recordingState.startedAt = null;
    recordingState.frames = [];
    if (frames.length === 0) return null;

    try {
      const result = await encodeFramesToMp4({ frames, fps: 2 });
      return {
        path: result.path,
        isVideo: result.isVideo,
        durationMs: result.durationMs,
        frameCount: result.frameCount,
      };
    } catch (err) {
      console.error('[app-control] Record encode failed:', err);
      return null;
    }
  });

  // Recording — status
  ipcMain.handle(IpcChannels.appControl.recordStatus, async (): Promise<AppRecordingStatus> => {
    if (!recordingState.active) return { recording: false };
    return {
      recording: true,
      startedAt: recordingState.startedAt ?? undefined,
      durationMs: recordingState.startedAt ? Date.now() - new Date(recordingState.startedAt).getTime() : undefined,
    };
  });
}
