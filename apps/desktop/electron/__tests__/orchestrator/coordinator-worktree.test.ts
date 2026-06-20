// Phase 6 — worktree isolation + PR workflow. Exercises the REAL background-worker
// adapter (via the harness `runWorker` script) so the canonical attempt cwd flows
// end to end to an in-workspace worktree, the dirty-root "isolate" choice reroutes
// there (completing FR-26), and a completed opt-in loop opens a PR (FR-20/FR-21).

import { afterEach, describe, expect, it } from 'vitest';

import { getLoopPrState, mergeLoopPr } from '@plugins/sero-orchestrator-plugin/runtime/pr';
import type { DirtyRootGate } from '@plugins/sero-orchestrator-plugin/runtime/vcs';

import { createHarness, type Harness } from './harness';

/** Mirrors `workItemId` — the neutral worktree id is the loop id without its prefix. */
const idOf = (loopId: string) => loopId.replace(/^loop-/, '');

/** A worker that completes, declaring the files/diff it produced. */
function completingWorker(changedFiles = ['src/feature.ts'], diff = 'diff-1') {
  return async () => ({ response: 'done', changedFiles, diff });
}

function gateReturning(choice: 'auto-save' | 'defer' | 'isolate' | 'timeout'): DirtyRootGate {
  return { prompt: async () => choice };
}

let active: Harness | null = null;
function use(harness: Harness): Harness {
  active = harness;
  return harness;
}
afterEach(() => {
  active?.cleanup();
  active = null;
});

describe('Phase 6 — worktree workdir resolution (FR-20)', () => {
  it('runs a configured worktree loop entirely inside .sero/worktrees and reuses it', async () => {
    const h = use(createHarness({ runWorker: completingWorker() }));
    const loopId = await h.createLoop({
      isolation: 'worktree',
      checks: [{ type: 'command', command: 'ok', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const id = idOf(loopId);
    const expectedPath = h.git.worktreePath(id);

    const loop = await h.loop(loopId);
    const attempt = loop?.attempts.at(-1);
    // The attempt's canonical cwd is the worktree.
    expect(attempt?.workdir.mode).toBe('worktree');
    expect(attempt?.workdir.cwd).toBe(expectedPath);
    expect(attempt?.workdir.branchName).toBe(h.git.branchName(id, 'Goal'));
    // Worktree created once, with the neutral work-item id (no card leak in the call).
    expect(h.git.creates).toEqual([{ cardId: id, cardTitle: 'Goal' }]);
    // The loop records the reusable worktree handle and is now isolation-locked.
    expect(loop?.worktree?.path).toBe(expectedPath);
    expect(loop?.isolation).toBe('worktree');
    // Checks/diff AND the worker all targeted the worktree cwd — not the root.
    expect(h.commandCwds.every((cwd) => cwd === expectedPath)).toBe(true);
    expect(h.subagentCwds).toContain(expectedPath);
    expect(h.commandCwds).not.toContain(h.workspacePath);
  });

  it('reuses one worktree across attempts (created once, not per attempt)', async () => {
    let n = 0;
    const h = use(
      createHarness({
        // Each attempt produces a distinct diff (so no-progress never trips) but the
        // check keeps failing, so the loop stays active and iterates.
        runWorker: async () => {
          n += 1;
          return { response: 'try', changedFiles: [`src/file-${n}.ts`], diff: `diff-${n}` };
        },
        verify: (command) => ({ command, success: false, stdout: '', stderr: 'no', durationMs: 1 }),
      }),
    );
    const loopId = await h.createLoop({
      isolation: 'worktree',
      checks: [{ type: 'command', command: 'check', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const loop = await h.loop(loopId);
    expect(loop?.attempts).toHaveLength(2);
    expect(h.git.creates).toHaveLength(1); // one worktree, reused
    const cwds = new Set(loop?.attempts.map((a) => a.workdir.cwd));
    expect(cwds.size).toBe(1); // both attempts ran in the same worktree
  });
});

describe('Phase 6 — dirty-root "isolate" choice (FR-26, D-07)', () => {
  it('reroutes a dirty-root attempt to a fresh worktree without auto-saving', async () => {
    const h = use(
      createHarness({
        runWorker: completingWorker(),
        dirty: true,
        head: 'ROOTHEAD',
        checkpoint: 'AUTOSAVE_SHA', // would appear as baseRef if auto-save ran
        gate: gateReturning('isolate'),
      }),
    );
    const loopId = await h.createLoop({
      checks: [{ type: 'command', command: 'ok', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const loop = await h.loop(loopId);
    const attempt = loop?.attempts.at(-1);
    expect(attempt?.workdir.mode).toBe('worktree');
    expect(attempt?.dirtyRootDecision).toBe('isolated');
    // The user's dirty root was NOT committed (baseRef is the worktree HEAD, not the checkpoint).
    expect(attempt?.baseRef).toBe('ROOTHEAD');
    expect(h.git.creates).toHaveLength(1);
    // The loop is isolation-locked for the rest of its life.
    expect(loop?.isolation).toBe('worktree');
    expect(loop?.worktree).toBeDefined();
  });

  it('falls back to auto-save when isolate is chosen but the adapter cannot isolate', async () => {
    // active-session can't run in a worktree (D-06); isolate degrades to auto-save.
    const h = use(
      createHarness({
        dirty: true,
        checkpoint: 'AUTOSAVE_SHA',
        gate: gateReturning('isolate'),
        session: { steer: () => ({ changedFiles: ['src/s.ts'], diff: 'd' }) },
      }),
    );
    const loopId = await h.createLoop({
      executionMode: 'active-session',
      checks: [{ type: 'command', command: 'ok', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const attempt = (await h.loop(loopId))?.attempts.at(-1);
    expect(attempt?.workdir.mode).toBe('workspace-root');
    expect(attempt?.dirtyRootDecision).toBe('auto-save');
    expect(attempt?.baseRef).toBe('AUTOSAVE_SHA');
    expect(h.git.creates).toHaveLength(0);
  });
});

describe('Phase 6 — PR flow on a completed loop (FR-21)', () => {
  it('opens a PR with a generated title/body when an opted-in worktree loop completes', async () => {
    const h = use(createHarness({ runWorker: completingWorker(['src/a.ts', 'src/b.ts'], 'd') }));
    const loopId = await h.createLoop({
      goal: 'Ship the widget',
      isolation: 'worktree',
      prPolicy: { openOnComplete: true },
      checks: [{ type: 'command', command: 'pnpm test', required: true }],
    });
    const result = await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const loop = await h.loop(loopId);
    expect(loop?.status).toBe('complete');
    // Branch pushed, PR opened.
    expect(h.git.pushes).toHaveLength(1);
    expect(h.git.pushes[0]?.branch).toBe(loop?.worktree?.branch);
    expect(h.git.prs).toHaveLength(1);
    const pr = h.git.prs[0]!;
    expect(pr.title).toBe('Goal');
    expect(pr.body).toContain('## Goal');
    expect(pr.body).toContain('Ship the widget');
    expect(pr.body).toContain('## Checks');
    expect(pr.body).toContain('pnpm test');
    expect(pr.body).toContain('src/a.ts');
    // Recorded on the loop + surfaced in the message.
    expect(loop?.pullRequest).toMatchObject({ number: 1, state: 'open', url: 'https://example.test/pr/1' });
    expect(result.message).toContain('Opened PR #1');
  });

  it('does not open a PR for a completed loop that did not opt in', async () => {
    const h = use(createHarness({ runWorker: completingWorker() }));
    const loopId = await h.createLoop({
      isolation: 'worktree',
      checks: [{ type: 'command', command: 'ok', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });
    expect((await h.loop(loopId))?.status).toBe('complete');
    expect(h.git.prs).toHaveLength(0);
    expect((await h.loop(loopId))?.pullRequest).toBeUndefined();
  });

  it('reads merge state and merges via the manual helpers', async () => {
    const h = use(
      createHarness({
        runWorker: completingWorker(),
        prMergeState: 'open',
        mergePrResult: { success: true, state: 'merged' },
      }),
    );
    const loopId = await h.createLoop({
      isolation: 'worktree',
      prPolicy: { openOnComplete: true },
      checks: [{ type: 'command', command: 'ok', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const loop = (await h.loop(loopId))!;
    expect(await getLoopPrState(h.host, loop)).toBe('open');
    expect(await mergeLoopPr(h.host, loop, 'squash')).toBe('merged');
    expect(h.git.merges).toEqual([{ prNumber: 1, method: 'squash' }]);
  });
});

describe('Phase 6 — isolation routing (D-06)', () => {
  it('forces background-worker for an isolated hybrid loop even with an idle session', async () => {
    const h = use(
      createHarness({
        runWorker: completingWorker(),
        session: { steer: () => ({ changedFiles: ['x'], diff: 'd' }) },
      }),
    );
    const loopId = await h.createLoop({
      executionMode: 'hybrid',
      hybridPolicy: 'prefer-active-session',
      isolation: 'worktree',
      checks: [{ type: 'command', command: 'ok', required: true }],
    });
    await h.coordinator.requestAction({ kind: 'run_next', loopId });

    const attempt = (await h.loop(loopId))?.attempts.at(-1);
    expect(attempt?.executionMode).toBe('background-worker');
    expect(attempt?.workdir.mode).toBe('worktree');
    expect(attempt?.routingReason).toMatch(/worktree/i);
  });

  it('drops worktree isolation for a fixed active-session loop at create (FR-24)', async () => {
    const h = use(createHarness());
    const loopId = await h.createLoop({ executionMode: 'active-session', isolation: 'worktree' });
    expect((await h.loop(loopId))?.isolation).toBeUndefined();
  });
});
