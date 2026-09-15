/**
 * Profile-local run and shared-activity journals (spec architect-run-observability).
 *
 * Layout, all under the active profile's Architect home:
 *
 *   runs/<projectId>/<runId>.journal.ndjson   append-only observations
 *   runs/<projectId>/<runId>.summary.json     one atomic checkpoint
 *   runs/<projectId>/shared.journal.ndjson    project-scoped shared activity
 *   runs/<projectId>/shared.summary.json
 *
 * Three properties matter and are enforced here, so callers never re-derive them:
 *
 * 1. An append that is interrupted leaves a final line without its newline. That
 *    tail is discarded and the journal is reported incomplete, never half-read.
 * 2. Replay is idempotent. A record at or below the checkpoint's sequence, or a
 *    cumulative report at or below its source watermark, is not applied twice.
 * 3. Reads are bounded. A page is capped by record count and by bytes, so opening
 *    a long run never loads its whole history.
 *
 * Nothing here decides what a record means. The caller folds records into the
 * summary through `checkpoint`, which is the only writer of a summary file.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const RUN_JOURNAL_VERSION = 1;

/** The shared-activity journal of a project. Reserved: never a run id. */
export const SHARED_JOURNAL_ID = 'shared';

/** The largest page a reader may ask for. */
export const MAX_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE = 200;

/** How many bytes of a journal one paged read will look at, from the end. */
export const MAX_READ_BYTES = 1_000_000;

export type JournalRecordKind = 'observation' | 'usage' | 'shared';

/**
 * One journal line. `key` identifies the logical fact, and `counter` carries a
 * source's running total when it reports cumulative values, so a repeated or
 * replayed report can be recognised without trusting arrival order.
 */
export interface JournalRecord {
  v: typeof RUN_JOURNAL_VERSION;
  /** Monotonic within one journal file. */
  seq: number;
  at: string;
  kind: JournalRecordKind;
  /** Stable producer identity, e.g. `subagent:<loop>/<step>` or `session:<id>`. */
  source?: string;
  /** Stable fact identity inside the source. */
  key?: string;
  /** A source's cumulative counter, when it reports running totals. */
  counter?: number;
  [field: string]: unknown;
}

export interface SourceWatermark {
  seq: number;
  counter?: number;
}

export interface RunSummary {
  v: typeof RUN_JOURNAL_VERSION;
  projectId: string;
  runId: string;
  /** Highest sequence folded in. Anything at or below it is already applied. */
  appliedThroughSeq: number;
  watermarks: Record<string, SourceWatermark>;
  /** Bounded running totals, so a reader never replays the journal to show them. */
  totals: {
    /** Null when nothing priced was observed. Never zero for "unknown". */
    costUsd: number | null;
    requests: number;
    toolCalls: number;
    retries: number;
    compactions: number;
    errors: number;
    openSpans: number;
  };
  /** True when a torn tail, a byte-capped read or a source gap left work unfolded. */
  incomplete: boolean;
  updatedAt: string;
}

export function emptyRunSummary(projectId: string, runId: string, now: string): RunSummary {
  return {
    v: RUN_JOURNAL_VERSION,
    projectId,
    runId,
    appliedThroughSeq: 0,
    watermarks: {},
    totals: { costUsd: null, requests: 0, toolCalls: 0, retries: 0, compactions: 0, errors: 0, openSpans: 0 },
    incomplete: false,
    updatedAt: now,
  };
}

/**
 * Whether one record still needs applying. A record at or below the folded
 * sequence is a replay; a cumulative report at or below its source watermark is
 * a repeated snapshot of the same usage.
 */
export function shouldApplyRecord(summary: RunSummary, record: JournalRecord): boolean {
  if (record.seq <= summary.appliedThroughSeq) return false;
  const mark = record.source ? summary.watermarks[record.source] : undefined;
  if (!mark) return true;
  if (record.counter === undefined || mark.counter === undefined) return true;
  return record.counter > mark.counter;
}

/** Advances the sequence and the source watermark for one applied record. */
export function applyRecord(summary: RunSummary, record: JournalRecord): RunSummary {
  const watermarks = { ...summary.watermarks };
  if (record.source) {
    const mark = watermarks[record.source];
    watermarks[record.source] = {
      seq: Math.max(mark?.seq ?? 0, record.seq),
      ...(record.counter !== undefined ? { counter: Math.max(mark?.counter ?? -Infinity, record.counter) } : {}),
    };
  }
  return { ...summary, appliedThroughSeq: Math.max(summary.appliedThroughSeq, record.seq), watermarks };
}

export interface JournalPage {
  records: JournalRecord[];
  /** Pass as `afterSeq` to read the next page. Null when this is the last page. */
  nextAfterSeq: number | null;
  /** True when a torn tail or a byte-capped read means the page is not complete history. */
  incomplete: boolean;
}

export interface ReadPageOptions {
  afterSeq?: number;
  limit?: number;
}

export interface RunJournalIo {
  appendFile(filePath: string, data: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(dirPath: string): Promise<void>;
  rm(dirPath: string): Promise<void>;
  statSize(filePath: string): Promise<number>;
  /** The final byte of a file, or an empty string when it is missing or empty. */
  readLastByte(filePath: string): Promise<string>;
  /** The last `bytes` of a file, so a long journal is never loaded whole. */
  readTail(filePath: string, bytes: number): Promise<string>;
}

export interface RunJournalDeps {
  /** The profile's Architect home. Every journal lives under it, so profiles stay apart. */
  homeDir: string;
  io?: Partial<RunJournalIo>;
}

const defaultIo: RunJournalIo = {
  appendFile: (filePath, data) => fs.appendFile(filePath, data, 'utf8'),
  readFile: (filePath) => fs.readFile(filePath, 'utf8'),
  writeFile: (filePath, data) => fs.writeFile(filePath, data, 'utf8'),
  rename: (from, to) => fs.rename(from, to),
  mkdir: async (dirPath) => { await fs.mkdir(dirPath, { recursive: true }); },
  rm: async (dirPath) => { await fs.rm(dirPath, { recursive: true, force: true }); },
  statSize: async (filePath) => (await fs.stat(filePath)).size,
  readLastByte: async (filePath) => {
    const handle = await fs.open(filePath, 'r');
    try {
      const { size } = await handle.stat();
      if (size === 0) return '';
      const buffer = Buffer.alloc(1);
      await handle.read(buffer, 0, 1, size - 1);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  },
  readTail: async (filePath, bytes) => {
    const handle = await fs.open(filePath, 'r');
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, bytes);
      if (length === 0) return '';
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  },
};

export interface AppendInput {
  kind: JournalRecordKind;
  at: string;
  source?: string;
  key?: string;
  counter?: number;
  [field: string]: unknown;
}

export interface RunJournal {
  /** Appends to a run's journal and returns the assigned sequence. */
  append(projectId: string, runId: string, input: AppendInput): Promise<number>;
  /** Appends project-scoped shared activity, which belongs to no single run. */
  appendShared(projectId: string, input: AppendInput): Promise<number>;
  readPage(projectId: string, journalId: string, options?: ReadPageOptions): Promise<JournalPage>;
  readSummary(projectId: string, journalId: string): Promise<RunSummary | null>;
  /**
   * Folds every not-yet-applied record into the summary and writes one atomic
   * checkpoint. `fold` sees each record exactly once, in sequence order.
   */
  checkpoint(
    projectId: string,
    journalId: string,
    fold: (record: JournalRecord, summary: RunSummary) => RunSummary,
    now: string,
  ): Promise<RunSummary>;
  /** Deletes everything this project kept, on the existing explicit deletion path. */
  removeProject(projectId: string): Promise<void>;
}

export function createRunJournal(deps: RunJournalDeps): RunJournal {
  const io: RunJournalIo = { ...defaultIo, ...deps.io };
  // A test io that fakes the file but not the tail read must not reach the disk.
  if (deps.io?.readFile && !deps.io.readTail) {
    io.readTail = async (filePath, bytes) => {
      const text = await io.readFile(filePath);
      return text.slice(Math.max(0, text.length - bytes));
    };
  }
  // One writer per file. Sequence allocation, torn-tail repair and the append
  // span several awaits, so two concurrent appends would otherwise share a
  // sequence and the fold would drop one of them as a replay.
  const writers = new Map<string, Promise<unknown>>();
  let tempCounter = 0;
  const serialized = <T>(filePath: string, task: () => Promise<T>): Promise<T> => {
    const previous = writers.get(filePath) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.then(() => undefined, () => undefined);
    writers.set(filePath, settled);
    void settled.then(() => { if (writers.get(filePath) === settled) writers.delete(filePath); });
    return next;
  };
  const projectDir = (projectId: string): string => path.join(deps.homeDir, 'runs', safeId(projectId));
  const journalPath = (projectId: string, journalId: string): string => path.join(projectDir(projectId), `${safeId(journalId)}.journal.ndjson`);
  const summaryPath = (projectId: string, journalId: string): string => path.join(projectDir(projectId), `${safeId(journalId)}.summary.json`);

  /** A journal id becomes a file name. Never let a caller walk out of the profile. */
  function safeId(value: string): string {
    const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_');
    if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error(`Unusable journal id: ${value}`);
    return cleaned;
  }

  function appendAt(projectId: string, journalId: string, input: AppendInput): Promise<number> {
    const filePath = journalPath(projectId, journalId);
    return serialized(filePath, async () => {
      await io.mkdir(projectDir(projectId));
      // A previous append that was cut short left a line without its newline. Close
      // that line first, so this record is never glued onto unreadable bytes.
      if (await hasTornTail(filePath)) await io.appendFile(filePath, '\n');
      const seq = (await lastSequence(filePath)) + 1;
      const record: JournalRecord = { v: RUN_JOURNAL_VERSION, seq, ...input };
      // One complete line per append: a reader can tell a torn tail from a record.
      await io.appendFile(filePath, `${JSON.stringify(record)}\n`);
      return seq;
    });
  }

  async function hasTornTail(filePath: string): Promise<boolean> {
    try {
      const last = await io.readLastByte(filePath);
      return last !== '' && last !== '\n';
    } catch {
      return false;
    }
  }

  async function lastSequence(filePath: string): Promise<number> {
    const page = await readPageAt(filePath, { afterSeq: 0, limit: 1, fromEnd: true });
    const last = page.records[page.records.length - 1];
    return last?.seq ?? 0;
  }

  /**
   * Reads from the end of a journal in bounded pages. A trailing line without a
   * newline is an interrupted append: it is dropped and reported.
   */
  async function readPageAt(
    filePath: string,
    options: ReadPageOptions & { fromEnd?: boolean },
  ): Promise<JournalPage> {
    const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
    const afterSeq = options.afterSeq ?? 0;
    let text: string;
    let capped = false;
    try {
      const size = await io.statSize(filePath);
      if (size > MAX_READ_BYTES) {
        capped = true;
        // Only the tail is read from disk, so a long history costs a page, not the file.
        text = await io.readTail(filePath, MAX_READ_BYTES);
        const firstBreak = text.indexOf('\n');
        text = firstBreak === -1 ? '' : text.slice(firstBreak + 1);
      } else {
        text = await io.readFile(filePath);
      }
    } catch {
      return { records: [], nextAfterSeq: null, incomplete: false };
    }

    const torn = text.length > 0 && !text.endsWith('\n');
    const lines = text.split('\n');
    if (torn) lines.pop();
    else lines.pop(); // the trailing empty string after the final newline
    const parsed: JournalRecord[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line) as JournalRecord;
        if (value?.v === RUN_JOURNAL_VERSION && typeof value.seq === 'number') parsed.push(value);
      } catch {
        // One unreadable line never invalidates the records around it.
        capped = true;
      }
    }
    // A capped read starts mid-file, so the sequence is not a contiguous prefix.
    const ordered = options.fromEnd ? parsed.slice(-limit) : parsed.filter((record) => record.seq > afterSeq).slice(0, limit);
    const last = ordered[ordered.length - 1];
    const more = !options.fromEnd && parsed.some((record) => record.seq > (last?.seq ?? afterSeq));
    return {
      records: ordered,
      nextAfterSeq: more ? (last?.seq ?? null) : null,
      incomplete: torn || capped,
    };
  }

  async function readSummaryAt(filePath: string): Promise<RunSummary | null> {
    try {
      const value = JSON.parse(await io.readFile(filePath)) as RunSummary;
      return value?.v === RUN_JOURNAL_VERSION ? value : null;
    } catch {
      return null;
    }
  }

  async function writeSummaryAt(filePath: string, summary: RunSummary): Promise<void> {
    await io.mkdir(path.dirname(filePath));
    tempCounter += 1;
    const temp = `${filePath}.tmp.${process.pid}.${Date.now()}.${tempCounter}`;
    await io.writeFile(temp, JSON.stringify(summary, null, 2));
    await io.rename(temp, filePath);
  }

  return {
    append: (projectId, runId, input) => appendAt(projectId, runId, input),
    appendShared: (projectId, input) => appendAt(projectId, SHARED_JOURNAL_ID, input),

    readPage(projectId, journalId, options = {}) {
      return readPageAt(journalPath(projectId, journalId), options);
    },

    readSummary(projectId, journalId) {
      return readSummaryAt(summaryPath(projectId, journalId));
    },

    checkpoint(projectId, journalId, fold, now) {
      const summaryFile = summaryPath(projectId, journalId);
      const journalFile = journalPath(projectId, journalId);
      // Serialized with appends on the same journal, so a checkpoint never
      // publishes a summary older than one written beside it.
      return serialized(journalFile, async () => {
      const current = (await readSummaryAt(summaryFile)) ?? emptyRunSummary(projectId, journalId, now);
      let next = current;
      let incomplete = false;
      let afterSeq = current.appliedThroughSeq;
      for (;;) {
        const page = await readPageAt(journalFile, { afterSeq, limit: MAX_PAGE_SIZE });
        incomplete = incomplete || page.incomplete;
        for (const record of page.records) {
          if (!shouldApplyRecord(next, record)) continue;
          next = applyRecord(fold(record, next), record);
        }
        if (page.nextAfterSeq === null) break;
        afterSeq = page.nextAfterSeq;
      }
      next = { ...next, projectId, runId: journalId, incomplete, updatedAt: now };
      if (next !== current) await writeSummaryAt(summaryFile, next);
      return next;
      });
    },

    async removeProject(projectId) {
      await io.rm(projectDir(projectId));
    },
  };
}
