import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureRegion } from '../../../shared/media/capture';

const createFromBuffer = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({
  screen: { getDisplayMatching: () => ({ scaleFactor: 1 }) },
  nativeImage: { createFromBuffer },
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

function windowForCapture(throttled = true) {
  const image = { getSize: () => ({ width: 100, height: 80 }), isEmpty: () => false, toPNG: () => Buffer.from('png'), resize: vi.fn() };
  createFromBuffer.mockReturnValue(image);
  let attached = false;
  const debuggerApi = {
    isAttached: vi.fn(() => attached),
    attach: vi.fn(() => { attached = true; }),
    detach: vi.fn(() => { attached = false; }),
    once: vi.fn(), removeListener: vi.fn(),
    sendCommand: vi.fn(async () => ({ data: Buffer.from('png').toString('base64') })),
  };
  const webContents = {
    executeJavaScript: vi.fn(async (source: string): Promise<number | undefined> => source === 'window.devicePixelRatio' ? 1 : undefined),
    getBackgroundThrottling: vi.fn(() => throttled),
    setBackgroundThrottling: vi.fn(),
    capturePage: vi.fn(async () => image),
    debugger: debuggerApi,
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

it('recovers a stalled native capture and avoids accumulating more stalled calls', async () => {
  vi.useFakeTimers();
  const { win, webContents } = windowForCapture();
  webContents.executeJavaScript.mockImplementation(async (source: string) => source === 'window.devicePixelRatio' ? 2 : undefined);
  webContents.capturePage.mockImplementationOnce(() => new Promise(() => undefined));
  const first = captureRegion(win, { x: 10, y: 20, width: 100, height: 80 });
  await vi.advanceTimersByTimeAsync(2_000);
  await expect(first).resolves.toBe(Buffer.from('png').toString('base64'));
  expect(webContents.capturePage).toHaveBeenCalledWith({ x: 20, y: 40, width: 200, height: 160 });
  expect(webContents.debugger.sendCommand).toHaveBeenCalledWith('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
    clip: { x: 10, y: 20, width: 100, height: 80, scale: 1 },
  });
  expect(webContents.debugger.detach).toHaveBeenCalledOnce();
  await captureRegion(win, { x: 10, y: 20, width: 100, height: 80 });
  expect(webContents.capturePage).toHaveBeenCalledOnce();
  expect(webContents.debugger.sendCommand).toHaveBeenCalledTimes(2);
});

it('preserves an existing debugger attachment when fallback capture fails', async () => {
  vi.useFakeTimers();
  const { win, webContents } = windowForCapture();
  webContents.capturePage.mockImplementationOnce(() => new Promise(() => undefined));
  webContents.debugger.isAttached.mockReturnValue(true);
  webContents.debugger.sendCommand.mockRejectedValueOnce(new Error('capture rejected'));
  const pending = expect(captureRegion(win, { x: 0, y: 0, width: 100, height: 80 })).rejects.toThrow('capture rejected');
  await vi.advanceTimersByTimeAsync(2_000);
  await pending;
  expect(webContents.debugger.attach).not.toHaveBeenCalled();
  expect(webContents.debugger.detach).not.toHaveBeenCalled();
  expect(webContents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
});

it('bounds a stalled fallback and releases the debugger and paint policy', async () => {
  vi.useFakeTimers();
  const { win, webContents } = windowForCapture();
  webContents.capturePage.mockImplementationOnce(() => new Promise(() => undefined));
  webContents.debugger.sendCommand.mockImplementationOnce(() => new Promise(() => undefined));
  const pending = expect(captureRegion(win, { x: 0, y: 0, width: 100, height: 80 })).rejects.toThrow('Screenshot capture timed out');
  await vi.advanceTimersByTimeAsync(4_000);
  await pending;
  expect(webContents.debugger.detach).toHaveBeenCalledOnce();
  expect(webContents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
});

it('keeps child frames painting until concurrent captures both finish', async () => {
  const { win, webContents } = windowForCapture();
  let finishFirst: () => void = () => undefined;
  let finishSecond: () => void = () => undefined;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const second = new Promise<void>((resolve) => { finishSecond = resolve; });
  const image = { getSize: () => ({ width: 100, height: 80 }), isEmpty: () => false, toPNG: () => Buffer.from('png'), resize: vi.fn() };
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
