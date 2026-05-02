import {
  readFile,
  getIdentityPath,
  getMemoryPath,
  getScratchpadPath,
  getTargetUsage,
  getUserPath,
  statFile,
} from './memory-manager';
import { formatScratchpadForInjection, getOpenScratchpadItems } from './scratchpad';
import { isQmdAvailable, searchRelevantMemories } from './qmd';
import { formatRankedResults } from './retrieval';
import {
  buildFingerprint,
  clearCache,
  consumeCache,
  mergeCachedResults,
  storeTurnResults,
} from './prefetch';
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
import { recordHits, sortByScore } from './memory-scoring';
import type { MemorySnapshotMode } from './memory-config';

const BUDGET_IDENTITY = 1_000;
const BUDGET_USER = 1_000;
const BUDGET_SCRATCHPAD = 1_500;
const BUDGET_SEARCH = 2_500;
const BUDGET_MEMORY = 1_600;
const BUDGET_TOTAL = 7_600;

interface FrozenPrioritySnapshot {
  identitySection: string;
  userSection: string;
  memorySection: string;
}

const frozenSnapshots = new Map<string, FrozenPrioritySnapshot>();

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
  target: 'memory' | 'identity' | 'user' | 'scratchpad';
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

async function buildScratchpadSection(root: string): Promise<string> {
  const openScratchpadItems = await getOpenScratchpadItems();
  if (openScratchpadItems.length === 0) return '';

  const scratchpadPath = getScratchpadPath(root);
  const scratchpadContent = await readFile(scratchpadPath);
  if (!scratchpadContent?.trim()) return '';

  return buildManagedBlock({
    label: 'SCRATCHPAD.md',
    path: scratchpadPath,
    target: 'scratchpad',
    visibleContent: formatScratchpadForInjection(openScratchpadItems),
    usageContent: scratchpadContent,
    budget: BUDGET_SCRATCHPAD,
    truncateMode: 'start',
    entryCount: openScratchpadItems.length,
  });
}

async function buildSearchSection(prompt: string, sessionId?: string): Promise<string> {
  const skipSearch = process.env.SERO_MEMORY_NO_SEARCH === '1';
  if (skipSearch || !isQmdAvailable() || !prompt) return '';

  const { formatted, results: freshResults } = await searchRelevantMemories(prompt);
  const currentFingerprint = buildFingerprint(prompt);

  let mergedFormatted = formatted;
  if (sessionId) {
    const cached = consumeCache(sessionId);
    if (cached && freshResults.length > 0) {
      const merged = mergeCachedResults(freshResults, cached, currentFingerprint, 3);
      if (merged.length > freshResults.length) {
        mergedFormatted = formatRankedResults(merged);
      }
    }
    if (freshResults.length > 0) {
      storeTurnResults(sessionId, prompt, freshResults, currentFingerprint);
    }
  }

  if (!mergedFormatted.trim()) return '';

  const truncated = truncateStart(`## Relevant memories (auto-retrieved)\n\n${mergedFormatted}`, BUDGET_SEARCH);

  const memoryHitIds = freshResults.flatMap((r) => {
    const text = r.content?.toString() ?? '';
    const ids: string[] = [];
    const regex = /<!-- id: (mem-[a-f0-9]+) -->/gi;
    let match;
    while ((match = regex.exec(text)) !== null) ids.push(match[1]!);
    return ids;
  });
  if (memoryHitIds.length > 0) {
    recordHits(memoryHitIds).catch(() => {});
  }

  return [truncated.text, truncated.notice ? `\n\n${truncated.notice}` : ''].join('').trim();
}

async function buildMemorySection(root: string): Promise<string> {
  const memoryPath = getMemoryPath(root);
  const memoryContent = await readFile(memoryPath);
  if (!memoryContent?.trim()) return '';

  const memoryEntries = parseMemoryEntries(memoryContent);
  if (memoryEntries.length > 0) {
    const scoredEntries = await sortByScore(memoryEntries);
    const truncated = truncateMemoryByType(scoredEntries, BUDGET_MEMORY);
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

async function getOrCreateFrozenSnapshot(root: string, sessionId: string): Promise<FrozenPrioritySnapshot> {
  const cached = frozenSnapshots.get(sessionId);
  if (cached) return cached;

  const snapshot: FrozenPrioritySnapshot = {
    identitySection: await buildIdentitySection(root),
    userSection: await buildUserSection(root),
    memorySection: await buildMemorySection(root),
  };
  frozenSnapshots.set(sessionId, snapshot);
  return snapshot;
}

export function clearPriorityContextCache(sessionId: string): void {
  frozenSnapshots.delete(sessionId);
  clearCache(sessionId);
}

/**
 * Result of building priority context with search results separated out.
 * `staticContext` goes into the system prompt.
 * `searchContext` can be injected as a per-turn message (if auto-retrieve is on).
 */
export interface PriorityContextResult {
  /** Static memory sections (IDENTITY, USER, SCRATCHPAD, MEMORY.md) for the system prompt. */
  staticContext: string;
  /** Dynamic QMD search results for the current prompt. Empty if no results or QMD unavailable. */
  searchContext: string;
}

export interface BuildPriorityContextOptions {
  /** When false, skip prompt-specific QMD retrieval entirely. */
  includeSearch?: boolean;
}

/**
 * Build priority context with search results returned separately.
 *
 * Use this when you need to inject static context into the system prompt
 * and optionally send search results as a per-turn message.
 */
export async function buildPriorityContextSplit(
  root: string,
  prompt: string,
  sessionId?: string,
  snapshotMode: MemorySnapshotMode = 'live',
  options: BuildPriorityContextOptions = {},
): Promise<PriorityContextResult> {
  const staticSections: string[] = [];
  let totalChars = 0;

  function addSection(section: string): void {
    if (!section.trim()) return;
    if (totalChars + section.length > BUDGET_TOTAL) return;
    staticSections.push(section);
    totalChars += section.length;
  }

  const frozenSnapshot = snapshotMode === 'frozen' && sessionId
    ? await getOrCreateFrozenSnapshot(root, sessionId)
    : null;

  addSection(frozenSnapshot?.identitySection ?? await buildIdentitySection(root));
  addSection(frozenSnapshot?.userSection ?? await buildUserSection(root));
  addSection(await buildScratchpadSection(root));
  addSection(frozenSnapshot?.memorySection ?? await buildMemorySection(root));

  const searchSection = options.includeSearch === false
    ? ''
    : await buildSearchSection(prompt, sessionId);

  const staticContext = staticSections.length > 0
    ? `\n\n## Memory\n\n${staticSections.join('\n\n---\n\n')}`
    : '';

  return { staticContext, searchContext: searchSection };
}

/**
 * Build the full priority context as a single string.
 * Combines static memory + search results.
 * Used by tests and as a compatibility wrapper.
 */
export async function buildPriorityContext(
  root: string,
  prompt: string,
  sessionId?: string,
  snapshotMode: MemorySnapshotMode = 'live',
): Promise<string> {
  const { staticContext, searchContext } = await buildPriorityContextSplit(root, prompt, sessionId, snapshotMode);
  if (!staticContext && !searchContext) return '';
  if (!searchContext) return staticContext;
  // Append search results after the static sections
  return staticContext
    ? `${staticContext}\n\n---\n\n${searchContext}`
    : `\n\n## Memory\n\n${searchContext}`;
}
