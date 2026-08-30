// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoalMode } from '../components/GoalMode';

const run = vi.hoisted(() => vi.fn());

vi.mock('@sero-ai/app-runtime', () => ({ useAppTools: () => ({ run }) }));
vi.mock('../lib/use-goal-index', () => ({ useGoal: () => null }));
vi.mock('../components/GoalDetail', () => ({ GoalDetail: () => null }));
vi.mock('../components/GoalsOverview', () => ({
  GoalsOverview: ({ onDeleteGoal }: { onDeleteGoal: (goalId: string) => void }) => (
    <button type="button" onClick={() => onDeleteGoal('goal-live')}>Delete stale Goal</button>
  ),
}));

describe('Goal mode failures', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    run.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows the runtime refusal in the Goals list', async () => {
    run.mockResolvedValue({
      details: {
        ok: false,
        error: 'Goal goal-live is still live. Stop it before deleting it.',
      },
    });
    await act(async () => root.render(
      <GoalMode goalId={null} goals={[]} onOpenGoal={vi.fn()} onBack={vi.fn()} />,
    ));

    const remove = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Delete stale Goal');
    await act(async () => remove?.click());

    expect(container.textContent).toContain('Goal goal-live is still live. Stop it before deleting it.');
  });
});
