// @vitest-environment jsdom

/**
 * A Room on hold asks once, and offers each control once.
 *
 * The captured Room put Message the team, Resume and Stop in the header and
 * again in the stop banner, then added a third strip whose Read it opened a
 * panel showing what the card now shows.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedRoom, RoomStopReason } from '../../shared/room-types';
import type { RoomMember } from '../../shared/room-types';
import { RoomHoldCard, namesSentence, type HoldMember } from '../components/RoomHoldCard';
import { RoomRoster } from '../components/RoomRoster';
import { RoomTopBar } from '../components/RoomTopBar';

const AT = '2026-09-11T09:00:00.000Z';
const HOUR = 3_600_000;

function member(id: string, displayName: string, statusDetail: string): HoldMember {
  return { id, displayName, statusDetail, statusAt: AT };
}

const MORGAN = member('m-1', 'Morgan', 'Assisted recovery merge could not be attempted: the harness rejected git merge --ff-only.');
const RILEY = member('m-2', 'Riley', 'System-directed recovery is blocked in the Riley worktree: clean status confirmed.');

const AWAITING: RoomStopReason = {
  kind: 'awaiting-user',
  detail: 'Two members asked for the saved snapshot to be applied through the harness.',
  at: AT,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function renderCard(props: Partial<Parameters<typeof RoomHoldCard>[0]> = {}) {
  act(() => {
    root.render(
      <RoomHoldCard
        stopReason={AWAITING}
        members={[MORGAN, RILEY]}
        resumable
        busy={false}
        onMessage={() => {}}
        onResume={() => {}}
        onStop={() => {}}
        {...props}
      />,
    );
  });
}

describe('the hold card', () => {
  it('asks in one sentence naming both members, not as a count', () => {
    renderCard();
    const headline = host.querySelector('h3')?.textContent ?? '';
    expect(headline).toBe('Morgan and Riley stopped to ask you something');
    expect(headline).not.toMatch(/\d/);
    expect(host.querySelectorAll('h3')).toHaveLength(1);
  });

  it('folds the members\' own words under it, which Read it used to open', () => {
    renderCard();
    const fold = host.querySelector('details');
    expect(fold?.querySelector('summary')?.textContent).toBe('What they wrote');
    expect(fold?.textContent).toContain('Morgan');
    expect(fold?.textContent).toContain(MORGAN.statusDetail);
    expect(fold?.textContent).toContain(RILEY.statusDetail);
    // The strip and its button are gone; the card is what they pointed to.
    expect(host.textContent).not.toContain('Read it');
  });

  it('carries the three actions, and runs each one', () => {
    const calls: string[] = [];
    renderCard({
      onMessage: () => calls.push('message'),
      onResume: () => calls.push('resume'),
      onStop: () => calls.push('stop'),
    });
    const labels = ['Message the team', 'Resume', 'Stop the Room'];
    for (const label of labels) {
      const button = [...host.querySelectorAll('button')].find((node) => node.textContent === label);
      expect(button, label).toBeDefined();
      act(() => { button?.click(); });
    }
    expect(calls).toEqual(['message', 'resume', 'stop']);
  });

  it('names a stop nobody asked about from the runtime kind', () => {
    renderCard({ stopReason: { kind: 'limit-reached', detail: 'Cost limit of $2.00 reached.', at: AT }, members: [] });
    expect(host.querySelector('h3')?.textContent).toBe('The Room reached a limit you set');
    expect(host.textContent).toContain('Stopped at your limit');
    expect(host.querySelector('details')).toBeNull();
  });

  it('renders nothing when the Room is neither stopped nor asked anything', () => {
    renderCard({ stopReason: null, members: [] });
    expect(host.textContent).toBe('');
  });
});

describe('naming the members', () => {
  it('joins them as a sentence would', () => {
    expect(namesSentence(['Morgan'])).toBe('Morgan');
    expect(namesSentence(['Morgan', 'Riley'])).toBe('Morgan and Riley');
    expect(namesSentence(['Morgan', 'Riley', 'Sam'])).toBe('Morgan, Riley and Sam');
  });
});

function room(status: PersistedRoom['runtime']['status']): PersistedRoom {
  return {
    definition: {
      title: 'CSV Summariser Adversarial Validation',
      envelope: { maxWallClockMs: HOUR, maxCostUsd: 2, maxActiveTurns: 3, maxTokens: 1e9, maxRosterRevisions: 5 },
    },
    runtime: {
      status,
      startedAt: AT,
      endedAt: null,
      activeMs: 12 * 60_000,
      activeSince: null,
      activeMemberIds: ['m-1'],
      usage: { costUsd: 0.31 },
      stopReason: null,
      messageSequence: 0,
      timelineSequence: 0,
      appliedCommandIds: [],
      lastProgressAt: null,
    },
    members: [],
  } as unknown as PersistedRoom;
}

function renderBar(status: PersistedRoom['runtime']['status'], holding: boolean) {
  act(() => {
    root.render(
      <RoomTopBar
        room={room(status)}
        view="timeline"
        busy={false}
        panelOpen={false}
        holding={holding}
        onTogglePanel={() => {}}
        onBack={() => {}}
        onView={() => {}}
        onMessage={() => {}}
        onPause={() => {}}
        onResume={() => {}}
        onStop={() => {}}
        onDelete={() => {}}
      />,
    );
  });
}

function buttonLabels(): string[] {
  return [...host.querySelectorAll('button')]
    .map((node) => node.textContent?.trim() || node.getAttribute('aria-label') || '');
}

describe('the Room header', () => {
  it('offers Stop for a running Room that asks nothing', () => {
    renderBar('running', false);
    expect(buttonLabels()).toContain('Stop');
    expect(buttonLabels()).toContain('Message the team');
  });

  it('offers none of the three while the hold card is on screen', () => {
    renderBar('paused', true);
    const labels = buttonLabels();
    expect(labels).not.toContain('Stop');
    expect(labels).not.toContain('Resume');
    expect(labels).not.toContain('Message the team');
  });

  it('says the state in a word, without a dot or a turns count', () => {
    renderBar('running', false);
    expect(host.textContent).toContain('Running');
    expect(host.textContent).not.toContain('turns active');
    // The dot was the only thing on the bar that said the state in colour alone.
    expect(host.querySelector('[data-room-dot]')).toBeNull();
    const dots = [...host.querySelectorAll('span')]
      .filter((node) => node.className.includes('rounded-full') && !node.textContent);
    expect(dots).toHaveLength(0);
  });

  it('leaves each member\'s state to the Team roster, which says it in words', () => {
    const roster = new Map<string, RoomMember>([
      ['m-1', { id: 'm-1', displayName: 'Morgan', status: 'blocked', statusDetail: '', statusAt: AT, isConductor: false, responsibility: 'Repairs' } as RoomMember],
      ['m-2', { id: 'm-2', displayName: 'Riley', status: 'working', statusDetail: '', statusAt: AT, isConductor: false, responsibility: 'Checks' } as RoomMember],
    ]);
    act(() => {
      root.render(<RoomRoster memberIds={['m-1', 'm-2']} members={roster} selectedId={null} onSelect={() => {}} />);
    });
    // The roster's own words for each state, which is why the header does not
    // need to add up how many members hold a turn.
    expect(host.textContent?.toLowerCase()).toContain('needs you');
    expect(host.textContent?.toLowerCase()).toContain('working');
  });
});
