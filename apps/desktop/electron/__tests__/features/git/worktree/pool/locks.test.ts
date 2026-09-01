import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { withGitMutationGate } from '@electron/features/git/worktree/pool/locks';

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Git mutation gate', () => {
  it('does not overlap conflicting registration mutations', async () => {
    const poolDir = await mkdtemp(path.join(os.tmpdir(), 'sero-git-gate-'));
    roots.push(poolDir);
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withGitMutationGate(poolDir, async () => {
      events.push('first-enter');
      await holdFirst;
      events.push('first-leave');
    });
    await until(() => events.includes('first-enter'));
    const second = withGitMutationGate(poolDir, async () => { events.push('second-enter'); });
    await Promise.resolve();
    expect(events).toEqual(['first-enter']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first-enter', 'first-leave', 'second-enter']);
  });
});

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition did not become true');
}
