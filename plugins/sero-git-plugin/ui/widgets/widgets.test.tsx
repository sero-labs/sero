// @vitest-environment jsdom

/**
 * The dashboard widgets against the design rules (§2).
 *
 * Rule 6 — counts are plain text, never pills — and rule 28 — no status label
 * for a state with no action — are both easy to break by reaching for the
 * shared `Status` component, which is what these widgets did. §6 applies the
 * rules to them without redesigning them, so the check is on the markup rather
 * than on a screenshot.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitAppState } from '../../shared/types';
import { createDefaultGitState } from '../../shared/types';

const state = vi.hoisted(() => ({ current: null as GitAppState | null }));

vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: () => [state.current, () => {}],
}));

const { GitStatusWidget } = await import('./GitStatusWidget');
const { GitCommitsWidget } = await import('./GitCommitsWidget');

/** The text of every `Status` the widget rendered — pills and labels alike. */
function statusText(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="status"]'))
    .map((node) => node.textContent?.trim() ?? '');
}

describe('the git dashboard widgets', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  async function render(node: React.ReactElement) {
    await act(async () => { root?.render(node); });
  }

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    root = null;
  });

  it('shows ahead/behind as plain text, not a pill', async () => {
    state.current = {
      ...createDefaultGitState(),
      repoPath: '/tmp/repo',
      currentBranch: 'main',
      branches: [{
        name: 'main', current: true, ahead: 2, behind: 1,
        remote: 'origin',
      }],
    };
    await render(<GitStatusWidget />);

    expect(container.textContent).toContain('↑2');
    expect(container.textContent).toContain('↓1');
    // A pill carries a name, never a number (rules 6 and 7). Checking for the
    // Status component itself rather than for `rounded-full`, which status dots
    // legitimately use elsewhere in the same widget.
    expect(statusText(container)).toEqual([]);
  });

  // Rule 28: no status label for a state with no action.
  it('says nothing at all when the branch is level with its remote', async () => {
    state.current = {
      ...createDefaultGitState(),
      repoPath: '/tmp/repo',
      currentBranch: 'main',
      branches: [{
        name: 'main', current: true, ahead: 0, behind: 0,
        remote: 'origin',
      }],
    };
    await render(<GitStatusWidget />);

    expect(container.textContent).not.toContain('Synced');
    expect(container.textContent).not.toContain('↑');
    expect(container.textContent).not.toContain('↓');
  });

  it('shows the commit count as plain text', async () => {
    state.current = {
      ...createDefaultGitState(),
      repoPath: '/tmp/repo',
      currentBranch: 'main',
      commitCount: 42,
      commits: [{
        hash: 'abc1234567', shortHash: 'abc1234', subject: 'initial commit',
        authorName: 'Test', authorEmail: 't@e.com', authorDate: new Date().toISOString(),
        parents: [], refs: [],
      }],
    };
    await render(<GitCommitsWidget />);

    expect(container.textContent).toContain('42 commits');
    expect(statusText(container)).toEqual([]);
  });
});
