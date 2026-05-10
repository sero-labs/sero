// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContainerRuntimeNotice } from './ContainerRuntimeNotice';
import type { OnboardingContainerRuntime } from '@/types/ipc';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const shellBridge = {
  openExternal: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function renderNotice(runtime: OnboardingContainerRuntime) {
  return <ContainerRuntimeNotice runtime={runtime} />;
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button;
}

describe('ContainerRuntimeNotice', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: {
        shell: shellBridge,
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

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  it('opens setup instructions when the CTA is clicked', async () => {
    await act(async () => {
      root?.render(renderNotice({
        status: 'missing_binary',
        message: 'Install Apple containers.',
        recommended: true,
        docsUrl: 'https://github.com/sero-labs/sero/blob/main/docs/guides/macos-containers.md',
      }));
    });

    await act(async () => {
      findButton('Set up runtime').click();
    });

    expect(shellBridge.openExternal).toHaveBeenCalledWith(
      'https://github.com/sero-labs/sero/blob/main/docs/guides/macos-containers.md',
    );
    expect(document.body.textContent).toContain('Docker remains the most isolated runtime on Windows and Linux');
    expect(document.body.textContent).toContain('Windows Host requires WSL 2');
  });

  it('renders nothing when containers are available', async () => {
    await act(async () => {
      root?.render(renderNotice({
        status: 'available',
        message: 'Apple containers are available.',
        recommended: true,
      }));
    });

    expect(document.body.textContent).not.toContain('Workspace runtime setup recommended for full Sero features');
  });
});
