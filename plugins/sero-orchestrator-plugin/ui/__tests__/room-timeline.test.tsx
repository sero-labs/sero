// @vitest-environment jsdom

/**
 * The Room's timeline and its side panel: a publish row names the artifact and
 * offers one control that opens it, every filter and countable tab says what it
 * holds, and the brief ends at its last field.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomTimelineEvent, PathClaim } from '../../shared/room-message-types';
import type { PersistedRoom, RoomMember } from '../../shared/room-types';
import { RoomActivity } from '../components/RoomActivity';
import { RoomSidePanel } from '../components/RoomSidePanel';

const openSeroFile = vi.fn(async () => true);
vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: vi.fn(async () => true),
  openSeroFile: (...args: unknown[]) => openSeroFile(...(args as [])),
}));
vi.mock('../lib/use-watched-json', () => ({ useWatchedJson: (_path: string | null, fallback: unknown) => fallback }));
vi.mock('../lib/use-orchestrator-index', () => ({ useStateDir: () => '/state' }));

const MEMBERS = new Map<string, RoomMember>([['m1', {
  id: 'm1',
  displayName: 'Nova — Product Conductor',
  session: { workspaceId: 'ws-1' },
  worktreePath: '/work/room-1/m1',
} as unknown as RoomMember]]);

function event(overrides: Partial<RoomTimelineEvent> & { id: string; kind: RoomTimelineEvent['kind']; summary: string }): RoomTimelineEvent {
  return { roomId: 'room-1', at: '2026-09-10T23:11:00.000Z', memberId: 'm1', details: null, ...overrides };
}

const PUBLISH = event({
  id: 'e1',
  kind: 'artifact',
  summary: 'Nova — Product Conductor published plan: Final proposal: Signal Wake Crossing',
  details: { ref: 'plans/final-proposal.md' },
});

const EVENTS: RoomTimelineEvent[] = [
  PUBLISH,
  event({ id: 'e2', kind: 'work', summary: 'Nova recorded work' }),
  event({ id: 'e3', kind: 'message', summary: 'Pulse answered Nova', memberId: 'm2' }),
  event({ id: 'e4', kind: 'revision', summary: 'A revision needs your approval', memberId: 'm2' }),
  event({ id: 'e5', kind: 'member-status', summary: 'Flux joined', memberId: 'm2', details: { status: 'active' } }),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  openSeroFile.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function activity(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Filter activity"] button')];
}

function clickByText(text: string) {
  const found = [...container.querySelectorAll('button')].find((button) => button.textContent === text);
  act(() => found!.click());
}

describe('a Room\'s publish row', () => {
  it('names what was published and offers one control that opens the file', () => {
    act(() => root.render(<RoomActivity events={EVENTS} members={MEMBERS} />));

    expect(container.textContent).toContain('Final proposal: Signal Wake Crossing');
    // The file name is reachable on the control, not printed as the title.
    const open = [...container.querySelectorAll('button')].filter((button) => button.textContent === 'Open');
    expect(open).toHaveLength(1);
    expect(open[0]?.getAttribute('title')).toBe('final-proposal.md');

    act(() => open[0]!.click());
    expect(openSeroFile).toHaveBeenCalledWith('ws-1', '/work/room-1/m1/plans/final-proposal.md');
  });
});

describe('a Room\'s activity filters', () => {
  it('shows what each filter holds and keeps the names the drawing gives them', () => {
    act(() => root.render(<RoomActivity events={EVENTS} members={MEMBERS} />));
    expect(activity().map((button) => button.textContent)).toEqual([
      'Highlights5',
      'All5',
      'Decisions1',
      'Messages1',
      'Work2',
    ]);
  });

  it('selects every event from All, and only the matching events from one filter', () => {
    act(() => root.render(<RoomActivity events={EVENTS} members={MEMBERS} />));

    clickByText('All5');
    for (const summary of ['published plan: Final proposal', 'Nova recorded work', 'Pulse answered Nova', 'A revision needs your approval']) {
      expect(container.textContent).toContain(summary);
    }

    clickByText('Messages1');
    expect(container.textContent).toContain('Pulse answered Nova');
    expect(container.textContent).not.toContain('Nova recorded work');
    expect(container.textContent).not.toContain('Final proposal: Signal Wake Crossing');
  });
});

const room = {
  definition: { id: 'room-1', title: 'Frogger: Neon Crossing', envelope: {} },
  runtime: { usage: { rosterRevisions: 0, memberReplacements: 0 } },
  brief: {
    objective: 'Produce a product and implementation direction.',
    decisions: [{ title: 'Use a Canvas 2D renderer' }],
    activeWork: ['Audit workspace architecture'],
    blockers: [],
    openQuestions: [],
    successCriteria: ['One recommended concept unifies gameplay and controls.'],
    updatedAt: '2026-09-10T23:00:00.000Z',
  },
  work: Array.from({ length: 5 }, (_, index) => ({ id: `w${index}`, title: `Work ${index}`, status: 'completed', ownerMemberId: 'm1', notes: null })),
  claims: [] as PathClaim[],
  artifacts: Array.from({ length: 3 }, (_, index) => ({ id: `a${index}`, title: `Artifact ${index}`, kind: 'plan', ref: `plans/${index}.md`, producedByMemberId: 'm1' })),
  memberIds: [],
  readCursors: [],
  approvals: [],
  delivery: {},
  archivedAt: null,
} as unknown as PersistedRoom;

function tabs(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

describe('a Room\'s side-panel tabs', () => {
  it('shows a count on Work, Claims and Artifacts, and none on Brief and Changes', () => {
    act(() => root.render(<RoomSidePanel room={room} names={new Map()} members={MEMBERS} />));
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Brief', 'Work5', 'Claims0', 'Artifacts3', 'Changes']);
  });

  it('opens an empty tab that reads zero', () => {
    act(() => root.render(<RoomSidePanel room={room} names={new Map()} members={MEMBERS} />));

    const claims = tabs().find((tab) => tab.textContent === 'Claims0')!;
    act(() => claims.click());

    expect(claims.getAttribute('aria-selected')).toBe('true');
    expect(container.textContent).toContain('No paths are claimed.');
  });

  it('ends the brief at its last field', () => {
    act(() => root.render(<RoomSidePanel room={room} names={new Map()} members={MEMBERS} />));
    expect(container.textContent).toContain('One recommended concept unifies gameplay and controls.');
    // The paragraph explaining how the brief is built is gone from the brief.
    expect(container.textContent).not.toContain('The brief is built from Room records');
  });
});
