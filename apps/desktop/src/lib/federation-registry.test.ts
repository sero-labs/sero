// @vitest-environment jsdom

import { Suspense, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const originalNodeEnv = process.env.NODE_ENV;

const runtimeMocks = vi.hoisted(() => {
  let instance: {
    options: { remotes: Array<Record<string, unknown>> };
    remoteHandler: { removeRemote: (remote: Record<string, unknown>) => void };
  } | null = null;

  return {
    loadRemote: vi.fn(),
    registerRemotes: vi.fn(),
    fetch: vi.fn(),
    getInstance: vi.fn(() => instance),
    setInstance(next: typeof instance) {
      instance = next;
    },
    clearInstance() {
      instance = null;
    },
  };
});

vi.mock('@module-federation/enhanced/runtime', () => ({
  getInstance: runtimeMocks.getInstance,
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
    runtimeMocks.clearInstance();
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
      [{
        name: 'sero_todo',
        entry: 'http://localhost:4101/remoteEntry.js',
        type: 'module',
        entryGlobalName: 'sero_todo',
      }],
      { force: true },
    );
  });

  it('prefers remoteEntryOverride over legacy devPort candidates in development', async () => {
    process.env.NODE_ENV = 'development';
    runtimeMocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      return { ok: url === 'http://127.0.0.1:5193/remoteEntry.js' ? false : true } as Response;
    });

    await preloadFederatedModule(
      'todo',
      'TodoApp',
      4101,
      'http://127.0.0.1:5193/mf-manifest.json',
    );

    expect(runtimeMocks.fetch.mock.calls.map(([input]) => String(input))).toEqual([
      'http://127.0.0.1:5193/remoteEntry.js',
    ]);
    expect(runtimeMocks.registerRemotes).toHaveBeenCalledWith(
      [{ name: 'sero_todo', entry: 'sero-ext://todo/mf-manifest.json' }],
      { force: true },
    );
    expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(1);
  });

  it('prefers remoteEntryOverride over legacy devPort remotes in production', async () => {
    process.env.NODE_ENV = 'production';
    runtimeMocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      return { ok: url === 'http://127.0.0.1:5193/remoteEntry.js' } as Response;
    });

    await preloadFederatedModule(
      'todo',
      'TodoApp',
      4101,
      'http://127.0.0.1:5193/mf-manifest.json',
    );

    expect(runtimeMocks.registerRemotes).toHaveBeenCalledWith(
      [{
        name: 'sero_todo',
        entry: 'http://127.0.0.1:5193/remoteEntry.js',
        type: 'module',
        entryGlobalName: 'sero_todo',
      }],
      { force: true },
    );
    expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(1);
  });

  it('reuses an identical runtime remote registration without re-registering it', async () => {
    process.env.NODE_ENV = 'production';
    runtimeMocks.fetch.mockResolvedValue({ ok: true } as Response);

    const existingRemote = {
      name: 'sero_todo',
      entry: 'http://127.0.0.1:5193/remoteEntry.js?t=same',
      type: 'module',
      entryGlobalName: 'sero_todo',
    };
    const removeRemote = vi.fn();
    runtimeMocks.setInstance({
      options: { remotes: [existingRemote] },
      remoteHandler: { removeRemote },
    });

    await preloadFederatedModule(
      'todo',
      'TodoApp',
      4101,
      'http://127.0.0.1:5193/mf-manifest.json?t=same',
    );

    expect(removeRemote).not.toHaveBeenCalled();
    expect(runtimeMocks.registerRemotes).not.toHaveBeenCalled();
    expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(1);
  });

  it('removes stale runtime remotes before registering refreshed live entries', async () => {
    process.env.NODE_ENV = 'production';
    runtimeMocks.fetch.mockResolvedValue({ ok: true } as Response);

    const existingRemote = {
      name: 'sero_todo',
      entry: 'http://127.0.0.1:5193/remoteEntry.js?t=first',
      type: 'module',
      entryGlobalName: 'sero_todo',
    };
    const removeRemote = vi.fn();
    runtimeMocks.setInstance({
      options: { remotes: [existingRemote] },
      remoteHandler: { removeRemote },
    });

    await preloadFederatedModule(
      'todo',
      'TodoApp',
      4101,
      'http://127.0.0.1:5193/mf-manifest.json?t=second',
    );

    expect(removeRemote).toHaveBeenCalledWith(existingRemote);
    expect(removeRemote.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeMocks.registerRemotes.mock.invocationCallOrder[0],
    );
    expect(runtimeMocks.registerRemotes).toHaveBeenCalledWith(
      [{
        name: 'sero_todo',
        entry: 'http://127.0.0.1:5193/remoteEntry.js?t=second',
        type: 'module',
        entryGlobalName: 'sero_todo',
      }],
      { force: true },
    );
  });

  it('cache-busts manifest overrides into unique remoteEntry URLs', async () => {
    process.env.NODE_ENV = 'production';
    runtimeMocks.fetch.mockResolvedValue({ ok: true } as Response);

    await preloadFederatedModule(
      'todo',
      'TodoApp',
      4101,
      'http://127.0.0.1:5193/mf-manifest.json?t=first',
    );
    invalidateRemote('todo');
    await preloadFederatedModule(
      'todo',
      'TodoApp',
      4101,
      'http://127.0.0.1:5193/mf-manifest.json?t=second',
    );

    expect(runtimeMocks.registerRemotes).toHaveBeenNthCalledWith(
      1,
      [{
        name: 'sero_todo',
        entry: 'http://127.0.0.1:5193/remoteEntry.js?t=first',
        type: 'module',
        entryGlobalName: 'sero_todo',
      }],
      { force: true },
    );
    expect(runtimeMocks.registerRemotes).toHaveBeenNthCalledWith(
      2,
      [{
        name: 'sero_todo',
        entry: 'http://127.0.0.1:5193/remoteEntry.js?t=second',
        type: 'module',
        entryGlobalName: 'sero_todo',
      }],
      { force: true },
    );
    expect(runtimeMocks.loadRemote).toHaveBeenCalledTimes(2);
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
