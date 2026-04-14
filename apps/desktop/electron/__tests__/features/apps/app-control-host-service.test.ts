import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const executeJavaScript = vi.fn();
  const captureRegion = vi.fn();
  const encodeFramesToMp4 = vi.fn();

  return {
    executeJavaScript,
    captureRegion,
    encodeFramesToMp4,
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
});
