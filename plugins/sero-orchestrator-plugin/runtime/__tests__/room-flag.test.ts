/**
 * The Room rollout gate (phase 6).
 *
 * Room mode is on by default. Its emergency kill switch still builds NOTHING:
 * no store, no coordinator, and no tick. The host capability is not even read.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { OrchestratorHost } from '../host';
import { createRoomRuntime, roomModeEnabled } from '../rooms/room-runtime';

/** Reports whether the AD-029 capability was read, which is the first thing a built runtime does. */
function watchedCtx(): { ctx: AppRuntimeContext; capabilityReads: () => number } {
  let reads = 0;
  const host = {
    get persistentSessions() {
      reads += 1;
      return undefined;
    },
  };
  return {
    // Same shape as the coordinator harness: the runtime never gets far enough
    // to use the rest of the context.
    ctx: { stateFilePath: '/nowhere/state.json', workspaceId: 'ws-1', host } as unknown as AppRuntimeContext,
    capabilityReads: () => reads,
  };
}

// The gate returns before the host is touched, so an empty one is never used.
const noHost = {} as OrchestratorHost;

afterEach(() => {
  delete process.env.SERO_ROOMS;
});

describe('the Room rollout gate', () => {
  it('builds nothing when the kill switch is set', () => {
    process.env.SERO_ROOMS = '0';
    const { ctx, capabilityReads } = watchedCtx();
    expect(createRoomRuntime(ctx, noHost)).toBeNull();
    expect(capabilityReads()).toBe(0);
  });

  it('reaches the capability check by default', () => {
    const { ctx, capabilityReads } = watchedCtx();
    // Still null here because this host has no persistent-session capability.
    expect(createRoomRuntime(ctx, noHost)).toBeNull();
    expect(capabilityReads()).toBe(1);
  });

  it('accepts explicit on values and only disables on 0 or false', () => {
    expect(roomModeEnabled({ SERO_ROOMS: '1' })).toBe(true);
    expect(roomModeEnabled({ SERO_ROOMS: ' True ' })).toBe(true);
    expect(roomModeEnabled({ SERO_ROOMS: '0' })).toBe(false);
    expect(roomModeEnabled({ SERO_ROOMS: ' false ' })).toBe(false);
    expect(roomModeEnabled({ SERO_ROOMS: 'preview' })).toBe(true);
    expect(roomModeEnabled({})).toBe(true);
  });
});
