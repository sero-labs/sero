import type { BrowserWindow } from 'electron';
import { beforeEach, expect, it, vi } from 'vitest';
import { captureRegion } from '../../../shared/media/capture';

vi.mock('electron', () => ({ screen: { getDisplayMatching: () => ({ scaleFactor: 1 }) } }));
beforeEach(() => vi.clearAllMocks());

function windowForCapture(throttled = true) {
  const image = { getSize: () => ({ width: 100, height: 80 }), toPNG: () => Buffer.from('png'), resize: vi.fn() };
  const webContents = {
    executeJavaScript: vi.fn(async (source: string) => source === 'window.devicePixelRatio' ? 1 : undefined),
    getBackgroundThrottling: vi.fn(() => throttled),
    setBackgroundThrottling: vi.fn(),
    capturePage: vi.fn(async () => image),
  };
  const win = { webContents, getBounds: () => ({ x: 0, y: 0, width: 500, height: 400 }), getContentBounds: () => ({ width: 500, height: 400 }), isDestroyed: () => false };
  return { win: win as unknown as BrowserWindow, webContents };
}

it.each([true, false])('restores the previous background paint policy after a capture error (throttled=%s)', async (throttled) => {
  const { win, webContents } = windowForCapture(throttled);
  webContents.capturePage.mockRejectedValueOnce(new Error('capture failed'));
  await expect(captureRegion(win, { x: 0, y: 0, width: 100, height: 80 })).rejects.toThrow('capture failed');
  expect(webContents.setBackgroundThrottling.mock.calls).toEqual([[false], [throttled]]);
});

it('keeps child frames painting until concurrent captures both finish', async () => {
  const { win, webContents } = windowForCapture();
  let finishFirst: () => void = () => undefined;
  let finishSecond: () => void = () => undefined;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const second = new Promise<void>((resolve) => { finishSecond = resolve; });
  const image = { getSize: () => ({ width: 100, height: 80 }), toPNG: () => Buffer.from('png'), resize: vi.fn() };
  webContents.capturePage.mockImplementationOnce(async () => { await first; return image; });
  webContents.capturePage.mockImplementationOnce(async () => { await second; return image; });
  const a = captureRegion(win, { x: 0, y: 0, width: 100, height: 80 });
  const b = captureRegion(win, { x: 0, y: 0, width: 100, height: 80 });
  await vi.waitFor(() => expect(webContents.capturePage).toHaveBeenCalledTimes(2));
  finishFirst();
  await a;
  expect(webContents.setBackgroundThrottling).not.toHaveBeenCalledWith(true);
  finishSecond();
  await b;
  expect(webContents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
});
