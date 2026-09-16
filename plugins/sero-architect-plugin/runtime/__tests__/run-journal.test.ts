/**
 * Run and shared-activity journals (spec architect-run-observability).
 *
 * The journal is the durable half of run observability: an append-only record
 * per run, one atomic summary checkpoint, and paged reads that never load a
 * whole history. These tests pin the four properties the runtime depends on.
 */

import { appendFile, mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_PAGE_SIZE,
  MAX_READ_BYTES,
  createRunJournal,
  emptyRunSummary,
  type JournalRecord,
  type RunSummary,
} from '../run-journal';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function harness() {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-journal-'));
  dirs.push(homeDir);
  return { homeDir, journal: createRunJournal({ homeDir }) };
}

/** Folds observations into the bounded totals the summary keeps. */
function fold(record: JournalRecord, summary: RunSummary): RunSummary {
  const cost = typeof record.costUsd === 'number' ? record.costUsd : 0;
  const priced = typeof record.costUsd === 'number';
  return {
    ...summary,
    totals: {
      ...summary.totals,
      costUsd: priced ? (summary.totals.costUsd ?? 0) + cost : summary.totals.costUsd,
      requests: summary.totals.requests + (record.kind === 'observation' && record.spanKind === 'request' ? 1 : 0),
      toolCalls: summary.totals.toolCalls + (record.kind === 'observation' && record.spanKind === 'tool' ? 1 : 0),
    },
  };
}

describe('run journal', () => {
  it('appends monotonically and folds each record into one atomic checkpoint', async () => {
    const { homeDir, journal } = await harness();
    const first = await journal.append('proj', 'run-1', { kind: 'observation', at: 'T1', spanKind: 'request', costUsd: 0.04 });
    const second = await journal.append('proj', 'run-1', { kind: 'observation', at: 'T2', spanKind: 'tool' });
    expect([first, second]).toEqual([1, 2]);

    const summary = await journal.checkpoint('proj', 'run-1', fold, 'T3');
    expect(summary.totals).toMatchObject({ costUsd: 0.04, requests: 1, toolCalls: 1 });
    expect(summary.appliedThroughSeq).toBe(2);
    expect(summary.incomplete).toBe(false);

    // The checkpoint is a real file next to the journal, and no temp file survives.
    const projectDir = path.join(homeDir, 'runs', 'proj');
    expect((await readdir(projectDir)).sort()).toEqual(['run-1.journal.ndjson', 'run-1.summary.json']);
    expect(JSON.parse(await readFile(path.join(projectDir, 'run-1.summary.json'), 'utf8'))).toMatchObject({ runId: 'run-1', appliedThroughSeq: 2 });
  });

  it('is idempotent: a replay applies nothing twice', async () => {
    const { homeDir, journal } = await harness();
    await journal.append('proj', 'run-1', { kind: 'observation', at: 'T1', spanKind: 'request', costUsd: 0.04, source: 'subagent:a', key: 'span-1' });
    await journal.append('proj', 'run-1', { kind: 'observation', at: 'T2', spanKind: 'request', costUsd: 0.06, source: 'subagent:a', key: 'span-2' });
    const first = await journal.checkpoint('proj', 'run-1', fold, 'T3');
    const second = await journal.checkpoint('proj', 'run-1', fold, 'T4');
    const third = await journal.checkpoint('proj', 'run-1', fold, 'T5');
    expect(first.totals.costUsd).toBeCloseTo(0.1);
    expect(second.totals).toEqual(first.totals);
    expect(third.totals).toEqual(first.totals);

    // The same journal bytes restored after a restart still apply nothing new.
    const summaryFile = path.join(homeDir, 'runs', 'proj', 'run-1.summary.json');
    const saved = await readFile(summaryFile, 'utf8');
    await writeFile(summaryFile, saved);
    const afterRestart = await journal.checkpoint('proj', 'run-1', fold, 'T6');
    expect(afterRestart.totals).toEqual(first.totals);
  });

  it('ignores a repeated cumulative usage report from the same source', async () => {
    const { journal } = await harness();
    // A cumulative source reports 0.10 and then the same snapshot again.
    await journal.append('proj', 'run-1', { kind: 'usage', at: 'T1', source: 'subagent:a', counter: 1_000, costUsd: 0.1 });
    await journal.append('proj', 'run-1', { kind: 'usage', at: 'T2', source: 'subagent:a', counter: 1_000, costUsd: 0.1 });
    // Then it advances.
    await journal.append('proj', 'run-1', { kind: 'usage', at: 'T3', source: 'subagent:a', counter: 2_500, costUsd: 0.15 });
    const summary = await journal.checkpoint('proj', 'run-1', fold, 'T4');
    expect(summary.totals.costUsd).toBeCloseTo(0.25);
    expect(summary.watermarks['subagent:a']).toEqual({ seq: 3, counter: 2_500 });
  });

  it('drops an interrupted final record and reports the history incomplete', async () => {
    const { homeDir, journal } = await harness();
    await journal.append('proj', 'run-1', { kind: 'observation', at: 'T1', spanKind: 'request', costUsd: 0.04, key: 'span-1' });
    // A power cut mid-append: the durable bytes end without the record's newline.
    await appendFile(path.join(homeDir, 'runs', 'proj', 'run-1.journal.ndjson'), '{"v":1,"seq":2,"at":"T2","kind":"observation"', 'utf8');

    const page = await journal.readPage('proj', 'run-1');
    expect(page.records.map((record) => record.seq)).toEqual([1]);
    expect(page.incomplete).toBe(true);

    const summary = await journal.checkpoint('proj', 'run-1', fold, 'T3');
    expect(summary.totals.costUsd).toBeCloseTo(0.04);
    expect(summary.incomplete).toBe(true);

    // A later complete append is read normally and clears the torn tail.
    await journal.append('proj', 'run-1', { kind: 'observation', at: 'T4', spanKind: 'tool', key: 'span-3' });
    const healed = await journal.checkpoint('proj', 'run-1', fold, 'T5');
    expect(healed.totals.toolCalls).toBe(1);
  });

  it('reads bounded pages and never returns more records than asked for', async () => {
    const { homeDir, journal } = await harness();
    // Append behavior is covered above. Seed the read fixture in one write.
    const records: JournalRecord[] = Array.from({ length: 700 }, (_, index) => ({
      v: 1, seq: index + 1, kind: 'observation', at: `T${index}`, key: `span-${index}`,
    }));
    const projectDir = path.join(homeDir, 'runs', 'proj');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'run-1.journal.ndjson'), records.map((record) => JSON.stringify(record)).join('\n') + '\n');
    const first = await journal.readPage('proj', 'run-1', { limit: 50 });
    expect(first.records).toHaveLength(50);
    expect(first.nextAfterSeq).toBe(50);

    const second = await journal.readPage('proj', 'run-1', { afterSeq: first.nextAfterSeq ?? 0, limit: 50 });
    expect(second.records.map((record) => record.seq)).toEqual(Array.from({ length: 50 }, (_, i) => 51 + i));

    // A caller cannot ask for an unbounded page.
    const huge = await journal.readPage('proj', 'run-1', { limit: 100_000 });
    expect(huge.records.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);

    // Paging to the end terminates.
    let after = 0;
    let pages = 0;
    for (;;) {
      const page = await journal.readPage('proj', 'run-1', { afterSeq: after, limit: MAX_PAGE_SIZE });
      pages += 1;
      if (page.nextAfterSeq === null) break;
      after = page.nextAfterSeq;
      if (pages > 20) throw new Error('paging did not terminate');
    }
    expect(pages).toBe(2);
  });

  it('keeps profiles apart and refuses a journal id that could leave the profile', async () => {
    const first = await harness();
    const second = await harness();
    await first.journal.append('proj', 'run-1', { kind: 'observation', at: 'T1', key: 'only-in-first' });

    expect((await first.journal.readPage('proj', 'run-1')).records).toHaveLength(1);
    expect((await second.journal.readPage('proj', 'run-1')).records).toHaveLength(0);

    await expect(first.journal.append('proj', '../../escape', { kind: 'observation', at: 'T1' })).resolves.toBeTypeOf('number');
    await expect(first.journal.append('../../outside', 'run-1', { kind: 'observation', at: 'T1' })).resolves.toBeTypeOf('number');
    // A traversal id is flattened to a name inside the profile, never a path out.
    expect(await readFile(path.join(path.dirname(first.homeDir), 'escape.journal.ndjson'), 'utf8').catch(() => null)).toBeNull();
  });

  it('keeps shared activity in one project-scoped journal', async () => {
    const { journal } = await harness();
    await journal.appendShared('proj', { kind: 'shared', at: 'T1', source: 'owner:wake-1', counter: 0.058, costUsd: 0.058 });
    await journal.appendShared('proj', { kind: 'shared', at: 'T2', source: 'owner:wake-1', counter: 0.058, costUsd: 0.058 });
    const summary = await journal.checkpoint('proj', 'shared', fold, 'T3');
    expect(summary.totals.costUsd).toBeCloseTo(0.058);
    expect((await journal.readPage('proj', 'shared')).records).toHaveLength(2);
  });

  it('starts from an empty summary when a project has no journal yet', async () => {
    const { journal } = await harness();
    expect(await journal.readSummary('proj', 'run-1')).toBeNull();
    const summary = await journal.checkpoint('proj', 'run-1', fold, 'T1');
    expect(summary).toEqual(emptyRunSummary('proj', 'run-1', 'T1'));
  });
});

describe('one writer per journal', () => {
  it('gives concurrent appends distinct, contiguous sequences', async () => {
    const { journal } = await harness();
    const seqs = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      journal.append('p', 'r', { kind: 'observation', at: '2026-09-15T10:00:00.000Z', key: `k${index}` })));
    expect(new Set(seqs).size).toBe(12);
    const page = await journal.readPage('p', 'r', { limit: 50 });
    expect(page.records.map((record) => record.seq)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });

  it('reads only the tail of a long journal, never the whole file', async () => {
    const { homeDir } = await harness();
    const file = path.join(homeDir, 'runs', 'p', 'r.journal.ndjson');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '');
    const line = (seq: number) => `${JSON.stringify({ v: 1, seq, kind: 'observation', at: '2026-09-15T10:00:00.000Z', key: `k${seq}`, pad: 'x'.repeat(180) })}\n`;
    let seq = 0;
    while ((await stat(file)).size <= MAX_READ_BYTES + line(0).length) {
      const chunk: string[] = [];
      for (let index = 0; index < 500; index += 1) { seq += 1; chunk.push(line(seq)); }
      await appendFile(file, chunk.join(''));
    }
    const journal = createRunJournal({
      homeDir,
      io: {
        readFile: async () => { throw new Error('the whole journal was read'); },
        readTail: async (filePath, bytes) => {
          const handle = await open(filePath, 'r');
          try {
            const { size } = await handle.stat();
            const length = Math.min(size, bytes);
            const buffer = Buffer.alloc(length);
            await handle.read(buffer, 0, length, size - length);
            return buffer.toString('utf8');
          } finally {
            await handle.close();
          }
        },
      },
    });
    const page = await journal.readPage('p', 'r', { limit: 5 });
    expect(page.records).toHaveLength(5);
    expect(page.incomplete).toBe(true);
    // The next append sits after the last record on disk, found from the tail alone.
    expect(await journal.append('p', 'r', { kind: 'observation', at: '2026-09-15T10:00:00.000Z', key: 'late' })).toBe(seq + 1);
  });
});
