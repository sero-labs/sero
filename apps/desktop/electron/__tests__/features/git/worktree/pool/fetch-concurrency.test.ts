import { describe, expect, it, vi } from 'vitest';

const tracker = vi.hoisted(() => ({
  active: 0,
  maximum: 0,
  releases: [] as Array<() => void>,
}));

vi.mock('@electron/features/git/worktree/exec', () => ({
  execWorktreeGit: vi.fn(async () => new Promise<{ stdout: string; stderr: string }>((resolve) => {
    tracker.active += 1;
    tracker.maximum = Math.max(tracker.maximum, tracker.active);
    tracker.releases.push(() => {
      tracker.active -= 1;
      resolve({ stdout: '', stderr: '' });
    });
  })),
}));

import { fetchBranchBestEffort } from '@electron/features/git/worktree/provision';

describe('fetch concurrency', () => {
  it('allows independent fetches to overlap outside the Git mutation gate', async () => {
    const first = fetchBranchBestEffort('/repo', 'feature-a');
    const second = fetchBranchBestEffort('/repo', 'feature-b');
    await until(() => tracker.releases.length === 2);
    expect(tracker.maximum).toBe(2);
    for (const release of tracker.releases.splice(0)) release();
    await Promise.all([first, second]);
  });
});

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('condition did not become true');
}
