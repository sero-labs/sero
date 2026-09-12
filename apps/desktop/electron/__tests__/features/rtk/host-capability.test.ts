import { describe, expect, it, vi } from 'vitest';

import type { EventBus } from '@earendil-works/pi-coding-agent';
import { RTK_TOOLCHAIN_EVENT, type RtkToolchainRequest, type RtkToolchainResolution } from '@sero-ai/common';
import {
  registerRtkHostCapability,
  type RtkResolutionSource,
} from '@electron/features/rtk/host-capability';
import type { RtkRuntimePort } from '@electron/features/rtk/service';

const SESSION = 'session-1';

const runtime: RtkRuntimePort = {
  backend: 'docker',
  workspaceId: 'ws-1',
  ensure: async () => ({ containerId: 'container-1' }),
  exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
};

function fakeEventBus(): { events: EventBus; emit: (data: unknown) => void } {
  const handlers: Array<(data: unknown) => void> = [];
  return {
    events: {
      emit: () => undefined,
      on: (channel, handler) => {
        expect(channel).toBe(RTK_TOOLCHAIN_EVENT);
        handlers.push(handler);
        return () => undefined;
      },
    },
    emit: (data) => {
      for (const handler of handlers) handler(data);
    },
  };
}

function request(sessionId: string): {
  request: RtkToolchainRequest;
  accepted: () => boolean;
  settled: () => Promise<RtkToolchainResolution | undefined>;
} {
  let accepted = false;
  let resolved: RtkToolchainResolution | undefined;
  let settle: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => { settle = resolve; });
  return {
    request: {
      sessionId,
      workspaceId: 'ws-1',
      accept: () => { accepted = true; },
      resolve: (value) => { resolved = value; settle(); },
    },
    accepted: () => accepted,
    settled: async () => {
      await settled;
      return resolved;
    },
  };
}

describe('registerRtkHostCapability', () => {
  it('answers an available resolution for the session that owns the bus', async () => {
    const bus = fakeEventBus();
    const source: RtkResolutionSource = {
      resolve: vi.fn(async () => ({ state: 'available' as const, version: '0.49.0' })),
    };
    registerRtkHostCapability(bus.events, { sessionId: SESSION, runtime }, source);

    const pending = request(SESSION);
    bus.emit(pending.request);

    expect(pending.accepted()).toBe(true);
    await expect(pending.settled()).resolves.toEqual({ state: 'available', version: '0.49.0' });
    expect(source.resolve).toHaveBeenCalledWith({ sessionId: SESSION, runtime });
  });

  it('refuses a request that names another session without resolving through the service', async () => {
    const bus = fakeEventBus();
    const source: RtkResolutionSource = { resolve: vi.fn() };
    registerRtkHostCapability(bus.events, { sessionId: SESSION, runtime }, source);

    const pending = request('other-session');
    bus.emit(pending.request);

    await expect(pending.settled()).resolves.toMatchObject({ state: 'failed' });
    expect(source.resolve).not.toHaveBeenCalled();
  });

  it('refuses a request with no session id', async () => {
    const bus = fakeEventBus();
    registerRtkHostCapability(bus.events, { sessionId: SESSION, runtime }, { resolve: vi.fn() });

    const pending = request('');
    bus.emit(pending.request);

    await expect(pending.settled()).resolves.toMatchObject({ state: 'failed' });
  });

  it('answers failed instead of rejecting when the service throws', async () => {
    const bus = fakeEventBus();
    const source: RtkResolutionSource = { resolve: vi.fn(async () => { throw new Error('boom'); }) };
    registerRtkHostCapability(bus.events, { sessionId: SESSION, runtime }, source);

    const pending = request(SESSION);
    bus.emit(pending.request);

    await expect(pending.settled()).resolves.toEqual({ state: 'failed', reason: 'boom' });
  });

  it('ignores malformed payloads and payloads without accept/resolve', () => {
    const bus = fakeEventBus();
    registerRtkHostCapability(bus.events, { sessionId: SESSION, runtime }, { resolve: vi.fn() });

    expect(() => bus.emit(undefined)).not.toThrow();
    expect(() => bus.emit({ sessionId: SESSION })).not.toThrow();
    expect(() => bus.emit('not-a-request')).not.toThrow();
  });
});
