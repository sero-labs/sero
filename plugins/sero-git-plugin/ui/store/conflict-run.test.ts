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

/**
 * Lets a test hold a write open. The timing bugs here all live in the window
 * between a write being sent and it landing, which is otherwise too short to
 * aim at.
 */
const writeDelay: { value: Promise<void> | undefined } = { value: undefined };
const writeStarted: string[] = [];
/** Ordered log of disk touches, so a test can assert what happened before what. */
const events: string[] = [];

vi.mock('../lib/sero-vcs', () => ({
  readWorkingTreeFile: (_ws: string, path: string) => {
    const contents = files.get(path);
    events.push(`read ${path}`);
    return contents === undefined
      ? Promise.reject(new Error(`no such file: ${path}`))
      : Promise.resolve(contents);
  },
  writeWorkingTreeFile: async (_ws: string, path: string, contents: string) => {
    writeStarted.push(path);
    // Captured now: releasing one write must not hold up the next.
    const held = writeDelay.value;
    if (held) await held;
    files.set(path, contents);
    events.push(`wrote ${path}`);
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
const restored: string[] = [];

function context(): RunContext {
  return {
    workspaceId: 'ws',
    toDiskPath: (path) => path,
    onStage: (path) => { staged.push(path); return Promise.resolve(); },
    // Stand-in for `git checkout --merge`, which rewrites the file with git's
    // own markers before our rebuilt version goes on top.
    onRestoreConflict: (path) => {
      restored.push(path);
      files.set(path, conflicted(['git wrote this', 'and this']));
      return Promise.resolve();
    },
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
    restored.length = 0;
    writeStarted.length = 0;
    writeDelay.value = undefined;
    events.length = 0;
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

  /**
   * Stop cannot recall a request already sent to the model, so the reply lands
   * on a run that is over. It used to be applied anyway: the file was written
   * and staged after Stop, which is the one thing Stop promises not to do.
   */
  it('drops a resolution that arrives after you stop', async () => {
    const original = conflicted(['one', 'two']);
    files.set('a.ts', original);
    let reply: ((outcome: ConflictOutcome) => void) | undefined;
    resolveConflictWithAi.mockImplementation(() => new Promise((resolve) => { reply = resolve; }));

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => reply !== undefined, 'the model to be asked');

    useConflictRun.getState().stop();
    reply!({ decision: 'resolve', content: 'too late', why: 'still thinking when you stopped' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(files.get('a.ts')).toBe(original);
    expect(staged).toEqual([]);
    expect(useConflictRun.getState().aiResolvedPaths).toEqual([]);
  });

  /**
   * The nastier half of the same bug: everything here is module-scoped, so a
   * straggler from the stopped run could splice its content into the file the
   * *new* run is working on, at an index that no longer means the same thing.
   */
  it('does not let a stopped run\'s late reply touch the next run', async () => {
    files.set('a.ts', conflicted(['one', 'two']));
    const replies: Array<(outcome: ConflictOutcome) => void> = [];
    resolveConflictWithAi.mockImplementation(() => new Promise((resolve) => { replies.push(resolve); }));

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => replies.length === 1, 'the first run to ask');
    useConflictRun.getState().stop();

    // A second run over the same file, which answers properly.
    resolveConflictWithAi.mockResolvedValue({ decision: 'resolve', content: 'the new run', why: 'clear' });
    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the second run to finish');

    // The abandoned first run finally replies.
    replies[0]!({ decision: 'resolve', content: 'the stale run', why: 'from a run that ended' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(files.get('a.ts')).toBe('the new run');
    expect(useConflictRun.getState().entries.map((entry) => entry.state)).toEqual(['done']);
  });

  /**
   * The window after the write. The write itself cannot be recalled, but
   * marking the file AI-resolved and staging it both can — and staging is git's
   * word for "this conflict is settled", which a stopped run has no business
   * saying.
   */
  it('does not stage or claim a file when you stop during the write', async () => {
    files.set('a.ts', conflicted(['one', 'two']));
    resolveConflictWithAi.mockResolvedValue({ decision: 'resolve', content: 'written', why: 'clear' });

    let releaseWrite: (() => void) | undefined;
    const slowWrite = new Promise<void>((resolve) => { releaseWrite = () => resolve(); });
    writeDelay.value = slowWrite;

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => releaseWrite !== undefined && writeStarted.length === 1, 'the write to begin');

    // Stop lands while the write is in the air, then the write completes.
    useConflictRun.getState().stop();
    releaseWrite!();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(staged).toEqual([]);
    expect(useConflictRun.getState().aiResolvedPaths).toEqual([]);
  });

  /**
   * A write already sent still lands. If the next run has read the file by
   * then, that straggler silently overwrites it — so a new run waits for the
   * previous one's writes before it reads anything.
   */
  it('waits for a stopped run\'s write before the next run reads the file', async () => {
    files.set('a.ts', conflicted(['one', 'two'], ['three', 'four']));
    // The first run resolves conflict 1 and is still writing it when you stop.
    resolveConflictWithAi.mockResolvedValue({ decision: 'resolve', content: 'first', why: 'clear' });

    let releaseWrite: (() => void) | undefined;
    writeDelay.value = new Promise<void>((resolve) => { releaseWrite = () => resolve(); });

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => releaseWrite !== undefined && writeStarted.length === 1, 'the write to begin');
    useConflictRun.getState().stop();

    // A second run starts while that write is still in the air, then it lands.
    writeDelay.value = undefined;
    resolveConflictWithAi.mockResolvedValue({ decision: 'resolve', content: 'second', why: 'clear' });
    useConflictRun.getState().start(context(), ['a.ts']);
    releaseWrite!();
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the second run to finish');

    // The ordering is the whole point, so assert on it rather than on the
    // contents, which a lucky interleaving could produce either way: the
    // straggler must land before the second run reads. The other way round it
    // drops back on top afterwards, putting the markers the second run had just
    // resolved back on disk.
    const staleWrite = events.indexOf('wrote a.ts');
    const secondRunRead = events.indexOf('read a.ts', events.indexOf('read a.ts') + 1);
    expect(staleWrite).toBeGreaterThan(-1);
    expect(secondRunRead).toBeGreaterThan(staleWrite);
    expect(files.get('a.ts')).not.toContain('<<<<<<<');
  });

  // Undo runs on a stopped run, so it cannot check "is the run live?" — but it
  // must still not rebuild files underneath a run that has since started.
  it('abandons an undo when a new run starts underneath it', async () => {
    const original = conflicted(['one', 'two']);
    files.set('a.ts', original);
    resolveConflictWithAi.mockResolvedValue({ decision: 'resolve', content: 'machine work', why: 'clear' });

    useConflictRun.getState().start(context(), ['a.ts']);
    await waitFor(() => useConflictRun.getState().status === 'finished', 'the first run');
    expect(files.get('a.ts')).toBe('machine work');

    // Undo is asked for, then a new run begins before it can write.
    useConflictRun.getState().undoAiResolutions();
    useConflictRun.getState().reset();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The undo let go rather than rewriting a file the reset disowned.
    expect(files.get('a.ts')).toBe('machine work');
    expect(restored).toEqual([]);
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
      () => restored.includes('a.ts'),
      'the undo to land',
    );

    const reverted = files.get('a.ts')!;
    expect(reverted).toContain('you chose this');
    expect(reverted).toContain('<<<<<<< HEAD');
    expect(useConflictRun.getState().aiResolvedPaths).toEqual([]);
    // Genuinely conflicted again, git's way — not unstaged into something git
    // reads as your own edit, which `merge --abort` would then preserve.
    expect(restored).toEqual(['a.ts']);
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
