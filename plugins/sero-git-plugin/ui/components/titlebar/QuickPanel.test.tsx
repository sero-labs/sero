// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileChange } from '../../../shared/types';
import { QuickPanel } from './QuickPanel';

const run = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  getSeroApi: () => ({ gitApp: { run } }),
}));

const CHANGES: FileChange[] = [
  { path: 'README.md', status: 'modified', staged: false },
  { path: 'src/parse.ts', status: 'added', staged: true },
];

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button'))
    .find((candidate) => (candidate.textContent ?? '').includes(text));
  if (!match) throw new Error(`No button reading ${text}`);
  return match;
}

describe('QuickPanel', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  async function render(overrides: Partial<Parameters<typeof QuickPanel>[0]> = {}) {
    await act(async () => {
      root?.render(
        <QuickPanel
          workspaceId="ws-1"
          repoName="sero"
          branchName="main"
          ahead={0}
          behind={0}
          hasRemote
          changes={CHANGES}
          onOpenGit={vi.fn()}
          {...overrides}
        />,
      );
    });
  }

  async function type(message: string) {
    const input = container.querySelector('input');
    if (!(input instanceof HTMLInputElement)) throw new Error('No commit message field');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, message);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    run.mockReset();
    run.mockResolvedValue({ ok: true, message: 'Committed' });
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    root = null;
  });

  it('commits every change, staged or not, and names its object', async () => {
    await render();
    await type('feat: parse currency');

    await act(async () => { button(container, 'Commit 2 files').click(); });

    expect(run).toHaveBeenCalledWith('ws-1', {
      action: 'commit',
      all: true,
      message: 'feat: parse currency',
    });
  });

  it('blocks committing while conflicts remain, with the count attached', async () => {
    await render({
      changes: [{ path: 'src/parse.ts', status: 'conflict', staged: false }],
    });
    await type('fix: merge');

    expect(button(container, 'Commit 1 file').disabled).toBe(true);
    expect(container.textContent).toContain('1 conflict left to resolve');
  });

  it('disables sync when there is no remote, and says why', async () => {
    await render({ hasRemote: false });

    expect(button(container, 'Fetch').disabled).toBe(true);
    expect(button(container, 'Push').disabled).toBe(true);
    expect(container.textContent).toContain('no remote');
  });

  it('reports a failure in place, next to the control that started it', async () => {
    run.mockResolvedValue({ ok: false, message: 'Authentication failed' });
    await render();

    await act(async () => { button(container, 'Push').click(); });

    expect(container.textContent).toContain('Authentication failed');
  });
});
