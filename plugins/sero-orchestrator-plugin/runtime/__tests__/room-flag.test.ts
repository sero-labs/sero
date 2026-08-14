/**
 * The Room rollout gate (phase 6).
 *
 * Room mode ships dark, so the property under test is not that the flag parses
 * but that a switched-off Sero builds NOTHING: no store, no coordinator, no
 * tick — the host capability is not even looked at.
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
  it('builds nothing while it is off', () => {
    const { ctx, capabilityReads } = watchedCtx();
    expect(createRoomRuntime(ctx, noHost)).toBeNull();
    expect(capabilityReads()).toBe(0);
  });

  it('reaches the capability check once it is on', () => {
    process.env.SERO_ROOMS = '1';
    const { ctx, capabilityReads } = watchedCtx();
    // Still null here — this host has no persistent sessions — but the gate let
    // it through, which is what separates "switched off" from "unsupported".
    expect(createRoomRuntime(ctx, noHost)).toBeNull();
    expect(capabilityReads()).toBe(1);
  });

  it('takes 1 or true, and nothing else', () => {
    expect(roomModeEnabled({ SERO_ROOMS: '1' })).toBe(true);
    expect(roomModeEnabled({ SERO_ROOMS: ' True ' })).toBe(true);
    expect(roomModeEnabled({ SERO_ROOMS: '0' })).toBe(false);
    expect(roomModeEnabled({})).toBe(false);
  });
});
