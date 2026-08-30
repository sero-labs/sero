// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Goal } from '../../shared/goal-types';
import { GoalDetail } from '../components/GoalDetail';

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock('@sero-ai/ui/components/ui/alert-dialog', () => {
  const Wrap = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Action = ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  );
  return {
    AlertDialog: Wrap,
    AlertDialogAction: Action,
    AlertDialogCancel: Action,
    AlertDialogContent: Wrap,
    AlertDialogDescription: Wrap,
    AlertDialogFooter: Wrap,
    AlertDialogHeader: Wrap,
    AlertDialogTitle: Wrap,
    AlertDialogTrigger: Wrap,
  };
});

const goal: Goal = {
  schemaVersion: 1,
  id: 'goal-1',
  workspaceId: 'ws-1',
  sessionPath: '/sessions/release.jsonl',
  sessionId: null,
  objective: 'Publish the signed installer',
  criteria: ['build exits zero', 'installer is signed'],
  status: 'limited',
  limits: { maxAttemptsTotal: 25, maxCostUsd: 3 },
  usage: { automaticTurns: 25, totalTokens: 180_000, costUsd: 1.12, activeMs: 41 * 60_000 },
  progress: { repeats: 0 },
  limitReached: 'maxAttemptsTotal',
  history: [{
    at: '2026-08-30T14:22:00Z',
    from: 'active',
    to: 'limited',
    reason: 'used all 25 automatic turns',
  }],
  createdAt: '2026-08-30T13:00:00Z',
  updatedAt: '2026-08-30T14:22:00Z',
};

describe('Goal detail', () => {
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

  it('shows the contract, usage, history, limit reason, session, and applicable controls', async () => {
    const onAction = vi.fn();
    await act(async () => root.render(<GoalDetail goal={goal} busy={false} onAction={onAction} onBack={vi.fn()} />));

    expect(container.textContent).toContain('Publish the signed installer');
    expect(container.textContent).toContain('build exits zero');
    expect(container.textContent).toContain('180,000');
    expect(container.textContent).toContain('used all 25 automatic turns');
    expect(container.textContent).toContain('release');
    expect(container.textContent).toContain('Reached maxAttemptsTotal. A limit is not completion.');

    const raise = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Raise turn budget'));
    await act(async () => raise?.click());
    expect(onAction).toHaveBeenCalledWith('raise-limit');
  });

  it('offers confirmed deletion for a completed Goal', async () => {
    const onAction = vi.fn();
    const completed: Goal = {
      ...goal,
      status: 'complete',
      limitReached: undefined,
      reportedComplete: { evidence: 'the installer is signed', reportedAt: goal.updatedAt },
    };
    await act(async () => root.render(<GoalDetail goal={completed} busy={false} onAction={onAction} onBack={vi.fn()} />));

    expect(container.textContent).toContain('Delete this Goal?');
    expect(container.querySelector('button[aria-label="Delete Goal"]')).not.toBeNull();
    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Delete Goal');
    await act(async () => confirm?.click());
    expect(onAction).toHaveBeenCalledWith('delete');
  });
});
