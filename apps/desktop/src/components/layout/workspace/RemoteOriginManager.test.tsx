// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceInfo } from '@/types/ipc';
import { RemoteOriginManager } from './RemoteOriginManager';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const seroBridge = {
  vcs: {
    remotes: vi.fn(),
    addRemote: vi.fn(),
    setRemoteUrl: vi.fn(),
  },
  github: {
    status: vi.fn(),
    createRepo: vi.fn(),
  },
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');
const workspace: WorkspaceInfo = {
  id: 'workspace-1',
  name: 'Workspace 1',
  path: '/tmp/workspace-1',
  open: true,
  container: false,
  references: [],
  mounts: [],
  roots: [],
};

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button as HTMLButtonElement;
}

describe('RemoteOriginManager', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    seroBridge.vcs.remotes.mockRejectedValue(new Error('remote lookup failed'));

    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: seroBridge,
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

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  it('shows origin-load failures instead of treating them as no origin', async () => {
    await act(async () => {
      root?.render(
        <RemoteOriginManager
          open
          onOpenChange={vi.fn()}
          workspace={workspace}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Couldn't load remote origin");
      expect(document.body.textContent).toContain('remote lookup failed');
    });

    await act(async () => {
      findButton('Retry').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(seroBridge.vcs.remotes).toHaveBeenCalledTimes(2);
    });
  });
});
