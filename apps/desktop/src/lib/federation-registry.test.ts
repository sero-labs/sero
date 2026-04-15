// @vitest-environment jsdom

import { Suspense, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const originalNodeEnv = process.env.NODE_ENV;

const runtimeMocks = vi.hoisted(() => ({
  loadRemote: vi.fn(),
  registerRemotes: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@module-federation/enhanced/runtime', () => ({
  loadRemote: runtimeMocks.loadRemote,
  registerRemotes: runtimeMocks.registerRemotes,
}));

import {
  getFederatedComponent,
  invalidateRemote,
  preloadFederatedModule,
  refreshTransientRemote,
} from './federation-registry';

describe('federation registry remote retry behaviour', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    runtimeMocks.loadRemote.mockReset();
    runtimeMocks.registerRemotes.mockReset();
    runtimeMocks.fetch.mockReset();
    runtimeMocks.loadRemote.mockResolvedValue({ default: () => null });
    vi.stubGlobal('fetch', runtimeMocks.fetch);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
    invalidateRemote('todo');
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.clearAllMocks();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('retries a dev remote after clearing a transient fallback cache', async () => {
    let devReachable = false;

    runtimeMocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('http://localhost:4101')) {
        return { ok: devReachable } as Response;
      }
      return { ok: true } as Response;
    });

    await preloadFederatedModule('todo', 'TodoApp', 4101);

    expect(runtimeMocks.registerRemotes).toHaveBeenCalledWith(
      [{ name: 'sero_todo', entry: 'sero-ext://todo/mf-manifest.json' }],
      { force: true },
    );
    expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(1);

    refreshTransientRemote('todo');
    devReachable = true;

    await preloadFederatedModule('todo', 'TodoApp', 4101);

    expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.registerRemotes).toHaveBeenLastCalledWith(
      [{ name: 'sero_todo', entry: 'http://localhost:4101/mf-manifest.json' }],
      { force: true },
    );
  });

  it('retries a failed lazy remote load on the next access without restart', async () => {
    process.env.NODE_ENV = 'production';
    runtimeMocks.fetch.mockResolvedValue({ ok: true } as Response);

    const RecoveredApp = () => createElement('div', null, 'Recovered todo app');
    runtimeMocks.loadRemote
      .mockRejectedValueOnce(new Error('temporary remote outage'))
      .mockResolvedValueOnce({ default: RecoveredApp });

    const FailedComp = getFederatedComponent('todo', 'TodoApp', undefined);
    if (!FailedComp) {
      throw new Error('Expected FailedComp to be available');
    }

    await act(async () => {
      root?.render(
        createElement(
          Suspense,
          { fallback: createElement('div', null, 'Loading…') },
          createElement(FailedComp),
        ),
      );
    });

    await vi.waitFor(() => {
      expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(1);
    });
    expect(container.textContent).toBe('');

    const RetriedComp = getFederatedComponent('todo', 'TodoApp', undefined);
    if (!RetriedComp) {
      throw new Error('Expected RetriedComp to be available');
    }

    await act(async () => {
      root?.render(
        createElement(
          Suspense,
          { fallback: createElement('div', null, 'Loading…') },
          createElement(RetriedComp),
        ),
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Recovered todo app');
    });
    expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(2);
  });
});
