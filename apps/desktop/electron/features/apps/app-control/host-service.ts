import { BrowserWindow } from 'electron';
import { browserViewManager } from '@electron/features/browser/view-manager';
import { captureRegion } from '@electron/shared/media/capture';
import { encodeFramesToMp4 } from '@electron/shared/media/video-encoder';
import type {
  AppControlEntry,
  AppFullScreenshotTarget,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingResult,
  AppRecordingStatus,
} from '@/types/ipc';

const INTERACTION_SETTLE_MS = 200;
const RECORDING_FRAME_INTERVAL_MS = 500;
const APP_OPEN_READY_TIMEOUT_MS = 1_500;
const APP_OPEN_READY_POLL_MS = 50;

interface RecordingFrame {
  timestamp: number;
  base64: string;
}

interface RecordingState {
  active: boolean;
  startedAt: string | null;
  frames: RecordingFrame[];
  interval: ReturnType<typeof setInterval> | null;
}

interface OpenAndWaitOptions {
  requireVisiblePanel?: boolean;
  timeoutMs?: number;
  pollMs?: number;
}

interface BrowserCaptureTarget {
  workspaceId: string;
  tabId: string;
  rect: AppPanelRect;
}

const recordingState: RecordingState = {
  active: false,
  startedAt: null,
  frames: [],
  interval: null,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

async function execRenderer<T>(code: string): Promise<T> {
  const win = getMainWindow();
  if (!win) throw new Error('No main window available');
  return win.webContents.executeJavaScript(code) as Promise<T>;
}

async function captureRect(rect: AppPanelRect): Promise<string | null> {
  const win = getMainWindow();
  if (!win) return null;
  return captureRegion(win, rect);
}

async function getBrowserCaptureTarget(): Promise<BrowserCaptureTarget | null> {
  return execRenderer<BrowserCaptureTarget | null>(
    'window.__appControl?.getBrowserCaptureTarget?.() ?? null',
  );
}

async function prepareFullScreenshotTarget(selector?: string): Promise<AppFullScreenshotTarget | null> {
  return execRenderer<AppFullScreenshotTarget | null>(
    `window.__appControl?.prepareFullScreenshot?.(${JSON.stringify(selector)}) ?? null`,
  );
}

async function setFullScreenshotScroll(ref: string, scrollTop: number): Promise<boolean> {
  return execRenderer<boolean>(
    `window.__appControl?.setFullScreenshotScroll?.(${JSON.stringify(ref)}, ${JSON.stringify(scrollTop)}) ?? false`,
  );
}

async function restoreFullScreenshotScroll(ref: string, scrollTop: number, scrollLeft: number): Promise<boolean> {
  return execRenderer<boolean>(
    `window.__appControl?.restoreFullScreenshotScroll?.(${JSON.stringify(ref)}, ${JSON.stringify(scrollTop)}, ${JSON.stringify(scrollLeft)}) ?? false`,
  );
}

async function stitchFullScreenshot(
  target: AppFullScreenshotTarget,
  pieces: Array<{ y: number; dataUrl: string }>,
): Promise<string> {
  return execRenderer<string>(
    `window.__appControl?.stitchFullScreenshot?.(${JSON.stringify(target)}, ${JSON.stringify(pieces)})`,
  );
}

function hasVisibleRect(rect: AppPanelRect | null): rect is AppPanelRect {
  return !!rect && rect.width > 0 && rect.height > 0;
}

function finiteRect(rect: AppPanelRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0;
}

async function captureRecordingFrame(): Promise<void> {
  try {
    const capture = await appControlHostService.captureVisibleApp();
    if (capture?.base64) {
      recordingState.frames.push({ timestamp: Date.now(), base64: capture.base64 });
    }
  } catch {
    // Skip frame capture failures during recording.
  }
}

export const appControlHostService = {
  async list(): Promise<AppControlEntry[]> {
    return execRenderer<AppControlEntry[]>('window.__appControl?.getList() ?? []');
  },

  async active(): Promise<string> {
    return execRenderer<string>('window.__appControl?.getActive() ?? "explorer"');
  },

  async open(appId: string): Promise<boolean> {
    return execRenderer<boolean>(`window.__appControl?.openApp(${JSON.stringify(appId)}) ?? false`);
  },

  async openAndWait(appId: string, options: OpenAndWaitOptions = {}): Promise<boolean> {
    const opened = await this.open(appId);
    if (!opened) return false;

    const timeoutMs = options.timeoutMs ?? APP_OPEN_READY_TIMEOUT_MS;
    const pollMs = options.pollMs ?? APP_OPEN_READY_POLL_MS;
    const startedAt = Date.now();

    const poll = async (): Promise<boolean> => {
      if (Date.now() - startedAt >= timeoutMs) return false;

      const active = await this.active().catch(() => null);
      if (active === appId) {
        if (!options.requireVisiblePanel) return true;
        const rect = await this.getAppRect().catch(() => null);
        if (hasVisibleRect(rect)) return true;
      }
      await sleep(pollMs);
      return poll();
    };

    return poll();
  },

  async info(appId: string): Promise<AppControlEntry | null> {
    return execRenderer<AppControlEntry | null>(`window.__appControl?.getInfo(${JSON.stringify(appId)}) ?? null`);
  },

  async openFile(workspaceId: string, filePath: string): Promise<boolean> {
    return execRenderer<boolean>(
      `window.__appControl?.openFile(${JSON.stringify(workspaceId)}, ${JSON.stringify(filePath)}) ?? false`,
    );
  },

  async showBrowserPanel(): Promise<boolean> {
    return execRenderer<boolean>('window.__appControl?.showBrowserPanel?.() ?? false');
  },

  async getAppRect(): Promise<AppPanelRect | null> {
    return execRenderer<AppPanelRect | null>('window.__appControl?.getAppRect() ?? null');
  },

  async captureVisibleApp(): Promise<{ base64: string; rect: AppPanelRect } | null> {
    const browserTarget = await getBrowserCaptureTarget().catch(() => null);
    if (browserTarget && hasVisibleRect(browserTarget.rect)) {
      const base64 = await browserViewManager.capturePage(browserTarget.tabId, browserTarget.workspaceId);
      if (base64) return { base64, rect: browserTarget.rect };
    }

    const rect = await this.getAppRect();
    if (!hasVisibleRect(rect)) return null;
    const base64 = await captureRect(rect);
    if (!base64) return null;
    return { base64, rect };
  },

  async screenshot(): Promise<string | null> {
    const capture = await this.captureVisibleApp();
    return capture?.base64 ?? null;
  },

  /** Capture only a visible window-relative region inside the active app panel. */
  async captureAppRegion(rect: AppPanelRect): Promise<string | null> {
    if (!finiteRect(rect)) return null;
    const panel = await this.getAppRect();
    if (!hasVisibleRect(panel)) return null;

    const left = Math.max(panel.x, rect.x);
    const top = Math.max(panel.y, rect.y);
    const right = Math.min(panel.x + panel.width, rect.x + rect.width);
    const bottom = Math.min(panel.y + panel.height, rect.y + rect.height);
    if (right <= left || bottom <= top) return null;
    return captureRect({ x: left, y: top, width: right - left, height: bottom - top });
  },

  async fullScreenshot(selector?: string): Promise<{ base64: string; target: AppFullScreenshotTarget } | null> {
    const appRect = await this.getAppRect();
    if (!hasVisibleRect(appRect)) return null;
    const target = await prepareFullScreenshotTarget(selector);
    if (!target) return null;

    const pieces: Array<{ y: number; dataUrl: string }> = [];
    const captureRectForTarget = {
      x: appRect.x + target.rect.x,
      y: appRect.y + target.rect.y,
      width: Math.min(target.clientWidth, target.rect.width),
      height: Math.min(target.clientHeight, target.rect.height),
    };

    try {
      for (const position of target.positions) {
        await setFullScreenshotScroll(target.ref, position);
        await sleep(80);
        const base64 = await captureRect(captureRectForTarget);
        if (!base64) return null;
        pieces.push({ y: position, dataUrl: `data:image/png;base64,${base64}` });
      }
      const base64 = pieces.length === 1 && target.scrollHeight <= target.clientHeight
        ? pieces[0]!.dataUrl.replace(/^data:image\/png;base64,/, '')
        : await stitchFullScreenshot(target, pieces);
      return { base64, target };
    } finally {
      await restoreFullScreenshotScroll(target.ref, target.scrollTop, target.scrollLeft).catch(() => false);
    }
  },

  async interact(params: AppInteractionParams): Promise<AppInteractionResult> {
    try {
      const result = await execRenderer<AppInteractionResult>(
        `window.__appControl?.interact(${JSON.stringify(params)})`,
      );

      if (params.action !== 'inspect' && params.captureAfter !== false && result.success) {
        await sleep(INTERACTION_SETTLE_MS);
        const screenshot = await this.screenshot();
        if (screenshot) result.screenshot = screenshot;
      }
      return result;
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Interaction failed' };
    }
  },

  async openDevPreview(url: string): Promise<boolean> {
    return execRenderer<boolean>(
      `window.__appControl?.openDevPreview(${JSON.stringify(url)}) ?? false`,
    );
  },

  async recordStart(): Promise<boolean> {
    if (recordingState.active) return false;
    const started = await execRenderer<boolean>('window.__appControl?.recordStart() ?? false');
    if (!started) return false;

    recordingState.active = true;
    recordingState.startedAt = new Date().toISOString();
    recordingState.frames = [];
    await captureRecordingFrame();
    recordingState.interval = setInterval(() => {
      void captureRecordingFrame();
    }, RECORDING_FRAME_INTERVAL_MS);
    return true;
  },

  async recordStop(): Promise<AppRecordingResult | null> {
    if (!recordingState.active) return null;
    if (recordingState.interval) {
      clearInterval(recordingState.interval);
      recordingState.interval = null;
    }
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
  },

  async recordStatus(): Promise<AppRecordingStatus> {
    if (!recordingState.active) return { recording: false };
    return {
      recording: true,
      startedAt: recordingState.startedAt ?? undefined,
      durationMs: recordingState.startedAt
        ? Date.now() - new Date(recordingState.startedAt).getTime()
        : undefined,
    };
  },
};
