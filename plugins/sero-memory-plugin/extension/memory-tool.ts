/**
 * Memory tool — read/write plus surgical edits for the three memory files.
 *
 * Registered via `pi.registerTool()` and bridged into `sero-cli`
 * by the schema bridge (AD-020).
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type, type Static } from 'typebox';

import {
  getTargetUsage,
  readFile,
  resolveMemoryRoot,
  resolveTargetPath,
  writeFile,
} from './memory-manager';
import {
  generateEntryId,
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
import { mergeManagedFieldUpdate } from './managed-markdown-fields';

const MemoryParams = Type.Object({
  action: StringEnum(['read', 'write', 'replace', 'remove'] as const),
  target: Type.Optional(StringEnum(['memory', 'identity', 'user'] as const)),
  content: Type.Optional(Type.String({ description: 'Content to write (for write / replace actions)' })),
  mode: Type.Optional(StringEnum(['append', 'overwrite'] as const)),
  entry_id: Type.Optional(Type.String({ description: 'Structured memory entry id for replace/remove actions' })),
  old_text: Type.Optional(Type.String({ description: 'Legacy fallback match string for replace/remove actions' })),
  with_ids: Type.Optional(Type.Boolean({ description: 'Include structured memory entry ids when reading MEMORY.md' })),
  type: Type.Optional(StringEnum(['fact', 'decision', 'preference', 'lesson', 'question', 'hypothesis'] as const)),
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
  return `Error: ${displayName} would exceed capacity (${usage.chars}/${usage.max} chars). Current usage: ${usage.percent}%. Replace or remove content before adding more.`;
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
  if (!content?.trim()) return { entries: [], content };

  const parsed = parseMemoryEntries(content);
  if (parsed.length > 0) {
    if (parsed.some((entry) => !entry.hasId)) {
      const nextContent = serializeMemoryEntries(parsed, nowTimestamp());
      await writeFile(filePath, nextContent);
      return { entries: parseMemoryEntries(nextContent), content: nextContent };
    }
    return { entries: parsed, content };
  }

  const normalizedEntries = normalizeLegacyMemory(content);
  if (normalizedEntries.length === 0) return { entries: [], content };

  const nextContent = serializeMemoryEntries(normalizedEntries, nowTimestamp());
  await writeFile(filePath, nextContent);
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
export async function handleRead(root: string, target?: string, withIds?: boolean) {
  if (!target) return text('Error: target is required for read action. Use memory, identity, or user.');

  const resolved = resolveTargetPath(root, target);
  if (!resolved) return text(`Unknown target: ${target}`);

  if (target === 'memory') {
    const content = withIds === true
      ? (await loadStructuredMemory(root)).content
      : await readFile(resolved.path);
    if (!content) return text(`${resolved.displayName} not found or empty.`);
    const usage = getTargetUsage('memory', content);
    return text(renderMemoryForRead(content, withIds === true).replace(
      /^# Memory\b/,
      `# Memory [${usage.percent}% — ${usage.chars}/${usage.max} chars]`,
    ));
  }

  const content = await readFile(resolved.path);
  if (!content) return text(`${resolved.displayName} not found or empty.`);

  return text(stripManagedFileMetadata(content));
}

/** @internal Exported for testing. */
export async function handleWrite(root: string, target?: string, rawContent?: string, mode?: string, entryType?: string) {
  if (!rawContent) return text('Error: content is required for write action.');
  if (!target) return text('Error: target is required for write action.');

  const resolved = resolveTargetPath(root, target);
  if (!resolved) {
    return text(`Unknown target: ${target}. Use 'memory', 'identity', or 'user'.`);
  }

  const scan = scanMemoryContent(unescapeContent(rawContent));
  if (scan.action === 'block') {
    return text(`Error: Memory write blocked — content matches a known security pattern (${scan.reason ?? 'security pattern detected'}). Review and rephrase the content.`);
  }

  const content = scan.content;
  const warnings: string[] = [];
  if (scan.action === 'sanitize' && scan.warning) warnings.push(scan.warning);


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
  return text(`Removed entry ${removed.id} from MEMORY.md.`);
}



export function registerMemoryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'memory',
    label: 'Memory',
    description: [
      'Manage the persistent memory files that carry context across sessions.',
      'ALWAYS use this tool for reading or writing memory files — never use bash, read, write, or edit tools on memory files directly.',
      '',
      'Actions: read, write, replace, remove.',
      'Targets: memory (MEMORY.md), identity (IDENTITY.md), user (USER.md).',
      'For updates, read first and change existing memory. Use overwrite for USER.md/IDENTITY.md, replace/remove for MEMORY.md ids, append only for new non-conflicting memory.',
    ].join('\n'),
    parameters: MemoryParams,

    async execute(_toolCallId, params) {
      const root = resolveMemoryRoot();
      const p = params as MemoryParamsType;

      switch (p.action) {
        case 'read':
          return handleRead(root, p.target, p.with_ids);
        case 'write':
          return handleWrite(root, p.target, p.content, p.mode, p.type);
        case 'replace':
          return handleReplace(root, p.target, p.entry_id, p.content, p.old_text);
        case 'remove':
          return handleRemove(root, p.target, p.entry_id, p.old_text);
        default:
          return text(`Unknown action: ${p.action}`);
      }
    },

    renderCall(args, theme) {
      let output = theme.fg('toolTitle', theme.bold('memory '));
      output += theme.fg('muted', args.action);
      if (args.target) output += ` ${theme.fg('accent', args.target)}`;
      if (args.type) output += ` ${theme.fg('accent', `[${args.type}]`)}`;
      if (args.entry_id) output += ` ${theme.fg('accent', args.entry_id)}`;
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
