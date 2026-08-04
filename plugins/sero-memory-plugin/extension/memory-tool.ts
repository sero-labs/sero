/**
 * Memory tool — unified read/write/search/list plus surgical edits for memory files.
 *
 * Registered via `pi.registerTool()` and bridged into `sero-cli`
 * by the schema bridge (AD-020).
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { requestIsolatedCompletion } from '@sero-ai/extension-runtime';
import { Text } from '@earendil-works/pi-tui';
import { Type, type Static } from 'typebox';

import {
  ensureDirectories,
  appendFile,
  getTargetUsage,
  listFiles,
  readFile,
  resolveMemoryRoot,
  resolveTargetPath,
  searchFiles,
  writeFile,
} from './memory-manager';
import {
  generateEntryId,
  hasMemoryV2Marker,
  normalizeEntryType,
  normalizeLegacyMemory,
  normalizeManagedMarkdown,
  normalizeWhitespace,
  nowTimestamp,
  parseMemoryEntries,
  renderMemoryForRead,
  serializeMemoryEntries,
  stripManagedFileMetadata,
} from './memory-format';
import { checkForDuplicateEntries, scanMemoryContent } from './memory-guards';
import { error, errorDetails, info } from './logger';
import { scheduleQmdUpdate } from './qmd';
import {
  handleMemoryConfig,
  handleMemoryConsolidate,
} from './memory-tool-admin';
import { mergeManagedFieldUpdate } from './managed-markdown-fields';
import type { AutoConsolidationCadence } from './automation-state';
import type { ConsolidationTrigger } from './consolidation';
import type { AutoRetrieveMode, MemorySnapshotMode } from './memory-config';

const MemoryParams = Type.Object({
  action: StringEnum(['read', 'write', 'replace', 'remove', 'search', 'list', 'consolidate', 'config'] as const),
  target: Type.Optional(StringEnum(['memory', 'identity', 'user', 'daily'] as const)),
  content: Type.Optional(Type.String({ description: 'Content to write (for write / replace actions)' })),
  mode: Type.Optional(StringEnum(['append', 'overwrite'] as const)),
  date: Type.Optional(Type.String({ description: 'Date for daily log (YYYY-MM-DD), defaults to today' })),
  query: Type.Optional(Type.String({ description: 'Search query (for search action)' })),
  max_results: Type.Optional(Type.Number({ description: 'Max search results (default: 20)' })),
  entry_id: Type.Optional(Type.String({ description: 'Structured memory entry id for replace/remove actions' })),
  old_text: Type.Optional(Type.String({ description: 'Legacy fallback match string for replace/remove actions' })),
  with_ids: Type.Optional(Type.Boolean({ description: 'Include structured memory entry ids when reading MEMORY.md' })),
  type: Type.Optional(StringEnum(['fact', 'decision', 'preference', 'lesson', 'question', 'hypothesis'] as const)),
  schedule: Type.Optional(StringEnum(['daily', 'weekly', 'off'] as const)),
  trigger: Type.Optional(StringEnum(['manual', 'cron', 'auto'] as const)),
  snapshot: Type.Optional(StringEnum(['frozen', 'live'] as const)),
  auto_retrieve: Type.Optional(StringEnum(['on', 'off'] as const)),
});

type MemoryParamsType = Static<typeof MemoryParams>;

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }], details: {} };
}

function unescapeContent(raw: string): string {
  return raw.replace(/\\n/g, '\n');
}

/** @internal Exported for testing. */
export function capacityError(displayName: string, target: 'memory' | 'identity' | 'user', nextContent: string): string | null {
  const usage = getTargetUsage(target, nextContent);
  if (usage.chars <= usage.max) return null;
  return `Error: ${displayName} would exceed capacity (${usage.chars}/${usage.max} chars). Current usage: ${usage.percent}%. Replace, remove, or consolidate content before adding more.`;
}

function formatWarnings(warnings: string[]): string {
  if (warnings.length === 0) return '';
  return `${warnings.map((warning) => `Warning: ${warning}`).join('\n')}\n`;
}

function formatStructuredLinePreview(textValue: string): string {
  const normalized = normalizeWhitespace(textValue);
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

async function loadStructuredMemory(root: string): Promise<{ entries: ReturnType<typeof parseMemoryEntries>; content: string | null }> {
  const filePath = resolveTargetPath(root, 'memory')!.path;
  const content = await readFile(filePath);
  info('memory_load_structured', {
    filePath,
    exists: Boolean(content?.trim()),
    chars: content?.length ?? 0,
  });
  if (!content?.trim()) return { entries: [], content };

  const parsed = parseMemoryEntries(content);
  if (parsed.length > 0) {
    if (parsed.some((entry) => !entry.hasId)) {
      const nextContent = serializeMemoryEntries(parsed, nowTimestamp());
      await writeFile(filePath, nextContent);
      info('memory_load_structured_rewrote_missing_ids', {
        filePath,
        parsedEntries: parsed.length,
      });
      return { entries: parseMemoryEntries(nextContent), content: nextContent };
    }
    return { entries: parsed, content };
  }

  const normalizedEntries = normalizeLegacyMemory(content);
  info('memory_load_structured_legacy_detected', {
    filePath,
    normalizedEntries: normalizedEntries.length,
  });
  if (normalizedEntries.length === 0) return { entries: [], content };

  const nextContent = serializeMemoryEntries(normalizedEntries, nowTimestamp());
  await writeFile(filePath, nextContent);
  info('memory_load_structured_normalized', {
    filePath,
    normalizedEntries: normalizedEntries.length,
  });
  return { entries: parseMemoryEntries(nextContent), content: nextContent };
}

function findEntryIndexByLegacyText(entries: ReturnType<typeof parseMemoryEntries>, oldText?: string): {
  index: number;
  error?: string;
} {
  if (!oldText) {
    return { index: -1, error: 'Error: entry_id is required. Legacy old_text matching is only available for temporary migration fallback.' };
  }

  const needle = normalizeWhitespace(oldText).toLowerCase();
  const matches = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.text.toLowerCase().includes(needle));

  if (matches.length === 0) {
    return { index: -1, error: `Error: No entry match found for "${oldText}". Use \`sero memory read --target memory --with_ids true\` to inspect entries.` };
  }
  if (matches.length > 1) {
    return { index: -1, error: `Error: Ambiguous legacy match for "${oldText}" (${matches.length} entries). Prefer \`--entry_id\`.` };
  }
  return { index: matches[0]!.index };
}

/** @internal Exported for testing. */
export async function handleRead(root: string, target?: string, date?: string, withIds?: boolean) {
  if (!target) return handleList(root);

  const resolved = resolveTargetPath(root, target, date);
  if (!resolved) return text(`Unknown target: ${target}`);

  if (target === 'memory') {
    const { content, entries } = withIds === true
      ? await loadStructuredMemory(root)
      : { content: await readFile(resolved.path), entries: [] };
    if (!content) return text(`${resolved.displayName} not found or empty.`);
    info('memory_read', {
      target,
      path: resolved.path,
      withIds: withIds === true,
      hasV2Marker: hasMemoryV2Marker(content),
      parsedEntries: withIds === true ? entries.length : parseMemoryEntries(content).length,
      firstLine: content.split('\n')[0] ?? '',
    });
    const usage = getTargetUsage('memory', content);
    return text(renderMemoryForRead(content, withIds === true).replace(
      /^# Memory\b/,
      `# Memory [${usage.percent}% — ${usage.chars}/${usage.max} chars]`,
    ));
  }

  const content = await readFile(resolved.path);
  if (!content) return text(`${resolved.displayName} not found or empty.`);

  if (target === 'identity' || target === 'user') {
    return text(stripManagedFileMetadata(content));
  }

  return text(content);
}

/** @internal Exported for testing. */
export async function handleWrite(root: string, target?: string, rawContent?: string, mode?: string, date?: string, entryType?: string) {
  if (!rawContent) return text('Error: content is required for write action.');
  if (!target) return text('Error: target is required for write action.');

  const resolved = resolveTargetPath(root, target, date);
  if (!resolved) {
    return text(`Unknown target: ${target}. Use 'memory', 'identity', 'user', or 'daily'.`);
  }

  const scan = scanMemoryContent(unescapeContent(rawContent));
  if (scan.action === 'block') {
    return text(`Error: Memory write blocked — content matches a known security pattern (${scan.reason ?? 'security pattern detected'}). Review and rephrase the content.`);
  }

  const content = scan.content;
  const warnings: string[] = [];
  if (scan.action === 'sanitize' && scan.warning) warnings.push(scan.warning);

  if (target === 'daily') {
    if (mode === 'overwrite') {
      await writeFile(resolved.path, content.trimEnd() ? `${content.trimEnd()}\n` : '');
    } else {
      await appendFile(resolved.path, content);
    }
    scheduleQmdUpdate();
    return text(`${formatWarnings(warnings)}${mode === 'overwrite' ? 'Wrote to' : 'Appended to'} ${resolved.displayName}`.trim());
  }

  if (target === 'memory') {
    const { entries } = await loadStructuredMemory(root);

    let nextContent: string;
    if (mode === 'overwrite') {
      const replacementEntries = normalizeLegacyMemory(content);
      nextContent = serializeMemoryEntries(replacementEntries, nowTimestamp());
    } else {
      const candidateText = normalizeWhitespace(content);
      if (!candidateText) return text('Error: content is empty after normalization.');

      const duplicate = checkForDuplicateEntries(entries, candidateText);
      if (duplicate.exactMatch) {
        return text(`Error: This content already exists in MEMORY.md (entry ${duplicate.exactMatch.id}). Use \`sero memory replace --entry_id ${duplicate.exactMatch.id}\` if you want to update it.`);
      }
      if (duplicate.nearMatch) {
        warnings.push(`Similar content exists in MEMORY.md (${duplicate.nearMatch.id}): "${formatStructuredLinePreview(duplicate.nearMatch.text)}". Consider replacing it instead of duplicating.`);
      }

      nextContent = serializeMemoryEntries([
        ...entries,
        {
          id: generateEntryId(),
          hasId: true,
          type: normalizeEntryType(entryType),
          text: candidateText,
          line: 0,
          raw: '',
        },
      ], nowTimestamp());
    }

    const error = capacityError(resolved.displayName, 'memory', nextContent);
    if (error) return text(error);

    await writeFile(resolved.path, nextContent);
    scheduleQmdUpdate();
    return text(`${formatWarnings(warnings)}${mode === 'overwrite' ? 'Wrote to' : 'Appended to'} ${resolved.displayName}`.trim());
  }

  const existing = await readFile(resolved.path);
  const fieldUpdate = mode === 'overwrite' ? null : mergeManagedFieldUpdate(existing, content);
  const nextBody = mode === 'overwrite'
    ? content
    : fieldUpdate?.content ?? [existing ? stripManagedFileMetadata(existing) : '', content].filter(Boolean).join('\n\n');
  const nextContent = normalizeManagedMarkdown(nextBody);
  const managedTarget = target === 'identity' ? 'identity' : 'user';
  const error = capacityError(resolved.displayName, managedTarget, nextContent);
  if (error) return text(error);

  await writeFile(resolved.path, nextContent);
  scheduleQmdUpdate();
  if (fieldUpdate) {
    return text(`${formatWarnings(warnings)}Updated ${resolved.displayName} (${fieldUpdate.updatedLabels.join(', ')})`.trim());
  }
  return text(`${formatWarnings(warnings)}${mode === 'overwrite' ? 'Wrote to' : 'Appended to'} ${resolved.displayName}`.trim());
}

/** @internal Exported for testing. */
export async function handleReplace(root: string, target?: string, entryId?: string, rawContent?: string, oldText?: string) {
  if (target !== 'memory') return text('Error: replace is only supported for target=memory.');
  if (!rawContent) return text('Error: content is required for replace action.');

  const scan = scanMemoryContent(unescapeContent(rawContent));
  if (scan.action === 'block') {
    return text(`Error: Memory write blocked — content matches a known security pattern (${scan.reason ?? 'security pattern detected'}). Review and rephrase the content.`);
  }

  const warnings: string[] = [];
  if (scan.action === 'sanitize' && scan.warning) warnings.push(scan.warning);

  const { entries } = await loadStructuredMemory(root);
  if (entries.length === 0) return text('Error: MEMORY.md is empty.');

  let index = entryId ? entries.findIndex((entry) => entry.id === entryId) : -1;
  if (index < 0) {
    const match = findEntryIndexByLegacyText(entries, oldText);
    if (match.error) return text(match.error);
    index = match.index;
  }
  if (index < 0) return text(`Error: No entry found for id "${entryId}".`);

  const candidateText = normalizeWhitespace(scan.content);
  if (!candidateText) return text('Error: content is empty after normalization.');

  const nextEntries = entries.map((entry, entryIndex) => (
    entryIndex === index
      ? { ...entry, text: candidateText }
      : entry
  ));

  const duplicate = checkForDuplicateEntries(
    nextEntries.filter((_entry, entryIndex) => entryIndex !== index),
    candidateText,
  );
  if (duplicate.exactMatch) {
    return text(`Error: Replacement would duplicate existing memory (${duplicate.exactMatch.id}). Use remove if the old entry is obsolete.`);
  }

  const nextContent = serializeMemoryEntries(nextEntries, nowTimestamp());
  const error = capacityError('MEMORY.md', 'memory', nextContent);
  if (error) return text(error);

  await writeFile(resolveTargetPath(root, 'memory')!.path, nextContent);
  scheduleQmdUpdate();
  return text(`${formatWarnings(warnings)}Replaced entry ${nextEntries[index]!.id} in MEMORY.md`.trim());
}

/** @internal Exported for testing. */
export async function handleRemove(root: string, target?: string, entryId?: string, oldText?: string) {
  if (target !== 'memory') return text('Error: remove is only supported for target=memory.');

  const { entries } = await loadStructuredMemory(root);
  if (entries.length === 0) return text('Error: MEMORY.md is empty.');

  let index = entryId ? entries.findIndex((entry) => entry.id === entryId) : -1;
  if (index < 0) {
    const match = findEntryIndexByLegacyText(entries, oldText);
    if (match.error) return text(match.error);
    index = match.index;
  }
  if (index < 0) return text(`Error: No entry found for id "${entryId}".`);

  const removed = entries[index]!;
  const nextEntries = entries.filter((_entry, entryIndex) => entryIndex !== index);
  await writeFile(resolveTargetPath(root, 'memory')!.path, serializeMemoryEntries(nextEntries, nowTimestamp()));
  scheduleQmdUpdate();
  return text(`Removed entry ${removed.id} from MEMORY.md.`);
}

async function handleSearch(root: string, query?: string, maxResults?: number) {
  if (!query) return text('Error: query is required for search action.');

  const results = await searchFiles(root, query, maxResults ?? 20);
  if (results.length === 0) return text(`No results for "${query}".`);

  return text(`Found ${results.length} results:\n\n${results.map((result) => `${result.file}:${result.line}: ${result.text}`).join('\n')}`);
}

/** @internal Exported for testing. */
export async function handleList(root: string) {
  const files = await listFiles(root);
  const parts: string[] = [];

  if (files.root.length > 0) {
    parts.push(`Root files:\n${files.root.map((file) => `- ${file}`).join('\n')}`);
  }

  if (files.daily.length > 0) {
    const shown = files.daily.slice(0, 10);
    const more = files.daily.length > 10 ? `\n  ... and ${files.daily.length - 10} more` : '';
    parts.push(`Daily logs (${files.daily.length}):\n${shown.map((file) => `- memory/daily/${file}`).join('\n')}${more}`);
  }

  if (parts.length === 0) return text('No memory files found.');
  return text(parts.join('\n\n'));
}

export function registerMemoryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'memory',
    label: 'Memory',
    description: [
      'Manage persistent memory files for long-term context across sessions.',
      'ALWAYS use this tool for reading or writing memory files — never use bash, read, write, or edit tools on memory files directly.',
      '',
      'Actions: read, write, replace, remove, search, list, consolidate, config.',
      'Targets: memory (MEMORY.md), identity (IDENTITY.md), user (USER.md), daily (daily log).',
      'For updates, read first and change existing memory. Use overwrite for USER.md/IDENTITY.md, replace/remove for MEMORY.md ids, append only for new non-conflicting memory or daily logs.',
    ].join('\n'),
    parameters: MemoryParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const root = resolveMemoryRoot();
      await ensureDirectories(root);
      const p = params as MemoryParamsType;
      info('memory_tool_execute', {
        action: p.action,
        target: p.target ?? null,
        withIds: p.with_ids ?? null,
        date: p.date ?? null,
        hasEntryId: Boolean(p.entry_id),
        hasOldText: Boolean(p.old_text),
        schedule: p.schedule ?? null,
        trigger: p.trigger ?? null,
        snapshot: p.snapshot ?? null,
      });

      try {
        switch (p.action) {
          case 'read':
            return handleRead(root, p.target, p.date, p.with_ids);
          case 'write':
            return handleWrite(root, p.target, p.content, p.mode, p.date, p.type);
          case 'replace':
            return handleReplace(root, p.target, p.entry_id, p.content, p.old_text);
          case 'remove':
            return handleRemove(root, p.target, p.entry_id, p.old_text);
          case 'search':
            return handleSearch(root, p.query, p.max_results);
          case 'list':
            return handleList(root);
          case 'consolidate':
            return handleMemoryConsolidate(
              p.schedule as AutoConsolidationCadence | undefined,
              p.trigger as ConsolidationTrigger | undefined,
              ctx,
              (request) => requestIsolatedCompletion(pi.events, request),
            );
          case 'config':
            return handleMemoryConfig(
              p.snapshot as MemorySnapshotMode | undefined,
              p.auto_retrieve as AutoRetrieveMode | undefined,
            );
          default:
            return text(`Unknown action: ${p.action}`);
        }
      } catch (err) {
        error('memory_tool_execute_failed', {
          action: p.action,
          target: p.target ?? null,
          ...errorDetails(err),
        });
        throw err;
      }
    },

    renderCall(args, theme) {
      let output = theme.fg('toolTitle', theme.bold('memory '));
      output += theme.fg('muted', args.action);
      if (args.target) output += ` ${theme.fg('accent', args.target)}`;
      if (args.type) output += ` ${theme.fg('accent', `[${args.type}]`)}`;
      if (args.entry_id) output += ` ${theme.fg('accent', args.entry_id)}`;
      if (args.schedule) output += ` ${theme.fg('accent', `schedule:${args.schedule}`)}`;
      if (args.snapshot) output += ` ${theme.fg('accent', `snapshot:${args.snapshot}`)}`;
      if (args.auto_retrieve) output += ` ${theme.fg('accent', `auto_retrieve:${args.auto_retrieve}`)}`;
      if (args.query) output += ` ${theme.fg('dim', `"${args.query}"`)}`;
      if (args.content) {
        const preview = args.content.length > 60 ? `${args.content.slice(0, 57)}...` : args.content;
        output += ` ${theme.fg('dim', `"${preview}"`)}`;
      }
      return new Text(output, 0, 0);
    },

    renderResult(result, _options, theme) {
      const message = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (message.startsWith('Error:')) return new Text(theme.fg('error', message), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', message), 0, 0);
    },
  });
}
