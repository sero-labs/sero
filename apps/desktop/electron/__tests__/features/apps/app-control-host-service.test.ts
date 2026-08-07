import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const executeJavaScript = vi.fn();
  const captureRegion = vi.fn();
  const captureFullWindow = vi.fn();
  const createVideoRecording = vi.fn();
  const appendVideoFrame = vi.fn();
  const finishVideoRecording = vi.fn();
  const discardVideoRecording = vi.fn();
  const videoRecording = {
    timestamps: [] as number[],
    append: appendVideoFrame,
    finish: finishVideoRecording,
    discard: discardVideoRecording,
  };
  const capturePage = vi.fn();

  return {
    executeJavaScript,
    captureRegion,
    captureFullWindow,
    createVideoRecording,
    appendVideoFrame,
    finishVideoRecording,
    discardVideoRecording,
    videoRecording,
    capturePage,
    fakeWindow: {
      webContents: {
        executeJavaScript,
      },
    },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [mocks.fakeWindow],
  },
}));

vi.mock('@electron/features/browser/view-manager', () => ({
  browserViewManager: {
    capturePage: mocks.capturePage,
  },
}));

vi.mock('@electron/shared/media/capture', () => ({
  captureRegion: mocks.captureRegion,
  captureFullWindow: mocks.captureFullWindow,
}));

vi.mock('@electron/shared/media/video-encoder', () => ({
  createVideoRecording: mocks.createVideoRecording,
}));

describe('appControlHostService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.videoRecording.timestamps.length = 0;
    mocks.createVideoRecording.mockResolvedValue(mocks.videoRecording);
    mocks.appendVideoFrame.mockImplementation(async (_base64: string, timestamp: number) => {
      mocks.videoRecording.timestamps.push(timestamp);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the requested app to become active with a visible panel', async () => {
    mocks.executeJavaScript
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('explorer')
      .mockResolvedValueOnce('kanban')
      .mockResolvedValueOnce({ x: 0, y: 0, width: 320, height: 180 });

    const { appControlHostService } = await import('@electron/features/apps/app-control/host-service');
    const opened = await appControlHostService.openAndWait('kanban', {
      requireVisiblePanel: true,
      pollMs: 0,
      timeoutMs: 100,
    });

    expect(opened).toBe(true);
    expect(mocks.executeJavaScript).toHaveBeenNthCalledWith(
      1,
      'window.__appControl?.openApp("kanban") ?? false',
    );
    expect(mocks.executeJavaScript).toHaveBeenNthCalledWith(
      4,
      'window.__appControl?.getAppRect() ?? null',
    );
  });

  it('captures a screenshot after a successful non-inspect interaction', async () => {
    vi.useFakeTimers();
    mocks.executeJavaScript
      .mockResolvedValueOnce({ success: true, message: 'Clicked save' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ x: 10, y: 20, width: 300, height: 200 });
    mocks.captureRegion.mockResolvedValue('base64-image');

    const { appControlHostService } = await import('@electron/features/apps/app-control/host-service');
    const pending = appControlHostService.interact({ action: 'click', selector: '#save' });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(mocks.executeJavaScript).toHaveBeenNthCalledWith(
      1,
      'window.__appControl?.interact({"action":"click","selector":"#save"})',
    );
    expect(mocks.executeJavaScript).toHaveBeenNthCalledWith(
      2,
      'window.__appControl?.getBrowserCaptureTarget?.() ?? null',
    );
    expect(result).toEqual({
      success: true,
      message: 'Clicked save',
      screenshot: 'base64-image',
    });
    expect(mocks.captureRegion).toHaveBeenCalledWith(mocks.fakeWindow, {
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });
  });

  it('captures active browser tabs through the browser view instead of the window', async () => {
    mocks.executeJavaScript.mockResolvedValue({
      workspaceId: 'ws-1',
      tabId: 'tab-1',
      rect: { x: 10, y: 20, width: 300, height: 200 },
    });
    mocks.capturePage.mockResolvedValue('browser-base64');

    const { appControlHostService } = await import('@electron/features/apps/app-control/host-service');
    await expect(appControlHostService.screenshot()).resolves.toBe('browser-base64');

    expect(mocks.capturePage).toHaveBeenCalledWith('tab-1', 'ws-1');
    expect(mocks.captureRegion).not.toHaveBeenCalled();
  });

  it('captures only the requested part inside the active app panel', async () => {
    mocks.executeJavaScript.mockResolvedValue({ x: 100, y: 80, width: 600, height: 400 });
    mocks.captureRegion.mockResolvedValue('cropped-png');

    const { appControlHostService } = await import('@electron/features/apps/app-control/host-service');
    await expect(
      appControlHostService.captureAppRegion({ x: 50, y: 120, width: 800, height: 200 }),
    ).resolves.toBe('cropped-png');

    expect(mocks.captureRegion).toHaveBeenCalledWith(mocks.fakeWindow, {
      x: 100,
      y: 120,
      width: 600,
      height: 200,
    });
  });

  it('refuses a region outside the active app panel', async () => {
    mocks.executeJavaScript.mockResolvedValue({ x: 100, y: 80, width: 600, height: 400 });

    const { appControlHostService } = await import('@electron/features/apps/app-control/host-service');
    await expect(
      appControlHostService.captureAppRegion({ x: 0, y: 0, width: 50, height: 50 }),
    ).resolves.toBeNull();

    expect(mocks.captureRegion).not.toHaveBeenCalled();
  });

  it('records active browser tabs through the browser view instead of the window', async () => {
    mocks.executeJavaScript
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        rect: { x: 10, y: 20, width: 300, height: 200 },
      })
      .mockResolvedValueOnce({
        workspaceId: 'ws-1',
        tabId: 'tab-1',
        rect: { x: 10, y: 20, width: 300, height: 200 },
      })
      .mockResolvedValueOnce(true);
    mocks.capturePage.mockResolvedValue('browser-base64');
    mocks.finishVideoRecording.mockResolvedValue({
      path: '/tmp/recording.mp4',
      isVideo: true,
      durationMs: 1000,
      frameCount: 2,
    });

    const { appControlHostService } = await import('@electron/features/apps/app-control/host-service');
    await expect(appControlHostService.recordStart()).resolves.toBe(true);
    await expect(appControlHostService.recordStop()).resolves.toEqual({
      path: '/tmp/recording.mp4',
      isVideo: true,
      durationMs: 1000,
      frameCount: 2,
    });

    expect(mocks.capturePage).toHaveBeenCalledTimes(2);
    expect(mocks.captureRegion).not.toHaveBeenCalled();
    expect(mocks.createVideoRecording).toHaveBeenCalledWith({ fps: 2, crf: 23 });
    expect(mocks.appendVideoFrame).toHaveBeenCalledTimes(2);
    expect(mocks.appendVideoFrame).toHaveBeenCalledWith(
      'browser-base64',
      expect.any(Number),
    );
    expect(mocks.finishVideoRecording).toHaveBeenCalledWith(undefined);
  });

  it('full-window recording captures the whole window and honours crf + output path', async () => {
    // recordStart's renderer marker resolves true; no browser tab present.
    mocks.executeJavaScript.mockResolvedValue(true);
    mocks.captureFullWindow.mockResolvedValue('window-base64');
    mocks.finishVideoRecording.mockResolvedValue({
      path: '/out/demo.mp4',
      isVideo: true,
      durationMs: 1000,
      frameCount: 1,
    });

    const { appControlHostService } = await import('@electron/features/apps/app-control/host-service');
    await expect(
      appControlHostService.recordStart({ fps: 15, fullWindow: true, crf: 18 }),
    ).resolves.toBe(true);
    await expect(appControlHostService.recordStatus()).resolves.toEqual({
      recording: true,
      ready: true,
      frameCount: 1,
      startedAt: expect.any(String),
      durationMs: expect.any(Number),
    });
    await appControlHostService.recordStop({ outputPath: '/out/demo.mp4' });

    // Full-window path used, never the app-panel region.
    expect(mocks.captureFullWindow).toHaveBeenCalled();
    expect(mocks.captureRegion).not.toHaveBeenCalled();
    expect(mocks.createVideoRecording).toHaveBeenCalledWith({ fps: 15, crf: 18 });
    expect(mocks.finishVideoRecording).toHaveBeenCalledWith('/out/demo.mp4');
  });
});
