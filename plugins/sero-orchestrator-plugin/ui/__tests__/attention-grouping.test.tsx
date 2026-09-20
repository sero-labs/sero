// @vitest-environment jsdom

/**
 * Needs you prints the name of the work once, however many of its items are
 * waiting. Three suggested changes to one Workflow used to print its title
 * three times.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopSummary } from '../../shared/types';
import { AttentionQueue } from '../components/AttentionQueue';

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

const TITLE = 'Release the completed reading tracker';

function loopWithSuggestions(count: number): LoopSummary {
  return {
    id: 'loop-1',
    title: TITLE,
    status: 'complete',
    summary: '',
    prompt: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    pendingSuggestions: count,
    attention: {
      suggestions: Array.from({ length: count }, (_, i) => ({
        id: `sug-${i}`,
        rationale: `Change ${i}`,
        confidence: 'medium' as const,
        changedStepCount: i + 1,
      })),
    },
  };
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

describe('the Needs you queue', () => {
  it('prints one Workflow name above its three suggested changes', () => {
    act(() => {
      root.render(
        <AttentionQueue
          loops={[loopWithSuggestions(3)]}
          busy={false}
          onAction={() => {}}
          onOpenLoop={() => {}}
        />,
      );
    });

    const text = host.textContent ?? '';
    const names = text.split(TITLE).length - 1;
    expect(names).toBe(1);

    const rows = [...host.querySelectorAll('button')].filter((b) => b.textContent === 'Review');
    expect(rows).toHaveLength(3);
    expect(text).toContain('3 items');
  });

  it('names each suggested change by the steps it changes, not by an agent instruction', () => {
    act(() => {
      root.render(
        <AttentionQueue
          loops={[loopWithSuggestions(1)]}
          busy={false}
          onAction={() => {}}
          onOpenLoop={() => {}}
        />,
      );
    });

    expect(host.textContent).toContain('Suggested change · 1 step');
  });
});
