import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getAllWindows: vi.fn(() => [] as unknown[]) }));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: mocks.getAllWindows },
}));

import {
  appWindow,
  appWindows,
  closeAuxiliaryWindows,
  isAuxiliaryWindow,
  markAuxiliaryWindow,
} from '@electron/shared/auxiliary-window';

interface FakeWindow {
  isDestroyed: () => boolean;
  destroy: ReturnType<typeof vi.fn>;
}

function fakeWindow(): FakeWindow {
  return { isDestroyed: () => false, destroy: vi.fn() };
}

describe('auxiliary windows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports only Sero own windows, whatever order Electron returns', () => {
    const capture = fakeWindow();
    const main = fakeWindow();
    markAuxiliaryWindow(capture as never);
    // The capture window first: the order Electron uses is not promised.
    mocks.getAllWindows.mockReturnValue([capture, main]);

    expect(appWindows()).toEqual([main]);
    expect(appWindow()).toBe(main);
    expect(isAuxiliaryWindow(capture as never)).toBe(true);
    expect(isAuxiliaryWindow(main as never)).toBe(false);
  });

  it('has no app window while Sero is closed, even if a capture is running', () => {
    const capture = fakeWindow();
    markAuxiliaryWindow(capture as never);
    mocks.getAllWindows.mockReturnValue([capture]);

    expect(appWindow()).toBeNull();
  });

  it('destroys the auxiliary windows and leaves Sero own window alone', () => {
    const old = fakeWindow();
    const capture = fakeWindow();
    const closed = { isDestroyed: () => true, destroy: vi.fn() };
    markAuxiliaryWindow(capture as never);
    markAuxiliaryWindow(closed as never);
    mocks.getAllWindows.mockReturnValue([old, capture, closed]);

    closeAuxiliaryWindows();

    expect(capture.destroy).toHaveBeenCalled();
    expect(closed.destroy).not.toHaveBeenCalled();
    expect(old.destroy).not.toHaveBeenCalled();
  });
});
