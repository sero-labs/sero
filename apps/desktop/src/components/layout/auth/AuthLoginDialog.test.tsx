// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthLoginDialog } from './AuthLoginDialog';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const authBridge = {
  getProviders: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  setApiKey: vi.fn(),
  removeApiKey: vi.fn(),
  respondPrompt: vi.fn(),
  respondManualCode: vi.fn(),
  cancel: vi.fn(),
  onEvent: vi.fn(() => () => {}),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button as HTMLButtonElement;
}

describe('AuthLoginDialog', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    authBridge.getProviders.mockRejectedValue(new Error('provider registry unavailable'));

    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: {
        auth: authBridge,
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

  it('shows provider-load failures instead of silently rendering an empty list', async () => {
    await act(async () => {
      root?.render(<AuthLoginDialog open onOpenChange={vi.fn()} />);
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Couldn't load auth providers");
      expect(document.body.textContent).toContain('provider registry unavailable');
    });

    await act(async () => {
      findButton('Retry').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(authBridge.getProviders).toHaveBeenCalledTimes(2);
    });
  });
});
