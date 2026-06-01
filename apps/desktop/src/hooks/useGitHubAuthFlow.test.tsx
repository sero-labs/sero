// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn<(text: string) => Promise<boolean>>(),
}));

vi.mock('@/lib/copy-to-clipboard', () => ({
  copyTextToClipboard,
}));

import { resetGitHubAuthStore } from '@/stores/github-auth';
import { useGitHubAuthFlow } from './useGitHubAuthFlow';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const githubBridge = {
  status: vi.fn(),
  onEvent: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  cancel: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button;
}

function HookProbe() {
  const { copied, copyFailed, statusReady, copyCode } = useGitHubAuthFlow();

  return (
    <div
      data-ready={statusReady ? 'true' : 'false'}
      data-copied={copied ? 'true' : 'false'}
      data-copy-failed={copyFailed ? 'true' : 'false'}
    >
      <button type="button" onClick={() => void copyCode('ABCD-1234')}>Copy</button>
    </div>
  );
}

describe('useGitHubAuthFlow', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetGitHubAuthStore();
    githubBridge.status.mockResolvedValue({ authenticated: false });
    githubBridge.onEvent.mockReturnValue(vi.fn());

    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: {
        github: githubBridge,
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();

    resetGitHubAuthStore();

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }

    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it('uses one transient helper for successful copy feedback', async () => {
    copyTextToClipboard.mockResolvedValue(true);

    await act(async () => {
      root?.render(<HookProbe />);
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-ready')).toBe('true');
    });

    await act(async () => {
      findButton('Copy').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.firstElementChild?.getAttribute('data-copied')).toBe('true');
    expect(container.firstElementChild?.getAttribute('data-copy-failed')).toBe('false');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(container.firstElementChild?.getAttribute('data-copied')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-copy-failed')).toBe('false');
  });

  it('uses the same transient helper for failed copy feedback', async () => {
    copyTextToClipboard.mockResolvedValue(false);

    await act(async () => {
      root?.render(<HookProbe />);
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-ready')).toBe('true');
    });

    await act(async () => {
      findButton('Copy').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.firstElementChild?.getAttribute('data-copied')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-copy-failed')).toBe('true');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(container.firstElementChild?.getAttribute('data-copied')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-copy-failed')).toBe('false');
  });
});
