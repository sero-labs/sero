// @vitest-environment jsdom

/**
 * Home opens on a status line and the work that needs you. The three explainer
 * cards are three buttons and one disclosure, and counts a tab already carries
 * are not printed again here.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopSummary } from '../../shared/types';
import { HomeView } from '../components/HomeView';

vi.mock('@sero-ai/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock('@sero-ai/ui/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@sero-ai/app-runtime', () => ({
  useAppInfo: () => ({ appId: 'orchestrator', workspaceId: 'ws-1', workspacePath: '/repos/reading-tracker-resilience-01' }),
}));

function armedLoop(): LoopSummary {
  return {
    id: 'loop-1',
    title: 'reading-tracker-resilience-01: maintenance',
    status: 'active',
    summary: '',
    prompt: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    armedEventSources: ['github:ci-failed'],
    usage: { costUsd: 18.72 },
  };
}

function render(node: ReactNode, root: Root) {
  act(() => root.render(node));
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

function home(loops: LoopSummary[]) {
  return (
    <HomeView
      loops={loops}
      busy={false}
      onAction={() => {}}
      onOpenLoop={() => {}}
      onNew={() => {}}
      onNewRoom={() => {}}
      rooms={[]}
      goals={[]}
      onOpenGoal={() => {}}
      onDeleteGoal={() => {}}
    />
  );
}

describe('Home', () => {
  it('opens on what is happening, named, with the same rule as the list', () => {
    render(home([armedLoop()]), root);

    const text = host.textContent ?? '';
    expect(text).toContain('Nothing is running in reading-tracker-resilience-01');
    expect(text).toContain('1 Workflow waiting for a trigger · $18.72 spent here');
    expect(text).not.toContain('0 active');
  });

  // The three starts moved to the shell top bar, beside the tabs, where the
  // approved proposal puts them; shell-controls.test covers them there.
  it('explains the three kinds once, behind a disclosure', () => {
    render(home([armedLoop()]), root);

    // The explainer text is not on screen until it is asked for.
    expect(host.textContent).not.toContain('A repeatable job.');
    const disclosure = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('What are'));
    act(() => { disclosure?.click(); });
    expect(host.textContent).toContain('A repeatable job.');
  });

  it('does not repeat a count the tabs already carry', () => {
    render(home([armedLoop()]), root);

    expect(host.textContent).not.toContain('1 workflow');
    expect(host.textContent).not.toContain('0 rooms');
    expect(host.textContent).not.toContain('0 goals');
  });
});
