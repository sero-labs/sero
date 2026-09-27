/**
 * Static memory context for the system prompt: IDENTITY.md, USER.md and
 * MEMORY.md. Captured once per session so the system prompt stays
 * byte-identical across turns and provider prompt caching keeps hitting.
 * Mid-session memory writes appear in the next session.
 */

import {
  readFile,
  getIdentityPath,
  getMemoryPath,
  getTargetUsage,
  getUserPath,
  statFile,
} from './memory-manager';
import {
  formatMemoryEntry,
  formatShortTimestamp,
  HIGH_PRIORITY_TYPES,
  LOW_PRIORITY_TYPES,
  parseMemoryEntries,
  renderMemoryForRead,
  stripEntryIdComments,
  stripManagedFileMetadata,
  type MemoryEntry,
} from './memory-format';

const BUDGET_IDENTITY = 1_000;
const BUDGET_USER = 1_000;
const BUDGET_MEMORY = 1_600;
const BUDGET_TOTAL = 7_600;

interface FrozenPrioritySnapshot {
  identitySection: string;
  userSection: string;
  memorySection: string;
}

const frozenSnapshots = new Map<string, Promise<FrozenPrioritySnapshot>>();

function truncateStart(text: string, maxChars: number): { text: string; notice: string } {
  if (text.length <= maxChars) return { text, notice: '' };
  const notice = `_[truncated: showing ${Math.min(maxChars, text.length)} of ${text.length} chars]_`;
  return { text: text.slice(0, maxChars), notice };
}

function truncateMemoryByType(entries: MemoryEntry[], maxChars: number): { text: string; notice: string } {
  const allLines = entries.map((e) => stripEntryIdComments(formatMemoryEntry(e)));
  const fullText = allLines.join('\n');
  if (fullText.length <= maxChars) return { text: fullText, notice: '' };

  const high: string[] = [];
  const normal: string[] = [];
  const low: string[] = [];
  for (const entry of entries) {
    const line = stripEntryIdComments(formatMemoryEntry(entry));
    if (HIGH_PRIORITY_TYPES.has(entry.type)) high.push(line);
    else if (LOW_PRIORITY_TYPES.has(entry.type)) low.push(line);
    else normal.push(line);
  }

  const selected: string[] = [];
  let chars = 0;
  for (const line of [...high, ...normal, ...low]) {
    const nextChars = chars + line.length + (selected.length > 0 ? 1 : 0);
    if (nextChars > maxChars) break;
    selected.push(line);
    chars = nextChars;
  }

  const dropped = entries.length - selected.length;
  const notice = dropped > 0
    ? `_[type-prioritised truncation: showing ${selected.length} of ${entries.length} entries]_`
    : '';
  return { text: selected.join('\n'), notice };
}

function truncateMiddle(text: string, maxChars: number): { text: string; notice: string } {
  if (text.length <= maxChars) return { text, notice: '' };
  const marker = '\n\n... (truncated) ...\n\n';
  const keep = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return {
    text: text.slice(0, head) + marker + text.slice(text.length - tail),
    notice: `_[middle-truncated: showing ${Math.min(maxChars, text.length)} of ${text.length} chars]_`,
  };
}

async function buildManagedBlock(options: {
  label: string;
  path: string;
  target: 'memory' | 'identity' | 'user';
  visibleContent: string;
  usageContent?: string;
  budget: number;
  truncateMode: 'start' | 'middle';
  entryCount?: number;
}): Promise<string> {
  const stat = await statFile(options.path);
  const usage = getTargetUsage(options.target, options.usageContent ?? options.visibleContent);
  const updated = stat ? formatShortTimestamp(stat.mtime) : 'unknown';
  const entrySuffix = options.entryCount != null ? ` (${options.entryCount} entries)` : '';
  const header = `### ${options.label} [${usage.percent}% — ${usage.chars}/${usage.max} chars] (updated: ${updated})${entrySuffix}`;
  const truncated = options.truncateMode === 'middle'
    ? truncateMiddle(options.visibleContent.trim(), options.budget)
    : truncateStart(options.visibleContent.trim(), options.budget);

  const parts = [header];
  if (truncated.notice) parts.push('', truncated.notice);
  if (truncated.text.trim()) parts.push('', truncated.text.trim());
  return parts.join('\n');
}

async function buildIdentitySection(root: string): Promise<string> {
  const identityPath = getIdentityPath(root);
  const identityContent = await readFile(identityPath);
  if (!identityContent?.trim()) return '';
  return buildManagedBlock({
    label: 'IDENTITY.md',
    path: identityPath,
    target: 'identity',
    visibleContent: stripManagedFileMetadata(identityContent),
    budget: BUDGET_IDENTITY,
    truncateMode: 'start',
  });
}

async function buildUserSection(root: string): Promise<string> {
  const userPath = getUserPath(root);
  const userContent = await readFile(userPath);
  if (!userContent?.trim()) return '';
  return buildManagedBlock({
    label: 'USER.md',
    path: userPath,
    target: 'user',
    visibleContent: stripManagedFileMetadata(userContent),
    budget: BUDGET_USER,
    truncateMode: 'start',
  });
}


async function buildMemorySection(root: string): Promise<string> {
  const memoryPath = getMemoryPath(root);
  const memoryContent = await readFile(memoryPath);
  if (!memoryContent?.trim()) return '';

  const memoryEntries = parseMemoryEntries(memoryContent);
  if (memoryEntries.length > 0) {
    const truncated = truncateMemoryByType(memoryEntries, BUDGET_MEMORY);
    const stat = await statFile(memoryPath);
    const usage = getTargetUsage('memory', memoryContent);
    const updated = stat ? formatShortTimestamp(stat.mtime) : 'unknown';
    const header = `### MEMORY.md [${usage.percent}% — ${usage.chars}/${usage.max} chars] (updated: ${updated}) (${memoryEntries.length} entries)`;
    const parts = [header];
    if (truncated.notice) parts.push('', truncated.notice);
    if (truncated.text.trim()) parts.push('', truncated.text.trim());
    return parts.join('\n');
  }

  return buildManagedBlock({
    label: 'MEMORY.md',
    path: memoryPath,
    target: 'memory',
    visibleContent: renderMemoryForRead(memoryContent, false),
    budget: BUDGET_MEMORY,
    truncateMode: 'middle',
    entryCount: 0,
  });
}

async function buildSnapshot(root: string): Promise<FrozenPrioritySnapshot> {
  return {
    identitySection: await buildIdentitySection(root),
    userSection: await buildUserSection(root),
    memorySection: await buildMemorySection(root),
  };
}

/**
 * The build promise is stored before it resolves, so a clear during the build
 * removes it and the finished build cannot re-insert a stale snapshot.
 */
function getOrCreateFrozenSnapshot(root: string, sessionId: string): Promise<FrozenPrioritySnapshot> {
  const cached = frozenSnapshots.get(sessionId);
  if (cached) return cached;

  const snapshot = buildSnapshot(root);
  frozenSnapshots.set(sessionId, snapshot);
  snapshot.catch(() => {
    if (frozenSnapshots.get(sessionId) === snapshot) frozenSnapshots.delete(sessionId);
  });
  return snapshot;
}

export function clearPriorityContextCache(sessionId: string): void {
  frozenSnapshots.delete(sessionId);
}

/**
 * Build the memory block for the system prompt. With a session id the
 * sections are frozen for that session; without one they are read fresh.
 */
export async function buildPriorityContext(root: string, sessionId?: string): Promise<string> {
  const snapshot = sessionId
    ? await getOrCreateFrozenSnapshot(root, sessionId)
    : await buildSnapshot(root);

  const sections: string[] = [];
  let totalChars = 0;
  for (const section of [snapshot.identitySection, snapshot.userSection, snapshot.memorySection]) {
    if (!section.trim()) continue;
    if (totalChars + section.length > BUDGET_TOTAL) continue;
    sections.push(section);
    totalChars += section.length;
  }

  return sections.length > 0 ? `\n\n## Memory\n\n${sections.join('\n\n---\n\n')}` : '';
}
