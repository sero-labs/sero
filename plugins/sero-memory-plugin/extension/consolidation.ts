import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { complete, type Message } from '@mariozechner/pi-ai';

import { format } from 'date-fns';
import {
  appendFile,
  ensureDirectories,
  getCapacityForTarget,
  getDailyDir,
  getMemoryPath,
  getTargetUsage,
  readFile,
  resolveMemoryRoot,
  todayStr,
  writeFile,
} from './memory-manager';
import {
  hasMemoryV2Marker,
  normalizeLegacyMemory,
  nowTimestamp,
  parseMemoryEntries,
  serializeMemoryEntries,
  type MemoryEntry,
} from './memory-format';
import { error, errorDetails, info } from './logger';
import {
  appendEntriesWithinCapacity,
  buildConsolidationPrompt,
  buildDailyLogBatches,
  filterNovelEntries,
  normalizeCandidateEntries,
  type DailyLogCandidate,
} from './consolidation-helpers';
import { runQmdUpdateNow } from './qmd';

export type ConsolidationTrigger = 'manual' | 'cron' | 'auto';

export interface ConsolidationSummary {
  changed: boolean;
  processedLogs: number;
  addedEntries: number;
  duplicateEntries: number;
  droppedForCapacity: number;
  message: string;
}

const CONSOLIDATED_MARKER_REGEX = /<!--\s*consolidated:\s*[^>]+-->/i;

function buildMessages(prompt: string): Message[] {
  return [{
    role: 'user',
    content: [{ type: 'text', text: prompt }],
    timestamp: Date.now(),
  }];
}

async function completeConsolidationPrompt(
  ctx: ExtensionContext,
  prompt: string,
  trigger: ConsolidationTrigger,
): Promise<string> {
  if (!ctx.model) {
    throw new Error('Memory consolidation requires an active model.');
  }

  const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
  if (!apiKey) {
    throw new Error('No API key available for the active model.');
  }

  const response = await complete(
    ctx.model,
    {
      systemPrompt: [
        'You curate durable long-term markdown memory from noisy work logs.',
        'Only keep facts that remain useful after the session ends.',
        'Output only structured memory lines and nothing else.',
      ].join('\n'),
      messages: buildMessages(prompt),
    },
    { apiKey, reasoningEffort: trigger === 'manual' ? 'medium' : 'low' },
  );

  return response.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

async function loadStructuredMemory(root: string): Promise<MemoryEntry[]> {
  const filePath = getMemoryPath(root);
  const content = await readFile(filePath);
  if (!content?.trim()) return [];

  const parsed = parseMemoryEntries(content);
  if (parsed.length > 0 && parsed.every((entry) => entry.hasId) && hasMemoryV2Marker(content)) {
    return parsed;
  }

  const entries = parsed.length > 0 ? parsed : normalizeLegacyMemory(content);
  if (entries.length === 0) return [];

  const normalized = serializeMemoryEntries(entries, nowTimestamp());
  await writeFile(filePath, normalized);
  return parseMemoryEntries(normalized);
}

async function listPendingDailyLogs(root: string): Promise<DailyLogCandidate[]> {
  const today = todayStr();
  const dailyDir = getDailyDir(root);
  let entries: string[] = [];

  try {
    entries = await fs.readdir(dailyDir);
  } catch {
    return [];
  }

  const files = entries
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort();

  const logs: DailyLogCandidate[] = [];
  for (const file of files) {
    const date = file.replace(/\.md$/, '');
    if (date >= today) continue;

    const filePath = path.join(dailyDir, file);
    const content = await readFile(filePath);
    if (!content?.trim()) continue;
    if (CONSOLIDATED_MARKER_REGEX.test(content)) continue;

    logs.push({ date, filePath, content });
  }

  return logs;
}

function appendConsolidatedMarker(content: string, stamp: string): string {
  if (CONSOLIDATED_MARKER_REGEX.test(content)) return content;
  const trimmed = content.trimEnd();
  return `${trimmed}\n\n<!-- consolidated: ${stamp} -->\n`;
}

async function markLogsConsolidated(logs: DailyLogCandidate[], stamp: string): Promise<void> {
  for (const log of logs) {
    await writeFile(log.filePath, appendConsolidatedMarker(log.content, stamp));
  }
}

async function appendAuditNote(
  root: string,
  trigger: ConsolidationTrigger,
  summary: Pick<ConsolidationSummary, 'processedLogs' | 'addedEntries' | 'duplicateEntries' | 'droppedForCapacity'>,
): Promise<void> {
  if (summary.processedLogs === 0 && summary.addedEntries === 0) return;

  const title = trigger === 'cron' ? '## Memory Consolidation (auto)' : '## Memory Consolidation';
  const lines = [
    title,
    `- Trigger: ${trigger}`,
    `- Processed daily logs: ${summary.processedLogs}`,
    `- New MEMORY.md entries: ${summary.addedEntries}`,
  ];

  if (summary.duplicateEntries > 0) {
    lines.push(`- Skipped duplicate candidates: ${summary.duplicateEntries}`);
  }
  if (summary.droppedForCapacity > 0) {
    lines.push(`- Deferred for capacity: ${summary.droppedForCapacity}`);
  }

  await appendFile(path.join(getDailyDir(root), `${todayStr()}.md`), lines.join('\n'));
}

function buildSummaryMessage(summary: Omit<ConsolidationSummary, 'message'>): string {
  if (summary.processedLogs === 0 && summary.addedEntries === 0) {
    return 'No unprocessed daily logs were ready to consolidate.';
  }

  const lines = [
    `Processed ${summary.processedLogs} daily log${summary.processedLogs === 1 ? '' : 's'}.`,
    summary.addedEntries > 0
      ? `Added ${summary.addedEntries} new entr${summary.addedEntries === 1 ? 'y' : 'ies'} to MEMORY.md.`
      : 'No new durable entries were added to MEMORY.md.',
  ];

  if (summary.duplicateEntries > 0) {
    lines.push(`Skipped ${summary.duplicateEntries} duplicate or near-duplicate candidates.`);
  }
  if (summary.droppedForCapacity > 0) {
    lines.push(`Stopped early because MEMORY.md is at capacity (${summary.droppedForCapacity} candidate${summary.droppedForCapacity === 1 ? '' : 's'} deferred).`);
  }

  return lines.join('\n');
}

export async function runMemoryConsolidation(
  ctx: ExtensionContext,
  trigger: ConsolidationTrigger = 'manual',
): Promise<ConsolidationSummary> {
  const root = resolveMemoryRoot();
  await ensureDirectories(root);

  const pendingLogs = await listPendingDailyLogs(root);
  info('memory_consolidation_start', {
    trigger,
    pendingLogs: pendingLogs.length,
  });

  if (pendingLogs.length === 0) {
    return {
      changed: false,
      processedLogs: 0,
      addedEntries: 0,
      duplicateEntries: 0,
      droppedForCapacity: 0,
      message: 'No unprocessed daily logs were ready to consolidate.',
    };
  }

  const batches = buildDailyLogBatches(pendingLogs);
  let memoryEntries = await loadStructuredMemory(root);
  let processedLogs = 0;
  let addedEntries = 0;
  let duplicateEntries = 0;
  let droppedForCapacity = 0;
  const stamp = nowTimestamp();
  let changed = false;
  const logsToMark: DailyLogCandidate[] = [];

  for (const batch of batches) {
    const prompt = buildConsolidationPrompt(memoryEntries, batch);
    const raw = await completeConsolidationPrompt(ctx, prompt, trigger);
    const normalized = normalizeCandidateEntries(raw);
    const filtered = filterNovelEntries(memoryEntries, normalized);
    duplicateEntries += filtered.duplicates;

    if (filtered.entries.length === 0) {
      logsToMark.push(...batch.logs);
      processedLogs += batch.logs.length;
      continue;
    }

    const appended = appendEntriesWithinCapacity(memoryEntries, filtered.entries);
    if (appended.appended > 0) {
      memoryEntries = appended.nextEntries;
      await writeFile(getMemoryPath(root), serializeMemoryEntries(memoryEntries, stamp));
      changed = true;
      addedEntries += appended.appended;
    }

    if (appended.dropped > 0) {
      droppedForCapacity += appended.dropped;
      break;
    }

    logsToMark.push(...batch.logs);
    processedLogs += batch.logs.length;
  }

  if (logsToMark.length > 0) {
    await markLogsConsolidated(logsToMark, stamp);
    changed = true;
  }

  await appendAuditNote(root, trigger, {
    processedLogs,
    addedEntries,
    duplicateEntries,
    droppedForCapacity,
  });

  if (changed) {
    await runQmdUpdateNow();
  }

  const summaryWithoutMessage = {
    changed,
    processedLogs,
    addedEntries,
    duplicateEntries,
    droppedForCapacity,
  };
  const message = buildSummaryMessage(summaryWithoutMessage);

  info('memory_consolidation_complete', {
    trigger,
    processedLogs,
    addedEntries,
    duplicateEntries,
    droppedForCapacity,
    changed,
    usagePercent: getTargetUsage('memory', serializeMemoryEntries(memoryEntries, stamp)).percent,
  });

  return {
    ...summaryWithoutMessage,
    message,
  };
}

/**
 * Lightweight check for stale daily logs (§3.1 session-start trigger).
 * Returns true if there are unconsolidated logs older than `staleDays`.
 * Does NOT run LLM — meant to be fast (<50ms).
 */
export async function hasPendingStaleLogs(staleDays = 7): Promise<boolean> {
  const root = resolveMemoryRoot();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const cutoffStr = format(cutoff, 'yyyy-MM-dd');

  const logs = await listPendingDailyLogs(root);
  return logs.some((log) => log.date <= cutoffStr);
}

export async function runMemoryConsolidationSafely(
  ctx: ExtensionContext,
  trigger: ConsolidationTrigger = 'manual',
): Promise<ConsolidationSummary> {
  try {
    return await runMemoryConsolidation(ctx, trigger);
  } catch (err) {
    error('memory_consolidation_failed', {
      trigger,
      ...errorDetails(err),
    });
    throw err;
  }
}
