/**
 * Consolidation helpers — batch building, prompt construction, entry filtering.
 *
 * Extracted from consolidation.ts to keep file size under 500 LOC.
 */

import {
  generateEntryId,
  normalizeLegacyMemory,
  normalizeWhitespace,
  nowTimestamp,
  parseMemoryEntries,
  serializeMemoryEntries,
  type MemoryEntry,
} from './memory-format';
import { getCapacityForTarget, getTargetUsage } from './memory-manager';
import { checkForDuplicateEntries, scanMemoryContent } from './memory-guards';

// ── Types ──────────────────────────────────────────────────────

export interface DailyLogCandidate {
  date: string;
  filePath: string;
  content: string;
}

export interface DailyLogBatch {
  logs: DailyLogCandidate[];
  chars: number;
}

export const MAX_BATCH_CHARS = 48_000;
export const MAX_BATCH_LOGS = 8;

const ALLOWED_TYPES = new Set([
  'fact', 'decision', 'preference', 'lesson', 'question', 'hypothesis',
]);

// ── Batching ───────────────────────────────────────────────────

export function buildDailyLogBatches(logs: DailyLogCandidate[]): DailyLogBatch[] {
  const batches: DailyLogBatch[] = [];
  let current: DailyLogBatch = { logs: [], chars: 0 };

  for (const log of logs) {
    const candidateChars = current.chars + log.content.length;
    if (
      current.logs.length > 0
      && (candidateChars > MAX_BATCH_CHARS || current.logs.length >= MAX_BATCH_LOGS)
    ) {
      batches.push(current);
      current = { logs: [], chars: 0 };
    }
    current.logs.push(log);
    current.chars += log.content.length;
  }

  if (current.logs.length > 0) {
    batches.push(current);
  }

  return batches;
}

// ── Prompt ─────────��───────────────────────────────────────────

export function buildConsolidationPrompt(memoryEntries: MemoryEntry[], batch: DailyLogBatch): string {
  const memoryLines = memoryEntries.length > 0
    ? memoryEntries.map((entry) => `- [${entry.type}] ${entry.text}`).join('\n')
    : '(empty)';
  const logSections = batch.logs
    .map((log) => [`## ${log.date}`, log.content.trim()].join('\n'))
    .join('\n\n');

  return [
    'Review these daily logs and extract only durable long-term memory worth storing.',
    'Allowed types: fact, decision, preference, lesson, question, hypothesis.',
    'Skip ephemeral todos, one-off commands, transient stack traces, and details already captured in memory.',
    'Each entry must be a single line in this exact format:',
    '§ [decision] Chose Clerk over Auth.js for auth',
    'Do not include headings, numbering, or HTML comments.',
    '',
    '<existing-memory>',
    memoryLines,
    '</existing-memory>',
    '',
    '<daily-logs>',
    logSections,
    '</daily-logs>',
  ].join('\n');
}

// ── Candidate normalisation ────────��───────────────────────────

function normalizeType(type: string): string {
  const normalized = type.toLowerCase();
  return ALLOWED_TYPES.has(normalized) ? normalized : 'fact';
}

export function normalizeCandidateEntries(raw: string): MemoryEntry[] {
  if (!raw.trim()) return [];
  const parsed = parseMemoryEntries(raw);
  const entries = parsed.length > 0 ? parsed : normalizeLegacyMemory(raw);
  return entries
    .map((entry) => ({
      ...entry,
      id: entry.id || generateEntryId(),
      hasId: true,
      type: normalizeType(entry.type),
      text: normalizeWhitespace(entry.text),
    }))
    .filter((entry) => Boolean(entry.text));
}

// ── Filtering & capacity ───────��───────────────────────────────

export function filterNovelEntries(
  existingEntries: MemoryEntry[],
  candidates: MemoryEntry[],
): { entries: MemoryEntry[]; duplicates: number } {
  const novelEntries: MemoryEntry[] = [];
  let duplicates = 0;

  for (const candidate of candidates) {
    const scan = scanMemoryContent(candidate.text);
    if (scan.action === 'block') {
      duplicates++;
      continue;
    }

    const text = normalizeWhitespace(scan.content);
    if (!text) continue;

    const comparisonEntries = [...existingEntries, ...novelEntries];
    const duplicate = checkForDuplicateEntries(comparisonEntries, text);
    if (duplicate.exactMatch || duplicate.nearMatch) {
      duplicates++;
      continue;
    }

    novelEntries.push({
      ...candidate,
      id: candidate.id || generateEntryId(),
      hasId: true,
      text,
    });
  }

  return { entries: novelEntries, duplicates };
}

export function appendEntriesWithinCapacity(
  existingEntries: MemoryEntry[],
  candidates: MemoryEntry[],
): { nextEntries: MemoryEntry[]; appended: number; dropped: number } {
  const nextEntries = [...existingEntries];
  let appended = 0;
  let dropped = 0;
  const maxChars = getCapacityForTarget('memory');

  for (const candidate of candidates) {
    const nextContent = serializeMemoryEntries([...nextEntries, candidate], nowTimestamp());
    if (getTargetUsage('memory', nextContent).chars > maxChars) {
      dropped++;
      continue;
    }
    nextEntries.push(candidate);
    appended++;
  }

  return { nextEntries, appended, dropped };
}
