// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalIndexEntry } from '../../shared/goal-types';
import { GoalsOverview } from '../components/GoalsOverview';

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

function goal(overrides: Partial<GoalIndexEntry> = {}): GoalIndexEntry {
  return {
    id: 'goal-1',
    objective: 'Publish the signed installer',
    status: 'complete',
    sessionPath: '/sessions/release.jsonl',
    sessionId: 'session-1',
    automaticTurns: 4,
    maxAutomaticTurns: 25,
    costUsd: 0.2,
    updatedAt: '2026-08-30T10:00:00Z',
    ...overrides,
  };
}

describe('Goals overview', () => {
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

  it('uses a compact two-line row and deletes completed Goals from either overview', async () => {
    const onDeleteGoal = vi.fn();
    await act(async () => root.render(
      <GoalsOverview goals={[goal()]} onOpenGoal={vi.fn()} onDeleteGoal={onDeleteGoal} />,
    ));

    const open = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Publish the signed installer'));
    expect(open?.querySelectorAll('span.block')).toHaveLength(2);
    expect(open?.textContent).toContain('release · Reported complete · 4/25 · $0.20');
    expect(container.querySelector('button[aria-label="Delete Goal"]')).not.toBeNull();

    const confirm = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Delete Goal');
    await act(async () => confirm?.click());
    expect(onDeleteGoal).toHaveBeenCalledWith('goal-1');
  });

  it('does not offer deletion for an active Goal', async () => {
    await act(async () => root.render(
      <GoalsOverview goals={[goal({ status: 'active' })]} onOpenGoal={vi.fn()} onDeleteGoal={vi.fn()} />,
    ));
    expect(container.querySelector('button[aria-label="Delete Goal"]')).toBeNull();
  });
});
