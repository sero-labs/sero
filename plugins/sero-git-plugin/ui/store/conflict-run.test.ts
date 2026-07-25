/**
 * The AI resolution run (§7). The rules being pinned here are the ones the
 * design turns on, and each has a way of failing quietly:
 *
 * - a question must block its own file and nothing else;
 * - answers must reach the next conflict, because that forward carry is the
 *   whole argument for resolving automatically rather than reviewing one at a
 *   time;
 * - Stop must keep what was already resolved;
 * - Undo must take back the machine's work and leave yours.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConflictRun, type RunContext } from './conflict-run';
import type { ConflictOutcome, ConflictResolveInput } from './sero-bridge';

const files = new Map<string, string>();
const resolveConflictWithAi = vi.fn<(ws: string, input: ConflictResolveInput) => Promise<ConflictOutcome>>();

vi.mock('../lib/sero-vcs', () => ({
  readWorkingTreeFile: (_ws: string, path: string) => {
    const contents = files.get(path);
    return contents === undefined
      ? Promise.reject(new Error(`no such file: ${path}`))
      : Promise.resolve(contents);
  },
  writeWorkingTreeFile: (_ws: string, path: string, contents: string) => {
    files.set(path, contents);
    return Promise.resolve();
  },
}));

vi.mock('./sero-bridge', () => ({
  seroBridge: () => ({ vcs: { resolveConflictWithAi } }),
}));

function conflicted(...bodies: Array<[string, string]>): string {
  return bodies
    .map(([current, incoming]) => [
      '<<<<<<< HEAD', current, '=======', incoming, '>>>>>>> feat/x',
    ].join('\n'))
    .join('\n');
}

const staged: string[] = [];
const unstaged: string[] = [];

function context(): RunContext {
  return {
    workspaceId: 'ws',
    toDiskPath: (path) => path,
    onStage: (path) => { staged.push(path); return Promise.resolve(); },
    onUnstage: (path) => { unstaged.push(path); return Promise.resolve(); },
  };
}

/** The run is fire-and-forget, so tests wait on what it did rather than on it. */
async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

describe('the AI resolution run', () => {
  beforeEach(() => {
    useConflictRun.getState().reset();
    files.clear();
    staged.length = 0;
    unstaged.length = 0;
    resolveConflictWithAi.mockReset();
  });

  it('applies as it goes and stages a file with nothing left in it', async () => {
    files.set('a.ts', conflicted(['one', 'two'], ['three', 'four']));
    resolveConflictWithAi.mockImplementation((_ws, input) =>
      Promise.resolve({ decision: 'resolve', content: `resolved ${input.conflictNumber}`, why: 'because' }));

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');

    expect(files.get('a.ts')).toBe('resolved 1\nresolved 2');
    expect(staged).toEqual(['a.ts']);
    expect(useConflictRun.getState().aiResolvedPaths).toEqual(['a.ts']);
    expect(useConflictRun.getState().entries.map((entry) => entry.state)).toEqual(['done', 'done']);
  });

  // Staged is git's own definition of resolved, so a file with a conflict still
  // in it must not be staged — not even when the rest of it is done.
  it('does not stage a file that still has a conflict', async () => {
    files.set('a.ts', conflicted(['one', 'two'], ['three', 'four']));
    resolveConflictWithAi.mockImplementation((_ws, input) =>
      Promise.resolve(input.conflictNumber === 1
        ? { decision: 'resolve', content: 'done', why: 'because' }
        : { decision: 'decline', why: 'I cannot tell' }));

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');

    expect(staged).toEqual([]);
    expect(files.get('a.ts')).toContain('<<<<<<< HEAD');
    expect(files.get('a.ts')).toContain('done');
  });

  it('blocks the file that asked, and lets the others carry on', async () => {
    files.set('asks.ts', conflicted(['one', 'two']));
    files.set('quiet.ts', conflicted(['three', 'four']));
    resolveConflictWithAi.mockImplementation((_ws, input) =>
      Promise.resolve(input.path === 'asks.ts'
        ? {
          decision: 'ask',
          question: 'Which precision?',
          because: 'nothing settles it',
          options: [{ label: '4', detail: 'incoming', content: 'four' }],
        }
        : { decision: 'resolve', content: 'quietly resolved', why: 'obvious' }));

    useConflictRun.getState().start(context(), ['asks.ts', 'quiet.ts']);

    // The other file finished while the question is still sitting there.
    await waitFor(() => files.get('quiet.ts') === 'quietly resolved', 'the other file to finish');
    expect(useConflictRun.getState().status).toBe('running');
    const asked = useConflictRun.getState().entries.find((entry) => entry.state === 'asked');
    expect(asked?.question?.question).toBe('Which precision?');

    useConflictRun.getState().answer(asked!.id, { label: '4', detail: 'incoming', content: 'four' });
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');
    expect(files.get('asks.ts')).toBe('four');
  });

  // The thing a per-conflict review loop structurally cannot do.
  it('carries your answer forward to the next conflict', async () => {
    files.set('a.ts', conflicted(['one', 'two'], ['three', 'four']));
    resolveConflictWithAi.mockImplementation((_ws, input) =>
      Promise.resolve(input.conflictNumber === 1
        ? {
          decision: 'ask',
          question: 'Which precision?',
          because: '',
          options: [{ label: '4', detail: 'incoming', content: 'four' }],
        }
        : { decision: 'resolve', content: 'followed the answer', why: 'same precision below' }));

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(
      () => useConflictRun.getState().entries.some((entry) => entry.state === 'asked'),
      'the question',
    );
    const asked = useConflictRun.getState().entries.find((entry) => entry.state === 'asked')!;
    useConflictRun.getState().answer(asked.id, { label: '4', detail: 'incoming', content: 'four' });

    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');
    const second = resolveConflictWithAi.mock.calls.find(([, input]) => input.conflictNumber === 2)?.[1];
    expect(second?.answers).toEqual([{ question: 'Which precision?', answer: '4' }]);
  });

  // "Let me edit it": the markers stay, and the run does not claim it is done.
  it('leaves the conflict alone when the option has nothing to write', async () => {
    files.set('a.ts', conflicted(['one', 'two']));
    resolveConflictWithAi.mockResolvedValue({
      decision: 'ask',
      question: 'Which?',
      because: '',
      options: [{ label: 'Let me edit it', detail: '' }],
    });

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(
      () => useConflictRun.getState().entries.some((entry) => entry.state === 'asked'),
      'the question',
    );
    const asked = useConflictRun.getState().entries.find((entry) => entry.state === 'asked')!;
    useConflictRun.getState().answer(asked.id, { label: 'Let me edit it', detail: '' });

    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');
    expect(files.get('a.ts')).toContain('<<<<<<< HEAD');
    expect(staged).toEqual([]);
  });

  it('keeps what it had already resolved when you stop it', async () => {
    files.set('a.ts', conflicted(['one', 'two'], ['three', 'four']));
    resolveConflictWithAi.mockImplementation((_ws, input) => {
      if (input.conflictNumber === 1) {
        return Promise.resolve({ decision: 'resolve', content: 'kept', why: 'obvious' } as const);
      }
      // Still thinking when Stop arrives.
      return new Promise(() => {});
    });

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => files.get('a.ts')?.includes('kept') === true, 'the first resolution');

    useConflictRun.getState().stop();
    expect(useConflictRun.getState().status).toBe('stopped');
    expect(files.get('a.ts')).toContain('kept');
  });

  it('releases a file sitting on a question when you stop', async () => {
    files.set('a.ts', conflicted(['one', 'two']));
    resolveConflictWithAi.mockResolvedValue({
      decision: 'ask', question: 'Which?', because: '', options: [],
    });

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(
      () => useConflictRun.getState().entries.some((entry) => entry.state === 'asked'),
      'the question',
    );
    useConflictRun.getState().stop();
    expect(useConflictRun.getState().status).toBe('stopped');
  });

  it('undoes the machine\'s resolutions and leaves your answer alone', async () => {
    const original = conflicted(['one', 'two'], ['three', 'four']);
    files.set('a.ts', original);
    resolveConflictWithAi.mockImplementation((_ws, input) =>
      Promise.resolve(input.conflictNumber === 1
        ? { decision: 'resolve', content: 'the machine chose this', why: 'obvious' }
        : {
          decision: 'ask',
          question: 'Which?',
          because: '',
          options: [{ label: 'yours', detail: '', content: 'you chose this' }],
        }));

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(
      () => useConflictRun.getState().entries.some((entry) => entry.state === 'asked'),
      'the question',
    );
    const asked = useConflictRun.getState().entries.find((entry) => entry.state === 'asked')!;
    useConflictRun.getState().answer(asked.id, { label: 'yours', detail: '', content: 'you chose this' });
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');
    expect(files.get('a.ts')).toBe('the machine chose this\nyou chose this');

    useConflictRun.getState().undoAiResolutions();
    // Wait on the store, not the file: undo waits for git before it publishes,
    // so the contents change first and the assertions below would race it.
    await waitFor(
      () => useConflictRun.getState().unresolvedPaths.includes('a.ts'),
      'the undo to land',
    );

    const reverted = files.get('a.ts')!;
    expect(reverted).toContain('you chose this');
    expect(reverted).toContain('<<<<<<< HEAD');
    expect(useConflictRun.getState().aiResolvedPaths).toEqual([]);
    // It is conflicted again, so it must stop counting as resolved.
    expect(unstaged).toEqual(['a.ts']);
  });

  /**
   * Git takes one lock on the index. Two files resolving at once used to fire
   * two `git` commands together and the second died with "index.lock: File
   * exists" — during undo, which left a file looking resolved with its markers
   * back on disk.
   */
  it('never runs two git actions at once', async () => {
    files.set('a.ts', conflicted(['one', 'two']));
    files.set('b.ts', conflicted(['three', 'four']));
    files.set('c.ts', conflicted(['five', 'six']));
    resolveConflictWithAi.mockResolvedValue({ decision: 'resolve', content: 'ok', why: 'obvious' });

    let inFlight = 0;
    let overlapped = false;
    const ctx: RunContext = {
      ...context(),
      onStage: async (path) => {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        await new Promise((resolve) => setTimeout(resolve, 5));
        staged.push(path);
        inFlight -= 1;
      },
    };

    useConflictRun.getState().start(ctx, ['a.ts', 'b.ts', 'c.ts']);
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');

    expect(overlapped).toBe(false);
    expect(staged.sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('reports a file it cannot read instead of failing the run', async () => {
    files.set('fine.ts', conflicted(['one', 'two']));
    resolveConflictWithAi.mockResolvedValue({ decision: 'resolve', content: 'ok', why: 'obvious' });

    useConflictRun.getState().start(context(), ['missing.ts', 'fine.ts']);
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');

    const failed = useConflictRun.getState().entries.find((entry) => entry.state === 'failed');
    expect(failed?.path).toBe('missing.ts');
    expect(files.get('fine.ts')).toBe('ok');
  });

  // A malformed reply is a failed conflict, never a silent half-resolution.
  it('records a model failure without writing anything', async () => {
    const original = conflicted(['one', 'two']);
    files.set('a.ts', original);
    resolveConflictWithAi.mockRejectedValue(new Error('The model left conflict markers in its resolution.'));

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the run to finish');

    expect(files.get('a.ts')).toBe(original);
    expect(useConflictRun.getState().entries[0]).toMatchObject({
      state: 'failed',
      why: 'The model left conflict markers in its resolution.',
    });
  });
});
