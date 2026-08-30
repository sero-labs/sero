// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalIndexEntry } from '../../shared/goal-types';
import { HomeView } from '../components/HomeView';

vi.mock('lucide-react', () => ({ Search: () => <svg /> }));
vi.mock('@sero-ai/ui/components/ui/input', () => ({ Input: () => <input /> }));
vi.mock('../components/AttentionQueue', () => ({ AttentionQueue: () => null }));
vi.mock('../components/LoopsOverview', () => ({ LoopsOverview: () => null }));
vi.mock('../components/RoomsOverview', () => ({ RoomsOverview: () => null }));
vi.mock('../components/GoalsOverview', () => ({ GoalsOverview: () => null }));
vi.mock('../components/room-kit', () => ({
  ModeCard: ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
    <button type="button" onClick={onClick}>{title}{children}</button>
  ),
  Pill: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const goal: GoalIndexEntry = {
  id: 'goal-1',
  objective: 'Ship the release',
  status: 'active',
  sessionPath: '/sessions/release.jsonl',
  sessionId: 'session-1',
  automaticTurns: 2,
  maxAutomaticTurns: 25,
  costUsd: 0.1,
  updatedAt: '2026-08-30T10:00:00Z',
};

describe('Home Goal navigation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('opens the Goals overview instead of the first Goal detail', async () => {
    const onOpenGoal = vi.fn();
    await act(async () => root.render(
      <HomeView
        loops={[]}
        busy={false}
        onAction={vi.fn()}
        onOpenLoop={vi.fn()}
        onNew={vi.fn()}
        onNewRoom={vi.fn()}
        rooms={[]}
        goals={[goal]}
        onOpenGoal={onOpenGoal}
        onDeleteGoal={vi.fn()}
      />,
    ));

    const card = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.startsWith('Goal'));
    await act(async () => card?.click());

    expect(onOpenGoal).toHaveBeenCalledWith('');
  });
});
