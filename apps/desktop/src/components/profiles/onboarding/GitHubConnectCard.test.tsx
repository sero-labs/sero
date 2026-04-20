// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubConnectCard } from './GitHubConnectCard';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button;
}

describe('GitHubConnectCard', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('shows contextual onboarding copy with a retry path and no inline device-flow instructions', async () => {
    const onConnect = vi.fn();

    await act(async () => {
      root?.render(
        <GitHubConnectCard
          authStatus={{ authenticated: false }}
          statusReady
          lastOutcome={{ outcome: 'cancelled', status: { authenticated: false } }}
          onConnect={onConnect}
        />,
      );
    });

    expect(container.textContent).toContain('Connect GitHub');
    expect(container.textContent).toContain('continue setup without it');
    expect(container.textContent).toContain('Try again');
    expect(container.textContent).not.toContain('Explorer');
    expect(container.textContent).not.toContain('github.com/login/device');

    await act(async () => {
      findButton('Try again').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows a connected state that points users back to the existing continue action', async () => {
    await act(async () => {
      root?.render(
        <GitHubConnectCard
          authStatus={{ authenticated: true, username: 'octocat' }}
          statusReady
          lastOutcome={null}
          onConnect={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Connected as octocat');
    expect(container.textContent).toContain("Continue to memory setup when you're ready.");
    expect(container.textContent).not.toContain('Try again');
  });
});
