/**
 * The `rooms` tool boundary.
 *
 * The tool holds one rule of its own — a Room member never reaches the user's
 * controls — and otherwise only turns flat parameters into a call. Both halves
 * are checked here against a recording stub, so a parameter that stops being
 * passed through fails a test rather than silently doing nothing.
 */

import { describe, expect, it } from 'vitest';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { RoomAppActions } from '../../runtime/rooms/room-app-actions';
import { executeRoomAppTool, type RoomAppToolParamsShape } from '../room-app';

type Call = { method: string; args: unknown[] };

function stubApp(): { app: RoomAppActions; calls: Call[] } {
  const calls: Call[] = [];
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return Promise.resolve({ ok: true as const });
  };
  const app = {
    prepare: (...args: unknown[]) => {
      calls.push({ method: 'prepare', args });
      return Promise.resolve({
        ok: true as const,
        roomId: 'room-1',
        proposal: { teamSize: 3, maxWallClockMs: 1_800_000, maxCostUsd: 5 },
        clamps: [],
      });
    },
    adjust: record('adjust'),
    start: record('start'),
    pause: record('pause'),
    resume: record('resume'),
    cancel: record('cancel'),
    remove: record('remove'),
    resolveApproval: record('resolveApproval'),
    intervene: record('intervene'),
    wake: record('wake'),
  } as unknown as RoomAppActions;
  return { app, calls };
}

const ctx = { cwd: '/work/repo', sessionManager: {} } as unknown as ExtensionContext;

/** A real chat: it has a session file on disk, so its result can come back to it. */
const chatCtx = {
  cwd: '/work/repo',
  sessionManager: {
    getSessionFile: () => '/sessions/chat-9.jsonl',
    getSessionId: () => 'chat-9',
  },
} as unknown as ExtensionContext;

const notAMember = () => Promise.resolve(undefined);

const runTool = (
  params: RoomAppToolParamsShape,
  app: RoomAppActions,
  caller: () => Promise<unknown> = notAMember,
) => executeRoomAppTool(params, ctx, () => app, caller);

describe('the rooms tool', () => {
  it('refuses a Room member, whatever it asks for', async () => {
    const { app, calls } = stubApp();
    const asMember = () => Promise.resolve({ owns: () => true });
    const result = await runTool({ action: 'cancel', roomId: 'room-1' }, app, asMember);

    expect(result.details.ok).toBe(false);
    expect(result.text).toContain('user\'s Room control surface');
    // Refused before anything ran, not after.
    expect(calls).toEqual([]);
  });

  it('says so when Room mode is not running here', async () => {
    const result = await executeRoomAppTool({ action: 'start', roomId: 'room-1' }, ctx, () => undefined, notAMember);
    expect(result.details.ok).toBe(false);
    expect(result.text).toContain('SERO_ROOMS=1');
  });

  it('carries the user limits into the plan, with minutes as milliseconds', async () => {
    const { app, calls } = stubApp();
    const result = await runTool(
      { action: 'prepare', problem: 'port the parser', maxMinutes: 45, maxCostUsd: 12, maxMembers: 4, access: 'read-only' },
      app,
    );

    expect(result.details.ok).toBe(true);
    expect(result.details.roomId).toBe('room-1');
    expect(calls[0].args[0]).toMatchObject({
      problem: 'port the parser',
      limits: { maxWallClockMs: 45 * 60_000, maxCostUsd: 12, maxMembers: 4, access: 'read-only' },
    });
  });

  it('refuses malformed clarifications rather than planning without them', async () => {
    const { app, calls } = stubApp();
    const result = await runTool({ action: 'prepare', problem: 'x', clarificationsJson: '[{"prompt":"a"}]' }, app);
    expect(result.details.ok).toBe(false);
    expect(result.text).toContain('"prompt" and an "answer"');
    expect(calls).toEqual([]);
  });

  it('splits the addressed members and passes the rest straight through', async () => {
    const { app, calls } = stubApp();
    await runTool({ action: 'intervene', roomId: 'room-1', body: 'stop', memberIds: 'impl, scout' }, app);
    // Interrupting is the default: the user is waiting on it.
    expect(calls[0]).toEqual({ method: 'intervene', args: ['room-1', 'stop', ['impl', 'scout'], true] });
  });

  it('leaves a note for the next turn when the user does not want to interrupt', async () => {
    const { app, calls } = stubApp();
    await runTool({ action: 'intervene', roomId: 'room-1', body: 'no rush', deliver: 'next-turn' }, app);
    expect(calls[0]).toEqual({ method: 'intervene', args: ['room-1', 'no rush', [], false] });
  });

  it('needs a Room for everything except planning one', async () => {
    const { app, calls } = stubApp();
    const result = await runTool({ action: 'pause' }, app);
    expect(result.details.ok).toBe(false);
    expect(result.text).toContain('roomId is required for pause');
    expect(calls).toEqual([]);
  });

  it('needs both halves of an approval answer', async () => {
    const { app } = stubApp();
    expect((await runTool({ action: 'resolve_approval', roomId: 'room-1', decision: 'approved' }, app)).text)
      .toContain('approvalId is required');
    expect((await runTool({ action: 'resolve_approval', roomId: 'room-1', approvalId: 'ap-1' }, app)).text)
      .toContain('decision is required');
  });

  it('remembers which chat asked, and only when there is one to answer', async () => {
    const { app, calls } = stubApp();
    // The Room panel's own session is in-memory: it has no session file, so
    // there is no chat to deliver to and the Room must not claim one.
    await executeRoomAppTool({ action: 'prepare', problem: 'fix it' }, ctx, () => app, notAMember);
    expect((calls[0].args[0] as { originSessionId: string | null }).originSessionId).toBeNull();

    await executeRoomAppTool({ action: 'prepare', problem: 'fix it' }, chatCtx, () => app, notAMember);
    expect((calls[1].args[0] as { originSessionId: string | null }).originSessionId).toBe('chat-9');
  });
});
