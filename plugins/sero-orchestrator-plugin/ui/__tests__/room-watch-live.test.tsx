// @vitest-environment jsdom

/**
 * A Watch tile that is not streaming, and a member that delegates.
 *
 * A waiting or finished member shows the END of its own last reply, dimmed and
 * without a live caret — never a fixed sentence about its status. A member that
 * runs child agents lists them, each with what it does now and its time.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@sero-ai/app-runtime';
import { RoomWatch } from '../components/RoomWatch';
import { DEFAULT_STATE } from '../../shared/defaults';
import { OrchestratorStateContext } from '../lib/orchestrator-state';
import type { MemberLiveSnapshot } from '../../shared/room-live-types';
import type { RoomMember } from '../../shared/room-types';

const replies = vi.hoisted(() => ({
  list: [] as Array<{ turnIndex: number; timestamp: string; role: 'user' | 'assistant' | 'system' | 'tool'; text: string }>,
}));
const subagent = vi.hoisted(() => ({
  snapshot: vi.fn(async () => [] as unknown[]),
  watch: vi.fn(async () => {}),
  unwatch: vi.fn(async () => {}),
  onEvent: vi.fn(() => () => {}),
}));

Reflect.set(globalThis, 'sero', { appState: {}, appAgent: {}, subagent });

function member(overrides: Partial<RoomMember> & { id: string; sessionId: string | null }): RoomMember {
  return {
    displayName: overrides.id,
    isConductor: false,
    status: 'working',
    statusAt: '2026-09-10T12:00:00.000Z',
    statusDetail: '',
    usage: { costUsd: 0.1, turns: 1 },
    session: { sessionId: overrides.sessionId },
    ...overrides,
  } as unknown as RoomMember;
}

function snapshot(overrides: Partial<MemberLiveSnapshot> & { memberId: string }): MemberLiveSnapshot {
  return {
    roomId: 'room-1',
    turnId: null,
    text: '',
    truncated: false,
    toolInFlight: null,
    lastTurnStatus: null,
    watching: true,
    updatedAt: '2026-09-10T12:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  // The bridge checks the full preload shape, so the stub must look like one.
  vi.clearAllMocks();
  replies.list = [{
    turnIndex: 1,
    timestamp: '2026-09-10T12:00:00.000Z',
    role: 'assistant',
    text: 'I checked the schema and it already allows null.',
  }];
  subagent.snapshot.mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

const dispatch = vi.fn(async () => ({ entries: replies.list }));

async function render(members: RoomMember[], live: MemberLiveSnapshot[]) {
  await act(async () => {
    root.render(
      <AppProvider value={{
        appId: 'orchestrator',
        workspaceId: 'ws-1',
        workspacePath: '/ws-1',
        stateFilePath: '/ws-1/state.json',
      }}>
        <OrchestratorStateContext.Provider value={{ state: DEFAULT_STATE, updateState: () => {}, ready: true }}>
          <RoomWatch
            roomId="room-1"
            memberIds={members.map((entry) => entry.id)}
            members={new Map(members.map((entry) => [entry.id, entry]))}
            live={new Map(live.map((entry) => [entry.memberId, entry]))}
            dispatch={dispatch}
            onOpen={() => {}}
          />
        </OrchestratorStateContext.Provider>
      </AppProvider>,
    );
  });
  // The reply is read asynchronously, once.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function pane(name: string): Element | undefined {
  return [...container.querySelectorAll('section')].find((section) => section.getAttribute('aria-label') === name);
}

describe('a tile that is not streaming', () => {
  it('shows the end of the member’s last reply, dimmed, with no caret', async () => {
    await render(
      [member({ id: 'done', displayName: 'Done', sessionId: 'session-1', status: 'completed' })],
      [snapshot({ memberId: 'done' })],
    );

    const tile = pane('Done');
    expect(tile?.textContent).toContain('I checked the schema and it already allows null.');
    // No fixed sentence about its status stands in for the reply.
    expect(tile?.textContent).not.toContain('closed but kept');
    // Dimmed, and nothing in the tile carries a live caret.
    const body = tile?.querySelector('p');
    expect(body?.className).toContain('text-room-text4');
    expect(tile?.querySelector('[data-slot="live-block"]')).toBeNull();
  });

  it('shows a waiting member’s last reply rather than a sentence about waiting', async () => {
    await render(
      [member({ id: 'ask', displayName: 'Ask', sessionId: 'session-2', status: 'waiting' })],
      [snapshot({ memberId: 'ask', text: '' })],
    );

    const tile = pane('Ask');
    expect(tile?.textContent).toContain('I checked the schema and it already allows null.');
    expect(tile?.textContent).not.toContain('no turn is held');
  });

  it('does not read history while the member is mid-turn', async () => {
    await render(
      [member({ id: 'busy', displayName: 'Busy', sessionId: 'session-3' })],
      [snapshot({ memberId: 'busy', turnId: 'turn-1', text: 'Editing the schema.' })],
    );

    // Its live text is already on screen, so the session file is not read.
    expect(dispatch).not.toHaveBeenCalled();
    expect(pane('Busy')?.textContent).toContain('Editing the schema.');
  });
});

describe('a member that delegates', () => {
  it('lists each child agent with what it does now and its time', async () => {
    subagent.snapshot.mockResolvedValue([
      {
        id: 'child-1',
        agentName: 'scout',
        status: 'running',
        parentSessionId: 'session-1',
        startedAt: Date.now() - 4000,
        liveOutput: 'scanning',
        toolActivity: [{ toolName: 'edit', argsSummary: 'src/App.tsx', running: true }],
      },
      {
        id: 'child-2',
        agentName: 'researcher',
        status: 'running',
        parentSessionId: 'session-1',
        startedAt: Date.now() - 21_000,
        liveOutput: 'reading',
        toolActivity: [],
      },
      {
        id: 'other',
        agentName: 'unrelated',
        status: 'running',
        parentSessionId: 'session-9',
        startedAt: Date.now(),
        liveOutput: '',
        toolActivity: [],
      },
    ]);

    await render(
      [member({ id: 'lead', displayName: 'Lead', sessionId: 'session-1' })],
      [snapshot({ memberId: 'lead', turnId: 'turn-1', text: 'Delegating.' })],
    );

    const tile = pane('Lead');
    expect(tile?.textContent).toContain('scout');
    expect(tile?.textContent).toContain('edit src/App.tsx');
    expect(tile?.textContent).toContain('0:04');
    expect(tile?.textContent).toContain('researcher');
    expect(tile?.textContent).toContain('writing its answer');
    expect(tile?.textContent).toContain('0:21');
    // A child of another member is never listed here.
    expect(tile?.textContent).not.toContain('unrelated');
  });
});
