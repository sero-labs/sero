/**
 * The automatic tidy-up (design D9). It runs in the background at chat session
 * start, for each scope whose last run was more than 7 days ago or that has
 * unsorted entries no run has seen, with no user review. It is safe with nobody watching:
 *
 *   - one run per scope at a time, across sessions (state lock)
 *   - one isolated completion; invalid output changes nothing
 *   - a workspace that Git would commit memory in is never sent to the model
 *   - merges write the new entry before the originals move to trash
 *   - a removal needs a missing file named by a workspace entry in its own workspace
 *   - a decision is dropped if an entry changed after the tidy-up read it
 *   - removals go to trash; every change and every dropped decision is logged
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Api, Model } from '@earendil-works/pi-ai';
import { acquireLock, stateLockPath, type IsolatedCompletionService } from '@sero-ai/extension-runtime';

import { isConversionDone } from './conversion';
import { newEntryId, todayStamp } from './entry-format';
import {
  globalLocation,
  listAllEntries,
  listEntries,
  moveEntry,
  trashEntry,
  workspaceLocation,
  writeEntry,
  type ScopeLocation,
  type StoredEntry,
} from './entry-store';
import { guardWorkspaceWrite } from './git-guard';
import { error, errorDetails } from './logger';
import { scanMemoryContent } from './memory-guards';
import { readMemorySettings } from './memory-settings';
import { recordMetric, resolveMetricsPath } from './metrics';
import { collectionsFor, refreshIndex } from './qmd-index';
import { enqueueWrite } from './registry';
import { resolveMemoryStatePath } from './state-paths';
import {
  buildTidyPrompt,
  resolveEvidencePath,
  TIDY_SYSTEM_PROMPT,
  validatePlan,
  type TidyDecision,
  type TidyEntryView,
} from './tidy-plan';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIDY_INTERVAL_MS = 7 * DAY_MS;
const RECHECK_AFTER_DAYS = 60;

export interface TidyDeps {
  workspaceRoot: string;
  model: Model<Api> | undefined;
  complete: IsolatedCompletionService;
  now?: Date;
}

export type TidyOutcome = 'not-due' | 'busy' | 'ran' | 'failed';

interface TidyState {
  lastRun?: string;
  /** Unsorted entries the last run sent to the model. They wait for the next interval. */
  unsortedSeen?: string[];
}

function stateKey(location: ScopeLocation): string {
  return location.scope === 'global' ? 'global' : collectionsFor(location).recall;
}

export function tidyStatePath(location: ScopeLocation): string {
  return resolveMemoryStatePath(`tidy-${stateKey(location)}.json`);
}

export function tidyLogPath(): string {
  return resolveMemoryStatePath('tidy-log.jsonl');
}

async function readTidyState(location: ScopeLocation): Promise<TidyState> {
  try {
    return JSON.parse(await fs.readFile(tidyStatePath(location), 'utf8')) as TidyState;
  } catch {
    return {};
  }
}

async function isDue(location: ScopeLocation, now: Date): Promise<boolean> {
  const { lastRun, unsortedSeen } = await readTidyState(location);
  if (location.scope === 'global') {
    // An entry the model kept unsorted, or a rejected sort, must not start a paid run at every session start.
    const seen = new Set(unsortedSeen ?? []);
    if ((await listEntries(location, 'unsorted')).some((entry) => !seen.has(entry.id))) return true;
  }
  if (lastRun && now.getTime() - Date.parse(lastRun) <= TIDY_INTERVAL_MS) return false;
  return (await listAllEntries(location)).length > 0;
}

async function recordRun(location: ScopeLocation, now: Date, sent: StoredEntry[]): Promise<void> {
  const state: TidyState = {
    lastRun: now.toISOString(),
    unsortedSeen: sent.filter((entry) => entry.delivery === 'unsorted').map((entry) => entry.id),
  };
  await fs.mkdir(path.dirname(tidyStatePath(location)), { recursive: true });
  await fs.writeFile(tidyStatePath(location), JSON.stringify(state), 'utf8');
}

async function logChange(location: ScopeLocation, record: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), scope: location.scope, root: location.root, ...record });
  await fs.mkdir(path.dirname(tidyLogPath()), { recursive: true });
  await fs.appendFile(tidyLogPath(), `${line}\n`, 'utf8');
  void recordMetric('tidy', { scope: location.scope, ...record });
}

function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function currentHash(entry: StoredEntry): Promise<string | null> {
  try {
    return hashOf(await fs.readFile(entry.path, 'utf8'));
  } catch {
    return null;
  }
}

/** Ids recalled in the last 60 days, read from the metrics files. */
async function recentlyRecalled(now: Date): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let day = 0; day < RECHECK_AFTER_DAYS; day++) {
    const file = resolveMetricsPath(new Date(now.getTime() - day * DAY_MS));
    const content = await fs.readFile(file, 'utf8').catch(() => '');
    for (const line of content.split('\n')) {
      if (!line.includes('"recall"')) continue;
      try {
        const event = JSON.parse(line) as { event?: string; ids?: string[] };
        if (event.event === 'recall') event.ids?.forEach((id) => ids.add(id));
      } catch { /* a torn line is skipped */ }
    }
  }
  return ids;
}

function toView(entry: StoredEntry, recalled: Set<string>, now: Date): TidyEntryView {
  const created = Date.parse(entry.created);
  const old = Number.isFinite(created) && now.getTime() - created > RECHECK_AFTER_DAYS * DAY_MS;
  return {
    id: entry.id,
    delivery: entry.delivery,
    type: entry.type,
    created: entry.created,
    confirmed: entry.confirmed,
    terms: entry.terms,
    body: entry.body,
    recheck: entry.delivery === 'on-match' && old && !recalled.has(entry.id),
  };
}

function idsOf(decision: TidyDecision): string[] {
  return decision.action === 'merge' ? decision.ids : [decision.id];
}

async function applyDecision(
  location: ScopeLocation,
  decision: TidyDecision,
  read: Map<string, { entry: StoredEntry; hash: string }>,
  pinnedCap: number,
  workspaceRoot: string,
): Promise<{ applied: boolean; detail: string }> {
  for (const id of idsOf(decision)) {
    const original = read.get(id)!;
    if (await currentHash(original.entry) !== original.hash) return { applied: false, detail: `${id} changed during the tidy-up` };
  }
  const pinnedNow = async () => (await listEntries(location, 'pinned')).length;

  switch (decision.action) {
    case 'keep':
    case 'recheck':
      return { applied: true, detail: 'no change' };
    case 'sort': {
      const delivery = decision.delivery === 'pinned' && await pinnedNow() >= pinnedCap ? 'on-match' : decision.delivery;
      const original = read.get(decision.id)!.entry;
      const updated = await writeEntry(location, { ...original, terms: decision.terms }, original.delivery);
      await moveEntry(location, updated, delivery);
      return { applied: true, detail: `sorted to ${delivery}` };
    }
    case 'merge': {
      const scanned = scanMemoryContent(decision.merged.body);
      if (scanned.action === 'block') return { applied: false, detail: `the merged text matches a blocked pattern (${scanned.reason ?? 'security pattern'})` };
      // The pinned originals leave the pinned set when the merge applies.
      const pinnedOriginals = decision.ids.filter((id) => read.get(id)!.entry.delivery === 'pinned').length;
      const delivery = decision.merged.delivery === 'pinned' && await pinnedNow() - pinnedOriginals >= pinnedCap ? 'on-match' : decision.merged.delivery;
      const today = todayStamp();
      const merged = await writeEntry(location, {
        id: newEntryId(),
        type: decision.merged.type,
        scope: location.scope,
        created: today,
        confirmed: today,
        replaces: decision.ids,
        terms: decision.merged.terms,
        body: scanned.content,
      }, delivery);
      // Written first: the originals move to trash only once the merged entry exists.
      for (const id of decision.ids) {
        await trashEntry(location, read.get(id)!.entry, `merged into ${merged.id}: ${decision.reason}`);
      }
      return { applied: true, detail: `merged into ${merged.id} (${delivery})` };
    }
    case 'remove': {
      const evidencePath = resolveEvidencePath(workspaceRoot, decision.missingPath);
      if (!evidencePath) return { applied: false, detail: 'the evidence is not a file path inside the workspace' };
      const missing = await isMissingInWorkspace(workspaceRoot, evidencePath);
      if (missing !== true) return { applied: false, detail: missing === false ? `${decision.missingPath} exists` : `${decision.missingPath} could not be checked` };
      await trashEntry(location, read.get(decision.id)!.entry, `${decision.missingPath} does not exist in the workspace: ${decision.reason}`);
      return { applied: true, detail: `removed: ${decision.missingPath} does not exist` };
    }
  }
}

/**
 * True only when the file is gone: walking from the workspace root, a folder
 * or the file itself does not exist (ENOENT) and no step before it is a link.
 * Null when a link is on the way or a check fails, which is never evidence.
 */
async function isMissingInWorkspace(workspaceRoot: string, filePath: string): Promise<boolean | null> {
  const root = path.resolve(workspaceRoot);
  let current = root;
  for (const part of path.relative(root, filePath).split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) return null;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === 'ENOENT' ? true : null;
    }
  }
  return false;
}

async function runLocked(location: ScopeLocation, deps: TidyDeps, now: Date): Promise<TidyOutcome> {
  if (!(await isDue(location, now))) return 'not-due';
  // Before the model call: a blocked workspace must not pay for a completion it cannot apply.
  if (location.scope === 'workspace') {
    const guard = await guardWorkspaceWrite(deps.workspaceRoot);
    if (!guard.ok) {
      await logChange(location, { decision: 'blocked', applied: false, reason: guard.reason });
      return 'failed';
    }
  }
  const entries = await listAllEntries(location);
  const read = new Map<string, { entry: StoredEntry; hash: string }>();
  for (const entry of entries) {
    const hash = await currentHash(entry);
    if (hash) read.set(entry.id, { entry, hash });
  }
  const recalled = await recentlyRecalled(now);
  const views = new Map([...read.values()].map(({ entry }) => [entry.id, toView(entry, recalled, now)]));
  const pinnedCap = readMemorySettings().pinnedCaps[location.scope];
  const workspaceRoot = location.scope === 'workspace' ? deps.workspaceRoot : undefined;

  const output = await deps.complete({
    cwd: deps.workspaceRoot,
    model: deps.model!,
    systemPrompt: TIDY_SYSTEM_PROMPT,
    prompt: buildTidyPrompt(location.scope, [...views.values()], pinnedCap, workspaceRoot),
  });

  let plan;
  try {
    plan = validatePlan(output, views, location.scope, workspaceRoot);
  } catch (err) {
    await logChange(location, { decision: 'invalid-output', applied: false, reason: err instanceof Error ? err.message : String(err) });
    // Recorded as a run, so invalid output does not repeat the paid call at every session start.
    await recordRun(location, now, [...read.values()].map(({ entry }) => entry));
    return 'failed';
  }
  for (const rejected of plan.rejected) {
    await logChange(location, { decision: 'rejected', applied: false, reason: rejected.reason, proposal: rejected.decision });
  }

  await enqueueWrite(async () => {
    for (const decision of plan.decisions) {
      const result = await applyDecision(location, decision, read, pinnedCap, deps.workspaceRoot);
      await logChange(location, {
        decision: decision.action,
        ids: idsOf(decision),
        applied: result.applied,
        evidence: decision.action === 'remove' ? decision.missingPath : undefined,
        reason: decision.reason,
        detail: result.detail,
      });
    }
    await refreshIndex(location);
  });

  await recordRun(location, now, [...read.values()].map(({ entry }) => entry));
  return 'ran';
}

/** Runs the tidy-up for one scope if it is due and no other session is running it. */
export async function runTidyIfDue(location: ScopeLocation, deps: TidyDeps): Promise<TidyOutcome> {
  const now = deps.now ?? new Date();
  if (!deps.model) return 'not-due';
  if (location.scope === 'global' && !(await isConversionDone())) return 'not-due';
  if (!(await isDue(location, now))) return 'not-due';

  let release: () => Promise<void>;
  try {
    await fs.mkdir(path.dirname(tidyStatePath(location)), { recursive: true });
    release = await acquireLock(stateLockPath(tidyStatePath(location)), { timeoutMs: 50 });
  } catch {
    return 'busy';
  }
  try {
    return await runLocked(location, deps, now);
  } finally {
    await release();
  }
}

/** Starts the tidy-up for the global scope and the session's workspace, in the background. */
export function startTidyUp(deps: TidyDeps): void {
  for (const location of [globalLocation(), workspaceLocation(deps.workspaceRoot)]) {
    void runTidyIfDue(location, deps).catch((err) => error('tidy_failed', { scope: location.scope, ...errorDetails(err) }));
  }
}
