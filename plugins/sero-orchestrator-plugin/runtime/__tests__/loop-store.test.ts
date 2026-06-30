import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import { createLoopStore } from '../loop-store';
import { toSummary } from '../store';
import type { Loop, LoopRun } from '../../shared/types';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

let dir: string;
let writes: string[];

/** Minimal AppRuntimeContext whose appState read/update hit real files in `dir`. */
function makeCtx(): AppRuntimeContext {
  const appState = {
    read: async (file: string) => {
      try {
        return JSON.parse(await readFile(file, 'utf8'));
      } catch {
        return null;
      }
    },
    update: async (file: string, updater: (current: unknown) => unknown) => {
      writes.push(file);
      let current: unknown = null;
      try {
        current = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        /* missing — fine */
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
  };
  return { stateFilePath: path.join(dir, 'state.json'), host: { appState } } as unknown as AppRuntimeContext;
}

function loopFixture(id: string): Loop {
  return seedActiveLoop(createFakeHost(), oneStepPlan().plan, id);
}

function runFixture(id: string): LoopRun {
  return {
    id, runNumber: 1, status: 'completed', startedStepIds: ['step-1'],
    stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: 't',
  };
}

const rel = (file: string) => path.relative(dir, file);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'orch-store-'));
  writes = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loop store persistence', () => {
  it('writes a stripped loop.json (no history) plus the index and run index', async () => {
    const store = createLoopStore(makeCtx());
    await store.updateState((s) => ({ ...s, loops: [...s.loops, loopFixture('loop-x')] }));
    expect(JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8')).loops.map((l: { id: string }) => l.id)).toEqual(['loop-x']);
    const loopJson = JSON.parse(await readFile(path.join(dir, 'loops/loop-x/loop.json'), 'utf8'));
    expect(loopJson.id).toBe('loop-x');
    expect(loopJson.runs).toEqual([]); // run history is not kept in loop.json
    expect(existsSync(path.join(dir, 'loops/loop-x/runs/index.json'))).toBe(true);
  });

  it('migrates a legacy state.json into split files and backs it up', async () => {
    await writeFile(path.join(dir, 'state.json'), JSON.stringify({ version: 1, loops: [loopFixture('loop-x')] }));
    const store = createLoopStore(makeCtx());
    const state = await store.readState();
    expect(state.loops.map((l) => l.id)).toEqual(['loop-x']);
    expect(existsSync(path.join(dir, 'loops/loop-x/loop.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'loops/loop-x/runs/index.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'index.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'state.json'))).toBe(false); // renamed to backup
    expect(existsSync(path.join(dir, 'state.json.pre-split-backup'))).toBe(true);
  });

  it('migrates a legacy loop.json that still inlines runs into split run files on read', async () => {
    const loop = { ...loopFixture('loop-x'), runs: [runFixture('run-1')] };
    await mkdir(path.join(dir, 'loops/loop-x'), { recursive: true });
    await writeFile(path.join(dir, 'index.json'), JSON.stringify({ version: 1, loops: [toSummary(loop)] }));
    await writeFile(path.join(dir, 'loops/loop-x/loop.json'), JSON.stringify(loop));

    const state = await createLoopStore(makeCtx()).readState();
    expect(state.loops[0].runs.map((r) => r.id)).toEqual(['run-1']); // reassembled from inline
    expect(existsSync(path.join(dir, 'loops/loop-x/runs/run-1.json'))).toBe(true); // migrated to its own file
    expect(JSON.parse(await readFile(path.join(dir, 'loops/loop-x/loop.json'), 'utf8')).runs).toEqual([]); // stripped
  });

  it('rewrites only the changed loop file when one of several loops changes', async () => {
    const store = createLoopStore(makeCtx());
    await store.updateState((s) => ({ ...s, loops: [loopFixture('loop-a'), loopFixture('loop-b')] }));
    writes = []; // reset after the initial write
    await store.updateState((s) => ({
      ...s,
      loops: s.loops.map((l) => (l.id === 'loop-a' ? { ...l, status: 'disabled' as const, updatedAt: 'later' } : l)),
    }));
    const touched = writes.map(rel);
    expect(touched).toContain('loops/loop-a/loop.json');
    expect(touched).not.toContain('loops/loop-b/loop.json'); // untouched loop is never rewritten
    expect(touched).toContain('index.json'); // status changed → index refreshed
  });

  it('writes a new run to its own file without rewriting loop.json or the index', async () => {
    const store = createLoopStore(makeCtx());
    await store.updateState((s) => ({ ...s, loops: [loopFixture('loop-a')] }));
    writes = [];
    // Only run history changes — config, runtime, and summary are identical.
    await store.updateState((s) => ({
      ...s,
      loops: s.loops.map((l) => (l.id === 'loop-a' ? { ...l, runs: [...l.runs, runFixture('run-1')] } : l)),
    }));
    const touched = writes.map(rel);
    expect(touched).toContain('loops/loop-a/runs/run-1.json'); // the run lands in its own file
    expect(touched).toContain('loops/loop-a/runs/index.json'); // run index refreshed
    expect(touched).not.toContain('loops/loop-a/loop.json'); // config/runtime unchanged → not rewritten
    expect(touched).not.toContain('index.json'); // summary unchanged
  });

  it('removes the loop folder on deletion', async () => {
    const store = createLoopStore(makeCtx());
    await store.updateState((s) => ({ ...s, loops: [loopFixture('loop-a'), loopFixture('loop-b')] }));
    await store.updateState((s) => ({ ...s, loops: s.loops.filter((l) => l.id !== 'loop-b') }));
    expect(existsSync(path.join(dir, 'loops/loop-a/loop.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'loops/loop-b'))).toBe(false);
  });
});
