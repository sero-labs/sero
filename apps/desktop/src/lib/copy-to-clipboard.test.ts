// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './copy-to-clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    window.sero = undefined as unknown as typeof window.sero;
    vi.restoreAllMocks();
  });

  it('uses the Electron clipboard bridge when available', async () => {
    window.sero = {
      clipboard: { writeText: vi.fn().mockResolvedValue(true) },
    } as unknown as typeof window.sero;

    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(window.sero.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('uses navigator.clipboard when the Electron bridge is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when clipboard.writeText fails', async () => {
    window.sero = undefined as unknown as typeof window.sero;
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard('fallback')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
