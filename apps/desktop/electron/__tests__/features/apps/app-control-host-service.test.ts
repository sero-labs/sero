import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const executeJavaScript = vi.fn();
  const captureRegion = vi.fn();
  const encodeFramesToMp4 = vi.fn();
  const capturePage = vi.fn();

  return {
    executeJavaScript,
    captureRegion,
    encodeFramesToMp4,
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
}));

vi.mock('@electron/shared/media/video-encoder', () => ({
  encodeFramesToMp4: mocks.encodeFramesToMp4,
}));

describe('appControlHostService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
});
