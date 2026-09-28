/**
 * One-time conversion of the old `MEMORY.md` into unsorted global entries
 * (design D12). Runs at the first chat session start under a state lock, and
 * is safe to repeat after a stop at any step:
 *
 *   1–3. parse the source, skip "none" answers, write entries with stable ids
 *        into a temporary folder
 *   4.   check every source fact is in the converted entries, or stop
 *   5.   move the entries into `entries/unsorted/`
 *   6.   record the backup path, then rename `MEMORY.md` to it
 *   7.   remove the old QMD index and the old cron job
 *   8.   write the completion marker
 *
 * If `MEMORY.md` is gone but the recorded backup exists, the run repeats from
 * the backup. The daily and session folders are never touched.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { withStateLock } from '@sero-ai/extension-runtime';

import { resolveAgentDir } from './agent-dir';
import { todayStamp, type MemoryEntry } from './entry-format';
import { entriesDir, findEntry, globalLocation, readTrashedEntry, writeEntry, type ScopeLocation } from './entry-store';
import { findMissingFacts, parseLegacyMemory } from './legacy-memory';
import { error } from './logger';
import { getMemoryPath, resolveMemoryRoot } from './memory-manager';
import { resolveMemoryStatePath, resolveSeroHome } from './state-paths';

export type ConversionResult = 'done' | 'already-done' | 'failed-check';

/** Stable names of the previous plugin's cron job and search index. */
const OLD_CRON_JOB_NAME = 'memory-consolidation';
const OLD_QMD_INDEX_FILES = ['index.sqlite', 'index.sqlite-wal', 'index.sqlite-shm'];

interface ConversionState {
  backupPath?: string;
}

export const conversionPaths = {
  marker: () => resolveMemoryStatePath('conversion-done'),
  state: () => resolveMemoryStatePath('conversion.json'),
  temp: () => path.join(globalLocation().root, '.conversion-tmp'),
  source: () => getMemoryPath(resolveMemoryRoot()),
  cronState: () => path.join(resolveSeroHome(), 'apps', 'cron', 'state.json'),
  oldQmdIndexDir: () => path.join(resolveAgentDir(), 'cache', 'qmd'),
};

/** Test seam: lets a test stop the conversion after a named step. */
export type ConversionStep = 'temp-written' | 'moved-one' | 'moved' | 'state-written' | 'renamed' | 'qmd-removed' | 'cron-removed';
export type ConversionProbe = (step: ConversionStep) => void | Promise<void>;

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}

async function readState(): Promise<ConversionState> {
  try {
    return JSON.parse(await fs.readFile(conversionPaths.state(), 'utf8')) as ConversionState;
  } catch {
    return {};
  }
}

async function chooseBackupPath(source: string): Promise<string> {
  const base = `${source}.v2-backup`;
  if (!(await exists(base))) return base;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base}-${stamp}`;
}

function toEntry(item: { id: string; type: MemoryEntry['type']; text: string }): MemoryEntry {
  const today = todayStamp();
  return { id: item.id, type: item.type, scope: 'global', created: today, confirmed: today, replaces: [], terms: [], body: item.text };
}

/** An id already sorted or trashed must not be put back into `unsorted/`. */
async function isSortedElsewhere(location: ScopeLocation, id: string): Promise<boolean> {
  const found = await findEntry([location], id);
  if (found && found.delivery !== 'unsorted') return true;
  return (await readTrashedEntry(location, id)) !== null;
}

async function removeOldCronJob(): Promise<void> {
  const cronPath = conversionPaths.cronState();
  if (!(await exists(cronPath))) return;
  await withStateLock(cronPath, async () => {
    let state: { jobs?: Array<{ name?: string }> } & Record<string, unknown>;
    try {
      state = JSON.parse(await fs.readFile(cronPath, 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    if (!Array.isArray(state.jobs) || !state.jobs.some((job) => job?.name === OLD_CRON_JOB_NAME)) return;
    const next = { ...state, jobs: state.jobs.filter((job) => job?.name !== OLD_CRON_JOB_NAME) };
    await fs.writeFile(cronPath, JSON.stringify(next, null, 2), 'utf8');
  });
}

async function removeOldQmdIndex(): Promise<void> {
  const dir = conversionPaths.oldQmdIndexDir();
  await Promise.all(OLD_QMD_INDEX_FILES.map((name) => fs.rm(path.join(dir, name), { force: true })));
}

export function isConversionDone(): Promise<boolean> {
  return exists(conversionPaths.marker());
}

/** True when an old MEMORY.md was converted and its backup is recorded. */
export async function hasConvertedLegacyMemory(): Promise<boolean> {
  const { backupPath } = await readState();
  return Boolean(backupPath) && exists(backupPath!);
}

async function convertUnlocked(probe: ConversionProbe): Promise<ConversionResult> {
  if (await isConversionDone()) return 'already-done';

  const location = globalLocation();
  const sourcePath = conversionPaths.source();
  const state = await readState();
  const fromSource = await exists(sourcePath);
  const readPath = fromSource ? sourcePath : state.backupPath;
  const tempDir = conversionPaths.temp();
  await fs.rm(tempDir, { recursive: true, force: true });

  if (readPath && (fromSource || await exists(readPath))) {
    const content = await fs.readFile(readPath, 'utf8');
    const entries = parseLegacyMemory(content).map(toEntry);

    const tempLocation: ScopeLocation = { scope: 'global', root: tempDir };
    for (const entry of entries) await writeEntry(tempLocation, entry, 'unsorted');
    await probe('temp-written');

    const missing = findMissingFacts(content, entries.map((entry) => entry.body));
    if (missing.length > 0) {
      await fs.rm(tempDir, { recursive: true, force: true });
      await error('conversion_check_failed', { source: readPath, missing });
      return 'failed-check';
    }

    const targetDir = entriesDir(location, 'unsorted');
    await fs.mkdir(targetDir, { recursive: true });
    for (const entry of entries) {
      const tempFile = path.join(entriesDir(tempLocation, 'unsorted'), `${entry.id}.md`);
      if (await isSortedElsewhere(location, entry.id)) {
        await fs.rm(tempFile, { force: true });
      } else {
        await fs.rename(tempFile, path.join(targetDir, `${entry.id}.md`));
      }
      await probe('moved-one');
    }
    await fs.rm(tempDir, { recursive: true, force: true });
    await probe('moved');

    if (fromSource) {
      const backupPath = await chooseBackupPath(sourcePath);
      await fs.mkdir(path.dirname(conversionPaths.state()), { recursive: true });
      await fs.writeFile(conversionPaths.state(), JSON.stringify({ backupPath }, null, 2), 'utf8');
      await probe('state-written');
      await fs.rename(sourcePath, backupPath);
      await probe('renamed');
    }
  }

  await removeOldQmdIndex();
  await probe('qmd-removed');
  await removeOldCronJob();
  await probe('cron-removed');

  await fs.mkdir(path.dirname(conversionPaths.marker()), { recursive: true });
  await fs.writeFile(conversionPaths.marker(), `${new Date().toISOString()}\n`, 'utf8');
  return 'done';
}

let pending: Promise<ConversionResult> | null = null;

/**
 * Runs the conversion once per process at a time. Callers that need the
 * converted entries (the session snapshot) await the same promise.
 */
export function runConversion(probe: ConversionProbe = () => undefined): Promise<ConversionResult> {
  if (!pending) {
    pending = withStateLock(conversionPaths.state(), () => convertUnlocked(probe), { timeoutMs: 60_000 })
      .finally(() => { pending = null; });
  }
  return pending;
}
