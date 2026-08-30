// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { GoalBanner } from './GoalBanner';
import type { ChatGoalSnapshot } from '@/types/ipc';

vi.mock('lucide-react', () => ({
  ChevronRight: () => <svg />,
  CircleStop: () => <svg />,
  Pause: () => <svg />,
  Play: () => <svg />,
  Target: () => <svg />,
}));
vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));
vi.mock('@sero-ai/ui/lib/utils', () => ({
  cn: (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' '),
}));

const base: ChatGoalSnapshot = {
  id: 'goal-1',
  objective: 'Make the build green',
  criteria: ['pnpm build exits zero'],
  status: 'active',
  limits: { maxAttemptsTotal: 25, maxTotalTokens: 600_000, maxCostUsd: 3 },
  usage: { automaticTurns: 12, totalTokens: 184_000, costUsd: 0.41, activeMs: 14 * 60_000 },
  progress: { repeats: 0 },
};

describe('GoalBanner', () => {
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

  it('expands to show criteria, usage, and evidence', async () => {
    await act(async () => root.render(<GoalBanner goal={{ ...base, status: 'complete', reportedComplete: { evidence: 'Build passed.', reportedAt: '2026-08-30T14:22:00Z' } }} onAction={vi.fn()} />));
    expect(container.textContent).toContain('Reported');
    expect(container.textContent).not.toContain('Build passed.');

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-expanded="false"]')?.click());
    expect(container.textContent).toContain('pnpm build exits zero');
    expect(container.textContent).toContain('184,000');
    expect(container.textContent).toContain('Build passed.');
    expect(container.textContent).toContain('not verified');
  });

  it('offers the action that matches active, held, limited, and stopped states', async () => {
    const onAction = vi.fn();
    await act(async () => root.render(<GoalBanner goal={base} onAction={onAction} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Pause goal"]')?.click());
    expect(onAction).toHaveBeenCalledWith('pause');

    await act(async () => root.render(<GoalBanner goal={{ ...base, status: 'paused', pauseReason: 'no-progress' }} onAction={onAction} />));
    expect(container.textContent).toContain('Held');
    expect(container.querySelector('[aria-label="Resume goal"]')).not.toBeNull();

    await act(async () => root.render(<GoalBanner goal={{ ...base, status: 'limited', limitReached: 'maxAttemptsTotal' }} onAction={onAction} />));
    expect(container.textContent).toContain('Raise limit');

    await act(async () => root.render(<GoalBanner goal={{ ...base, status: 'paused', closedAt: '2026-08-30T15:00:00Z' }} onAction={onAction} />));
    expect(container.textContent).toContain('Stopped');
    expect(container.querySelector('[aria-label="Resume goal"]')).toBeNull();
  });
});
