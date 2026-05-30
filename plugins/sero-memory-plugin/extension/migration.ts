import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { complete, type Message } from '@earendil-works/pi-ai';

import { promises as fs } from 'node:fs';

import {
  appendFile,
  ensureDirectories,
  getCapacityForTarget,
  getDailyPath,
  getIdentityPath,
  getMemoryPath,
  getTargetUsage,
  resolveMemoryRoot,
  getUserPath,
  readFile,
  todayStr,
  writeFile,
} from './memory-manager';
import {
  hasMemoryV2Marker,
  normalizeLegacyMemory,
  normalizeManagedMarkdown,
  nowTimestamp,
  parseMemoryEntries,
  serializeMemoryEntries,
  stripManagedFileMetadata,
} from './memory-format';
import { error, errorDetails, info } from './logger';

const MEMORY_BACKUP_SUFFIX = '.pre-v2-backup';

export interface MigrationSummary {
  changed: boolean;
  notes: string[];
}

async function maybeBackupMemoryFile(filePath: string, original: string): Promise<void> {
  const backupPath = `${filePath}${MEMORY_BACKUP_SUFFIX}`;
  try {
    await fs.access(backupPath);
    info('migration_backup_exists', { filePath, backupPath });
  } catch {
    await fs.writeFile(backupPath, original, 'utf-8');
    info('migration_backup_created', { filePath, backupPath, chars: original.length });
  }
}

async function completeMarkdown(
  ctx: ExtensionContext,
  systemPrompt: string,
  prompt: string,
): Promise<string | null> {
  if (!ctx.model) return null;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) return null;
  const { apiKey, headers } = auth;

  const messages: Message[] = [{
    role: 'user',
    content: [{ type: 'text', text: prompt }],
    timestamp: Date.now(),
  }];

  const response = await complete(
    ctx.model,
    { systemPrompt, messages },
    { apiKey, headers, reasoningEffort: 'low' },
  );

  const text = response.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();

  return text || null;
}

async function compactMemoryContent(ctx: ExtensionContext, content: string, maxChars: number): Promise<string | null> {
  const body = stripManagedFileMetadata(content);
  if (!body) return null;

  const prompt = [
    `Condense this Sero memory file to fit within ${maxChars} visible characters.`,
    'Keep only durable facts, decisions, preferences, lessons, and open questions.',
    'Output only markdown with a `# Memory` heading followed by one-line entries in this format:',
    '§ [fact] Example durable memory',
    'Do not include IDs or HTML comments.',
    '',
    '<memory>',
    body,
    '</memory>',
  ].join('\n');

  const output = await completeMarkdown(
    ctx,
    'You condense local markdown memory into a short durable memory list. Output markdown only.',
    prompt,
  );
  if (!output) return null;

  const entries = normalizeLegacyMemory(output);
  if (entries.length === 0) return null;

  const compacted = serializeMemoryEntries(entries, nowTimestamp());
  return getTargetUsage('memory', compacted).chars <= maxChars ? compacted : null;
}

async function compactManagedMarkdown(
  ctx: ExtensionContext,
  label: string,
  content: string,
  maxChars: number,
): Promise<string | null> {
  const body = stripManagedFileMetadata(content);
  if (!body) return null;

  const output = await completeMarkdown(
    ctx,
    'You condense markdown files while preserving the essential facts. Output markdown only.',
    [
      `Condense ${label} to fit within ${maxChars} visible characters.`,
      'Preserve headings and bullets where they help readability.',
      'Output markdown only. Do not include HTML metadata comments.',
      '',
      `<${label}>`,
      body,
      `</${label}>`,
    ].join('\n'),
  );
  if (!output) return null;

  const normalized = normalizeManagedMarkdown(output);
  return getTargetUsage(label as 'identity' | 'user', normalized).chars <= maxChars ? normalized : null;
}

async function logMigrationNotes(root: string, notes: string[]): Promise<void> {
  if (notes.length === 0) return;
  const message = [
    '## Memory Migration (auto)',
    ...notes.map((note) => `- ${note}`),
  ].join('\n');
  await appendFile(getDailyPath(root, todayStr()), message);
  info('migration_notes_logged', {
    root,
    noteCount: notes.length,
    dailyPath: getDailyPath(root, todayStr()),
  });
}

async function migrateMemoryFile(ctx: ExtensionContext, root: string, notes: string[]): Promise<boolean> {
  const filePath = getMemoryPath(root);
  const original = await readFile(filePath);
  info('migration_memory_scan', {
    filePath,
    exists: Boolean(original?.trim()),
    chars: original?.length ?? 0,
  });
  if (!original?.trim()) return false;

  let nextContent = original;
  let changed = false;

  const parsed = parseMemoryEntries(original);
  const needsNormalization = !hasMemoryV2Marker(original)
    || parsed.length === 0
    || parsed.some((entry) => !entry.hasId);
  info('migration_memory_state', {
    filePath,
    hasV2Marker: hasMemoryV2Marker(original),
    parsedEntries: parsed.length,
    entriesMissingIds: parsed.some((entry) => !entry.hasId),
    needsNormalization,
  });

  if (needsNormalization) {
    const entries = parsed.length > 0 ? parsed : normalizeLegacyMemory(original);
    info('migration_memory_normalized', {
      filePath,
      entryCount: entries.length,
    });
    if (entries.length > 0) {
      nextContent = serializeMemoryEntries(entries, nowTimestamp());
      changed = nextContent !== original;
      if (changed) notes.push('Migrated MEMORY.md to v2 structured entries with stable IDs.');
    }
  }

  const maxChars = getCapacityForTarget('memory');
  if (maxChars != null && getTargetUsage('memory', nextContent).chars > maxChars) {
    info('migration_memory_over_capacity', {
      filePath,
      maxChars,
      chars: getTargetUsage('memory', nextContent).chars,
    });
    const compacted = await compactMemoryContent(ctx, nextContent, maxChars);
    if (compacted) {
      nextContent = compacted;
      changed = true;
      notes.push(`Auto-consolidated MEMORY.md to fit ${maxChars} chars.`);
    }
  }

  if (!changed || nextContent === original) return false;
  await maybeBackupMemoryFile(filePath, original);
  await writeFile(filePath, nextContent);
  info('migration_memory_written', {
    filePath,
    charsBefore: original.length,
    charsAfter: nextContent.length,
  });
  return true;
}

async function migrateManagedMarkdownFile(
  ctx: ExtensionContext,
  label: 'identity' | 'user',
  filePath: string,
  notes: string[],
): Promise<boolean> {
  const original = await readFile(filePath);
  info('migration_managed_scan', {
    label,
    filePath,
    exists: Boolean(original?.trim()),
    chars: original?.length ?? 0,
  });
  if (!original?.trim()) return false;

  let nextContent = normalizeManagedMarkdown(original);
  let changed = nextContent !== original;
  const maxChars = getCapacityForTarget(label);

  if (maxChars != null && getTargetUsage(label, nextContent).chars > maxChars) {
    const compacted = await compactManagedMarkdown(ctx, label, nextContent, maxChars);
    if (compacted) {
      nextContent = compacted;
      changed = true;
      notes.push(`Auto-consolidated ${label.toUpperCase()}.md to fit ${maxChars} chars.`);
    }
  }

  if (!changed || nextContent === original) return false;
  await writeFile(filePath, nextContent);
  info('migration_managed_written', {
    label,
    filePath,
    charsBefore: original.length,
    charsAfter: nextContent.length,
  });
  return true;
}

export async function runPhase1Migration(ctx: ExtensionContext): Promise<MigrationSummary> {
  const root = resolveMemoryRoot();
  await ensureDirectories(root);
  info('migration_start', { root });

  const notes: string[] = [];
  try {
    const changedFlags = await Promise.all([
      migrateMemoryFile(ctx, root, notes),
      migrateManagedMarkdownFile(ctx, 'identity', getIdentityPath(root), notes),
      migrateManagedMarkdownFile(ctx, 'user', getUserPath(root), notes),
    ]);

    const changed = changedFlags.some(Boolean);
    if (changed) await logMigrationNotes(root, notes);
    info('migration_complete', { root, changed, changedFlags, notes });
    return { changed, notes };
  } catch (err) {
    error('migration_failed', { root, ...errorDetails(err) });
    throw err;
  }
}
