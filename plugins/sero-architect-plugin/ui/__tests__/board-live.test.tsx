// @vitest-environment jsdom

/**
 * What runs now, on the project board: work grouped by the Room or Workflow
 * it runs in, one action when one agent works, a short list when several do.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCHITECT_APP_ID, type WorkFeedback } from '@sero-ai/common';

import { FIXTURES } from '../__preview__/fixture';
import type { ProjectRecord } from '../../shared/record';
import { BoardLive } from '../components/BoardLive';
import { liveRows } from '../lib/board';

const EPOCH = '2026-10-03T09:00:00.000Z';
const NOW = '2026-10-03T09:30:00.000Z';

type ChildRun = { id: string; agentName: string; parentSessionId: string; startedAt: number; toolActivity: { toolName: string; argsSummary: string; running: boolean }[] };

/** The running child agents the host reports, by the session that started them. */
let childRuns = new Map<string, ChildRun[]>();
/** What each Room member is doing right now, by member id. */
let memberLive: Record<string, { toolInFlight: { toolName: string; summary: string }; text: string }> = {};
const openSeroApp = vi.hoisted(() => vi.fn(async () => true));

vi.mock('@sero-ai/ui', () => ({ SubagentLiveBlock: () => <div /> }));

vi.mock('@sero-ai/app-runtime', async () => ({
  AppContext: (await vi.importActual<typeof import('@sero-ai/app-runtime')>('@sero-ai/app-runtime')).AppContext,
  useChildRuns: (_workspaceId: string | null, sessions: readonly string[]) => new Map([...childRuns].filter(([session]) => sessions.includes(session))),
  openSeroApp,
  openSeroFile: vi.fn(async () => true),
}));

// The seam under test is how the tile reads what the members report, not the transport.
vi.mock('../lib/use-work-watch', () => ({
  useLinkedMemberLive: (_projectId: string, _workspaceId: string | null, _roomId: string, memberId: string) => memberLive[memberId] ?? null,
  useOwnerWatch: () => ({ live: null, recent: [] }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
  childRuns = new Map();
  memberLive = {};
  openSeroApp.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function feedback(key: string, record: ProjectRecord, over: Partial<WorkFeedback> = {}): WorkFeedback {
  return {
    key, kind: 'room-member', owner: key, scope: { appId: 'orchestrator', workspaceId: 'ws-hollow', workId: 'room-1', projectId: record.id, memberId: key },
    epoch: EPOCH, revision: 1, turnId: 't1', attached: true, wait: { kind: 'tool', toolName: 'bash', since: NOW }, openCalls: 1,
    lastActivityAt: NOW, contactObservedAt: NOW, terminal: null, ...over,
  };
}

/** A project whose first milestone runs in a Room named by the record. */
function roomProject(): ProjectRecord {
  const base = FIXTURES.build!;
  const [first, ...rest] = base.milestones;
  return {
    ...base,
    workspaceId: 'ws-hollow',
    milestones: [
      { ...first!, title: 'Build the synth', dispatch: { kind: 'room', id: 'room-1', workspaceId: 'ws-hollow', dispatchedAt: EPOCH, chargedUsd: 0, destination: null } },
      ...rest,
    ],
  };
}

function render(record: ProjectRecord, work: WorkFeedback[], runtimeRunning = true) {
  const rows = liveRows(record, work, EPOCH, runtimeRunning);
  act(() => root.render(<BoardLive record={record} rows={rows} onOpenSession={vi.fn()} />));
  return rows;
}

describe('liveRows', () => {
  it('groups running work by Room, names the Room from the milestone title, and drops ended work', () => {
    const record = roomProject();
    const work = [
      feedback('writer', record),
      feedback('reviewer', record),
      feedback('done', record, { terminal: { outcome: 'ok', at: NOW } }),
      feedback('owner', record, { kind: 'owner-wake', scope: { appId: ARCHITECT_APP_ID, workspaceId: 'ws-hollow', projectId: record.id } }),
    ];

    const rows = liveRows(record, work, EPOCH, true);

    expect(rows.map((row) => [row.group.title, row.entry.key])).toEqual([
      ['Architect', 'owner'],
      ['Room · Build the synth', 'writer'],
      ['Room · Build the synth', 'reviewer'],
    ]);
  });

  it('does not list the owner between its turns', () => {
    const record = roomProject();
    const owner = feedback('owner', record, { kind: 'owner-wake', attached: false, wait: null, openCalls: 0, scope: { appId: ARCHITECT_APP_ID, workspaceId: 'ws-hollow', projectId: record.id } });
    expect(liveRows(record, [owner, feedback('writer', record)], EPOCH, true).map((row) => row.entry.key)).toEqual(['writer']);
  });

  it('lists nothing when the runtime is not running, because live work cannot be confirmed', () => {
    const record = roomProject();
    expect(liveRows(record, [feedback('writer', record)], EPOCH, false)).toEqual([]);
  });

  it('lists nothing before the session has an epoch', () => {
    const record = roomProject();
    expect(liveRows(record, [feedback('writer', record)], null, true)).toEqual([]);
  });
});

describe('BoardLive', () => {
  it('renders nothing when no work runs', () => {
    render(roomProject(), []);
    expect(container.querySelector('[aria-label="Live"]')).toBeNull();
  });

  it('reads one working row as one action, with no list to pick from', () => {
    const record = roomProject();
    render(record, [feedback('writer', record)]);
    expect(container.querySelector('[aria-label="Live"]')).not.toBeNull();
    expect(container.querySelector('[aria-pressed]')).toBeNull();
  });

  it('lists several working rows as buttons and shows the detail of the one picked', () => {
    const record = roomProject();
    memberLive = {
      writer: { toolInFlight: { toolName: 'edit', summary: 'src/keys.js' }, text: '' },
      reviewer: { toolInFlight: { toolName: 'read', summary: 'src/notes.js' }, text: '' },
    };
    render(record, [feedback('writer', record), feedback('reviewer', record)]);

    const picks = () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
    expect(picks().map((node) => node.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(container.textContent).toContain('src/keys.js');
    expect(container.textContent).not.toContain('src/notes.js');

    act(() => picks()[1]!.click());

    expect(picks().map((node) => node.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(container.textContent).toContain('src/notes.js');
    expect(container.textContent).not.toContain('src/keys.js');
  });

  it('lists an agent a member started beside the rows, matched by the member session only', () => {
    const record = roomProject();
    const member = (key: string, sessionId: string) => {
      const entry = feedback(key, record);
      return { ...entry, scope: { ...entry.scope, sessionId } };
    };
    const child: ChildRun = { id: 'run-1', agentName: 'scout', parentSessionId: 'session-reviewer', startedAt: Date.parse(NOW), toolActivity: [{ toolName: 'grep', argsSummary: 'oscillator', running: true }] };
    childRuns = new Map([
      ['session-reviewer', [child]],
      ['session-elsewhere', [{ ...child, id: 'run-2', agentName: 'stranger', parentSessionId: 'session-elsewhere' }]],
    ]);

    render(record, [member('writer', 'session-writer'), member('reviewer', 'session-reviewer')]);

    expect(container.textContent).toContain('scout');
    expect(container.textContent).not.toContain('stranger');
  });

  it('opens the Room the work runs in through the Orchestrator', () => {
    const record = roomProject();
    render(record, [feedback('writer', record)]);
    const open = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Open the Room');
    act(() => open?.click());
    expect(openSeroApp).toHaveBeenCalledWith('orchestrator', { roomId: 'room-1' }, 'ws-hollow');
  });
});
