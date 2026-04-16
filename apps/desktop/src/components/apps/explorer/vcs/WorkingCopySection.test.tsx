// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingCopyStatus } from '@sero/common';
import { WorkingCopySection } from './WorkingCopySection';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const vcsStoreMocks = vi.hoisted(() => {
  const store = {
    createCheckpoint: vi.fn(async () => {}),
  };

  return { store };
});

vi.mock('@/stores/vcs', () => ({
  useVcsStore: vi.fn((selector?: (store: typeof vcsStoreMocks.store) => unknown) =>
    selector ? selector(vcsStoreMocks.store) : vcsStoreMocks.store,
  ),
}));

describe('WorkingCopySection', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const status: WorkingCopyStatus = {
    files: [
      {
        path: 'src/index.ts',
        status: 'modified',
      },
    ],
    conflictCount: 0,
    parentChangeIds: [],
  };

  beforeEach(() => {
    vcsStoreMocks.store.createCheckpoint.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
  });

  it('keeps checkpoint creation working without rendering a dead absorb control', async () => {
    await act(async () => {
      root?.render(
        <WorkingCopySection
          workspaceId="ws-1"
          status={status}
          currentChangeId="change-1"
        />,
      );
      await Promise.resolve();
    });

    const commitButton = container.querySelector('[title="Create commit"]');
    expect(commitButton).not.toBeNull();
    if (!(commitButton instanceof HTMLButtonElement)) {
      throw new Error('expected create commit button');
    }

    await act(async () => {
      commitButton.click();
      await Promise.resolve();
    });

    expect(vcsStoreMocks.store.createCheckpoint).toHaveBeenCalledWith(
      'ws-1',
      undefined,
      'manual',
    );
    expect(container.querySelector('[title="Absorb changes into ancestors"]')).toBeNull();
  });
});
