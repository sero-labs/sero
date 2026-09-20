// @vitest-environment jsdom

/**
 * The Workflows tab: one full-width list. A row gives the whole title and the
 * state in words, and nothing tells the user to select something.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopSummary } from '../../shared/types';
import { WorkflowsList } from '../components/WorkflowsList';
import { WorkflowPage } from '../components/WorkflowPage';

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock('@sero-ai/ui/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('../components/LoopDetail', () => ({
  LoopDetail: ({ loop }: { loop: { title: string } }) => <div>detail of {loop.title}</div>,
}));

const LONG_TITLE = 'End-to-end resilience and release verification';

function loop(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return {
    id: 'loop-1',
    title: LONG_TITLE,
    status: 'active',
    summary: '',
    prompt: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    armedEventSources: ['github:issue-opened'],
    ...overrides,
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

describe('the Workflows list', () => {
  it('shows the whole title and the state in words, with no select-me placeholder', () => {
    act(() => {
      root.render(
        <WorkflowsList loops={[loop()]} query="" onQueryChange={() => {}} onSelect={() => {}} onNew={() => {}} />,
      );
    });

    const text = host.textContent ?? '';
    expect(text).toContain(LONG_TITLE);
    // The row prints the word and what it waits for on one line; the full
    // "Starts on…" sentence is the hover and focus title.
    expect(text).toContain('Waiting for a trigger · a GitHub issue');
    const word = host.querySelector('[data-activity-state="waiting-for-trigger"]');
    expect(word?.getAttribute('title')).toBe('Starts on a GitHub issue.');
    expect(text).not.toContain('Select a Workflow from the list.');
  });

  it('opens the Workflow the user picked', () => {
    const opened: string[] = [];
    act(() => {
      root.render(
        <WorkflowsList loops={[loop()]} query="" onQueryChange={() => {}} onSelect={(id) => opened.push(id)} onNew={() => {}} />,
      );
    });

    const row = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(LONG_TITLE));
    act(() => { row?.click(); });

    expect(opened).toEqual(['loop-1']);
  });

  it('takes its search text from the caller, so it survives opening a Workflow', () => {
    const typed: string[] = [];
    act(() => {
      root.render(
        <WorkflowsList loops={[loop()]} query="resilience" onQueryChange={(q) => typed.push(q)} onSelect={() => {}} onNew={() => {}} />,
      );
    });

    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('resilience');

    // The list reports a change rather than keeping its own copy, which is why
    // the app can hand the same text back after the page closes.
    act(() => {
      // React listens to the native setter, not a direct value assignment.
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, 'release');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(typed).toEqual(['release']);
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('resilience');
  });
});

describe('the Workflow page', () => {
  it('offers the way back to the list', () => {
    const backs: number[] = [];
    act(() => {
      root.render(
        <WorkflowPage
          loop={{ id: 'loop-1', title: LONG_TITLE } as never}
          busy={false}
          onAction={() => {}}
          onDispatch={async () => null}
          stateDir="/state"
          libraryDir={null}
          libraryIndex={{ version: 1, entries: [] }}
          onBack={() => backs.push(1)}
        />,
      );
    });

    const back = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Workflows'));
    expect(back).toBeDefined();
    act(() => { back?.click(); });
    expect(backs).toHaveLength(1);
    expect(host.textContent).toContain(`detail of ${LONG_TITLE}`);
  });

  it('says it is reading the record rather than asking the user to select one', () => {
    act(() => {
      root.render(
        <WorkflowPage
          loop={null}
          busy={false}
          onAction={() => {}}
          onDispatch={async () => null}
          stateDir="/state"
          libraryDir={null}
          libraryIndex={{ version: 1, entries: [] }}
          onBack={() => {}}
        />,
      );
    });

    expect(host.textContent).toContain('Reading this Workflow…');
    expect(host.textContent).not.toContain('Select a Workflow from the list.');
  });
});
