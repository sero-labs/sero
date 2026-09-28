/**
 * The session snapshot (design D5): the memory part of a chat session's system
 * prompt. It is built once per session and rebuilt only at compaction, so the
 * prompt stays byte-identical between those points and the prompt cache holds.
 *
 *   1. IDENTITY.md and USER.md
 *   2. pinned global and workspace entries, within the caps
 *   3. unsorted legacy entries, until the tidy-up sorts them
 *   4. open scratchpad items
 *   5. short memory instructions
 */

import { runConversion } from './conversion';
import { globalLocation, listEntries, workspaceLocation, type StoredEntry } from './entry-store';
import { error, errorDetails } from './logger';
import { stripManagedFileMetadata } from './memory-format';
import { getMemoryInstructions } from './memory-instructions';
import { getIdentityPath, getMemoryPath, getUserPath, readFile, resolveMemoryRoot } from './memory-manager';
import { readMemorySettings } from './memory-settings';
import { recordMetric } from './metrics';
import { readScratchpad } from './scratchpad';
import { getCavemanPromptAddition } from './caveman';

/** How an entry appears in the prompt: id first, so the agent can replace or unpin it. */
export function formatEntryLine(entry: Pick<StoredEntry, 'id' | 'type' | 'body'>): string {
  return `- [${entry.id}] (${entry.type}) ${entry.body.replace(/\s+/g, ' ').trim()}`;
}

function newestFirst(entries: StoredEntry[]): StoredEntry[] {
  return [...entries].sort((a, b) => b.confirmed.localeCompare(a.confirmed) || a.id.localeCompare(b.id));
}

function section(title: string, body: string): string {
  return body.trim() ? `### ${title}\n\n${body.trim()}` : '';
}

/** `MEMORY.md` content with its id comments removed, for a conversion that has not finished. */
function legacyBlock(content: string): string {
  return stripManagedFileMetadata(content)
    .replace(/\s*<!--\s*id:\s*mem-[a-z0-9-]+\s*-->/gi, '')
    .replace(/^# Memory\s*$/m, '')
    .trim();
}

export interface SnapshotCounts {
  pinnedGlobal: number;
  pinnedWorkspace: number;
  unsorted: number;
  scratchpadOpen: number;
}

export interface Snapshot {
  text: string;
  counts: SnapshotCounts;
}

/** Builds the memory addition for a chat session in `workspaceRoot`. Waits for the one-time conversion. */
export async function buildSnapshot(workspaceRoot: string): Promise<Snapshot> {
  await runConversion().catch((err) => error('conversion_failed', errorDetails(err)));

  const root = resolveMemoryRoot();
  const caps = readMemorySettings().pinnedCaps;
  const [identity, user, legacy, pinnedGlobal, pinnedWorkspace, unsorted, scratchpad] = await Promise.all([
    readFile(getIdentityPath(root)),
    readFile(getUserPath(root)),
    readFile(getMemoryPath(root)),
    listEntries(globalLocation(), 'pinned'),
    listEntries(workspaceLocation(workspaceRoot), 'pinned'),
    listEntries(globalLocation(), 'unsorted'),
    readScratchpad(workspaceRoot),
  ]);

  const globalShown = newestFirst(pinnedGlobal).slice(0, caps.global);
  const workspaceShown = newestFirst(pinnedWorkspace).slice(0, caps.workspace);
  const open = scratchpad.filter((item) => !item.done);
  // A conversion that stopped leaves MEMORY.md in place; its facts stay visible.
  const unsortedBody = legacy?.trim()
    ? legacyBlock(legacy)
    : unsorted.map(formatEntryLine).join('\n');

  const sections = [
    section('Identity (IDENTITY.md)', identity ? stripManagedFileMetadata(identity) : ''),
    section('User (USER.md)', user ? stripManagedFileMetadata(user) : ''),
    section('Pinned memories (global)', globalShown.map(formatEntryLine).join('\n')),
    section('Pinned memories (this workspace)', workspaceShown.map(formatEntryLine).join('\n')),
    section('Unsorted memories', unsortedBody ? `Older memories that are not sorted yet. Treat them like pinned memories.\n\n${unsortedBody}` : ''),
    section('Open scratchpad items (this workspace)', open.map((item) => `- ${item.text}`).join('\n')),
  ].filter(Boolean);

  const memory = sections.length > 0 ? `\n\n## Memory\n\n${sections.join('\n\n')}` : '';
  const counts: SnapshotCounts = {
    pinnedGlobal: globalShown.length,
    pinnedWorkspace: workspaceShown.length,
    unsorted: legacy?.trim() ? -1 : unsorted.length,
    scratchpadOpen: open.length,
  };
  return {
    text: memory + getMemoryInstructions() + getCavemanPromptAddition(user ?? ''),
    counts,
  };
}

/** Records the snapshot's size for the baseline report. */
export function recordSnapshotMetric(sessionId: string, counts: SnapshotCounts): void {
  void recordMetric('snapshot', { session: sessionId, ...counts });
}
