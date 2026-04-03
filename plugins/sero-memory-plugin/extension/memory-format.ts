import { randomBytes } from 'node:crypto';

export const MEMORY_V2_MARKER = '<!-- v2 format: structured memory entries with ids -->';
export const FILE_UPDATED_PREFIX = '<!-- last updated: ';

const ENTRY_LINE_REGEX = /^§(?: \[([a-z0-9:_-]+)\])? (.*?)(?: <!-- id: (mem-[a-f0-9]+) -->)?$/i;
const STANDALONE_TIMESTAMP_REGEX = /^<!-- \d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)? -->$/;

/** Canonical memory entry type tags (§3.2). */
export const VALID_ENTRY_TYPES = new Set([
  'fact', 'decision', 'preference', 'lesson', 'question', 'hypothesis',
]);

/** Normalise user input to a valid type tag; defaults to 'fact'. */
export function normalizeEntryType(value: string | undefined): string {
  if (!value) return 'fact';
  const normalized = value.toLowerCase().trim();
  return VALID_ENTRY_TYPES.has(normalized) ? normalized : 'fact';
}

/** High-priority types that survive truncation first (§3.2). */
export const HIGH_PRIORITY_TYPES = new Set(['decision', 'preference', 'question']);

/** Low-priority types only injected when QMD-matched (§3.2). */
export const LOW_PRIORITY_TYPES = new Set(['hypothesis']);

export interface MemoryEntry {
  id: string;
  hasId: boolean;
  type: string;
  text: string;
  line: number;
  raw: string;
}

export interface LegacyMemoryEntrySeed {
  type: string;
  text: string;
}

export function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

export function formatShortTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

export function generateEntryId(): string {
  return `mem-${randomBytes(3).toString('hex')}`;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isFileMetadataLine(line: string): boolean {
  return line.startsWith(FILE_UPDATED_PREFIX) || line === MEMORY_V2_MARKER;
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function inferTypeFromHeading(heading: string): string {
  const normalized = heading.toLowerCase();
  if (normalized.includes('decision')) return 'decision';
  if (normalized.includes('preference')) return 'preference';
  if (normalized.includes('lesson')) return 'lesson';
  if (normalized.includes('question')) return 'question';
  if (normalized.includes('hypothesis')) return 'hypothesis';
  return 'fact';
}

export function hasMemoryV2Marker(content: string): boolean {
  return content.includes(MEMORY_V2_MARKER);
}

export function stripManagedFileMetadata(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length && (isFileMetadataLine(lines[index]!) || lines[index]!.trim() === '')) {
    if (!isFileMetadataLine(lines[index]!) && lines[index]!.trim() !== '') break;
    index++;
  }

  return lines.slice(index).join('\n').trim();
}

export function stripEntryIdComments(content: string): string {
  return content.replace(/\s*<!-- id: mem-[a-f0-9]+ -->/gi, '');
}

export function formatMemoryEntry(entry: Pick<MemoryEntry, 'id' | 'type' | 'text'>): string {
  return `§ [${entry.type}] ${normalizeWhitespace(entry.text)} <!-- id: ${entry.id} -->`;
}

export function serializeMemoryEntries(entries: MemoryEntry[], timestamp = nowTimestamp()): string {
  const lines: string[] = [
    `<!-- last updated: ${timestamp} -->`,
    MEMORY_V2_MARKER,
    '# Memory',
  ];

  if (entries.length > 0) {
    lines.push('');
    lines.push(...entries.map(formatMemoryEntry));
  }

  return `${lines.join('\n')}\n`;
}

export function parseMemoryEntries(content: string): MemoryEntry[] {
  const lines = stripManagedFileMetadata(content).split('\n');
  const entries: MemoryEntry[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (!line || line === '# Memory' || isHeading(line) || line.startsWith('<!--')) continue;
    const match = line.match(ENTRY_LINE_REGEX);
    if (!match) continue;

    entries.push({
      id: match[3] ?? generateEntryId(),
      hasId: Boolean(match[3]),
      type: (match[1] ?? 'fact').toLowerCase(),
      text: normalizeWhitespace(match[2] ?? ''),
      line: index + 1,
      raw: line,
    });
  }

  return entries;
}

function pushSeed(buffer: string[], type: string, seeds: LegacyMemoryEntrySeed[]): void {
  const text = normalizeWhitespace(buffer.join(' '));
  if (!text) return;
  seeds.push({ type, text });
  buffer.length = 0;
}

export function extractLegacyEntrySeeds(content: string): LegacyMemoryEntrySeed[] {
  const body = stripManagedFileMetadata(content);
  if (!body) return [];

  const lines = body.split('\n');
  const seeds: LegacyMemoryEntrySeed[] = [];
  let currentHeading = 'fact';
  const buffer: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '# Memory') {
      pushSeed(buffer, currentHeading, seeds);
      continue;
    }

    if (isHeading(line)) {
      pushSeed(buffer, currentHeading, seeds);
      currentHeading = inferTypeFromHeading(line.replace(/^#{1,6}\s+/, ''));
      continue;
    }

    if (STANDALONE_TIMESTAMP_REGEX.test(line) || line.startsWith('<!--')) {
      pushSeed(buffer, currentHeading, seeds);
      continue;
    }

    const entryMatch = line.match(ENTRY_LINE_REGEX);
    if (entryMatch) {
      pushSeed(buffer, currentHeading, seeds);
      seeds.push({
        type: (entryMatch[1] ?? 'fact').toLowerCase(),
        text: normalizeWhitespace(entryMatch[2] ?? ''),
      });
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.+)$/) ?? line.match(/^\d+\.\s+(.+)$/);
    if (bullet) {
      pushSeed(buffer, currentHeading, seeds);
      const text = normalizeWhitespace(bullet[1] ?? '');
      if (text) seeds.push({ type: currentHeading, text });
      continue;
    }

    buffer.push(line);
  }

  pushSeed(buffer, currentHeading, seeds);
  return seeds;
}

export function normalizeLegacyMemory(content: string): MemoryEntry[] {
  const dedupe = new Set<string>();
  const entries: MemoryEntry[] = [];

  for (const seed of extractLegacyEntrySeeds(content)) {
    const key = `${seed.type}:${seed.text.toLowerCase()}`;
    if (!seed.text || dedupe.has(key)) continue;
    dedupe.add(key);
    entries.push({
      id: generateEntryId(),
      hasId: true,
      type: seed.type,
      text: seed.text,
      line: 0,
      raw: '',
    });
  }

  return entries;
}

export function renderMemoryForRead(content: string, withIds: boolean): string {
  const body = stripManagedFileMetadata(content);
  if (!withIds) {
    return stripEntryIdComments(body).trim();
  }
  return body.trim();
}

export function normalizeManagedMarkdown(content: string, title?: string): string {
  const body = stripManagedFileMetadata(content);
  const cleanedLines = body
    .split('\n')
    .filter((line) => !STANDALONE_TIMESTAMP_REGEX.test(line.trim()))
    .join('\n')
    .trim();

  const timestamp = nowTimestamp();
  if (!cleanedLines) return `<!-- last updated: ${timestamp} -->\n`;

  const titleLine = title ? `${title}\n\n` : '';
  return `<!-- last updated: ${timestamp} -->\n${titleLine}${cleanedLines}\n`;
}
