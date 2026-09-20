// @vitest-environment jsdom

/**
 * A Room row says what it waits for and for how long. The brief it was given
 * stays inside the Room: it used to be the row's only summary line.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomSummary } from '../../shared/room-types';
import { RoomsOverview } from '../components/RoomsOverview';

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

const BRIEF = 'APPROVED ARCHITECT SCOPE. This brief and milestone govern the task…';

function waitingRoom(): RoomSummary {
  const nineDaysAgo = new Date(Date.now() - 9 * 24 * 3600_000).toISOString();
  return {
    id: 'room-1',
    title: 'CSV Summariser Adversarial Validation',
    status: 'paused',
    memberCount: 2,
    activeMemberCount: 0,
    costUsd: 0.31,
    maxCostUsd: 2,
    startedAt: nineDaysAgo,
    updatedAt: nineDaysAgo,
    problemStatement: BRIEF,
    members: [
      { id: 'm1', name: 'Adversary', isConductor: false },
      { id: 'm2', name: 'Conductor', isConductor: true },
    ],
    attentionCount: 2,
    deliveredAt: null,
    deliveryRef: null,
    attention: {
      approvals: [],
      requests: [
        { memberId: 'm1', memberName: 'Adversary', question: 'Which contract governs the edge case?' },
        { memberId: 'm2', memberName: 'Conductor', question: 'Confirm the scope?' },
      ],
    },
  } as RoomSummary;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('a Room row', () => {
  it('says it waits for the user, what is asked, and keeps the brief out of it', () => {
    act(() => {
      root.render(<RoomsOverview rooms={[waitingRoom()]} onOpenRoom={() => {}} onNew={() => {}} />);
    });

    const text = host.textContent ?? '';
    expect(text).toContain('Waiting for you');
    expect(text).toContain('Answer 2 members in the Room');
    expect(text).not.toContain('APPROVED ARCHITECT SCOPE');
  });

  it('keeps the member faces and the member count', () => {
    act(() => {
      root.render(<RoomsOverview rooms={[waitingRoom()]} onOpenRoom={() => {}} onNew={() => {}} />);
    });

    expect(host.textContent).toContain('2 members');
    // One avatar image per member: the row keeps its faces.
    expect(host.querySelectorAll('img')).toHaveLength(2);
  });

  it('does not call a Room working from a saved running status alone', () => {
    const stale = { ...waitingRoom(), status: 'running', attention: undefined, attentionCount: 0 } as RoomSummary;

    act(() => {
      root.render(<RoomsOverview rooms={[stale]} onOpenRoom={() => {}} onNew={() => {}} />);
    });

    const text = host.textContent ?? '';
    expect(text).toContain('Last known');
    expect(text).not.toContain('Working');
  });
});
