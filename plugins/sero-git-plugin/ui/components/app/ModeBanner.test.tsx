// @vitest-environment jsdom

/**
 * The mode banner is where anything affecting the whole repository is said —
 * the mode you are in, and now the failures too (rules 22 and 24).
 *
 * A repository-level error used to be a two-word chip in the top bar reading
 * "Issue", with the actual message hidden in a tooltip. The banner is the only
 * place with room to say what went wrong, and it is where every other
 * repo-wide announcement already lives.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitManagerRequest } from '../../../shared/types';
import { createDefaultGitState } from '../../../shared/types';
import { deriveRepoMode } from '../../lib/repo-mode';
import { ModeBanner } from './ModeBanner';

const NORMAL = deriveRepoMode({
  ...createDefaultGitState(),
  headHash: 'abc1234',
  commitCount: 3,
});

const MERGING = deriveRepoMode({
  ...createDefaultGitState(),
  headHash: 'abc1234',
  commitCount: 3,
  fileChanges: [{ path: 'src/parse.ts', status: 'conflict', staged: false }],
  merge: { fromRef: 'feat/x', message: 'Merge branch', conflictPaths: ['src/parse.ts'] },
});

describe('ModeBanner', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const onAction = vi.fn<(action: GitManagerRequest) => void>();

  async function render(props: Partial<Parameters<typeof ModeBanner>[0]> = {}) {
    await act(async () => {
      root?.render(
        <ModeBanner
          info={NORMAL}
          onAction={onAction}
          onRequestCheckout={vi.fn()}
          runStatus="idle"
          hasAiResolutions={false}
          onResolveWithAi={vi.fn()}
          onUndoAiResolutions={vi.fn()}
          {...props}
        />,
      );
    });
  }

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onAction.mockReset();
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    root = null;
  });

  it('shows nothing when the repository is ordinary and healthy', async () => {
    await render();
    expect(container.textContent).toBe('');
  });

  it('says what actually went wrong, and offers to try again', async () => {
    await render({ error: 'fatal: unable to read the index' });

    expect(container.textContent).toContain('Could not read this repository.');
    // The message itself, not a two-word label with the detail in a tooltip.
    expect(container.textContent).toContain('fatal: unable to read the index');

    const tryAgain = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Try again'));
    tryAgain?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onAction).toHaveBeenCalledWith({ action: 'refresh' });
  });

  // A failure outranks a mode: whatever else is true, this is what stopped.
  it('shows the failure rather than the merge it interrupted', async () => {
    await render({ info: MERGING, error: 'fatal: unable to read the index' });

    expect(container.textContent).toContain('Could not read this repository.');
    expect(container.textContent).not.toContain('Merging');
  });

  it('still announces a merge when nothing has failed', async () => {
    await render({ info: MERGING });

    expect(container.textContent).toContain('Merging feat/x in.');
    expect(container.textContent).toContain('Abort merge');
  });
});
