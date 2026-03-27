import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  invalidateRemote,
  preloadFederatedModule,
  refreshTransientRemote,
} from './federation-registry';

describe('federation registry remote retry behaviour', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    runtimeMocks.loadRemote.mockReset();
    runtimeMocks.registerRemotes.mockReset();
    runtimeMocks.fetch.mockReset();
    runtimeMocks.loadRemote.mockResolvedValue({ default: () => null });
    vi.stubGlobal('fetch', runtimeMocks.fetch);
  });

  afterEach(() => {
    invalidateRemote('todo');
    vi.unstubAllGlobals();
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
});
