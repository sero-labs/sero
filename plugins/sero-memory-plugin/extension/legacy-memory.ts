/**
 * Reads the old `MEMORY.md` for the one-time conversion (design D12).
 *
 * Every format the old plugin read is covered: v2 lines
 * (`§ [type] text <!-- id: mem-… -->`, where a line can carry several ids and
 * the first one wins), legacy bullets and numbered items, and prose paragraphs
 * under headings. No model is used.
 */

import { createHash } from 'node:crypto';

import { isValidEntryId, type EntryType } from './entry-format';
import { stripManagedFileMetadata } from './memory-format';

export interface LegacyEntry {
  id: string;
  type: EntryType;
  text: string;
}

const V2_LINE_RE = /^§(?: \[([a-z0-9:_-]+)\])? (.*)$/i;
const ID_COMMENT_RE = /<!--\s*id:\s*(mem-[a-z0-9-]+)\s*-->/gi;
const BULLET_RE = /^(?:[-*+]|\d+\.)\s+(.+)$/;
const HEADING_RE = /^#{1,6}\s+/;

/**
 * Onboarding answers that mean "nothing to remember". The old onboarding wrote
 * them into MEMORY.md as if they were facts.
 */
const NONE_LABELS = new Set([
  'nothing specific right now',
  'no strong preference',
  'no special rules',
  'not specified',
  'none',
]);

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isNoneLabel(text: string): boolean {
  return NONE_LABELS.has(normalizeText(text).replace(/\.$/, '').toLowerCase());
}

function toEntryType(tag: string | undefined): EntryType {
  const value = tag?.toLowerCase() ?? '';
  if (value.includes('decision')) return 'decision';
  if (value.includes('preference')) return 'preference';
  if (value.includes('lesson')) return 'lesson';
  return 'reference';
}

function hashId(text: string): string {
  return `mem-${createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 12)}`;
}

function stripIdComments(text: string): string {
  return normalizeText(text.replace(ID_COMMENT_RE, ' '));
}

function isCommentLine(line: string): boolean {
  return line.startsWith('<!--') && line.endsWith('-->');
}

/** The fact a single source line contributes, or null for structure and filler. */
export function factTextOfLine(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line || HEADING_RE.test(line) || isCommentLine(line)) return null;
  const v2 = V2_LINE_RE.exec(line);
  const bullet = v2 ? null : BULLET_RE.exec(line);
  const text = stripIdComments(v2?.[2] ?? bullet?.[1] ?? line);
  if (!text || isNoneLabel(text)) return null;
  return text;
}

/**
 * Parses old memory content into entries with stable ids: the first v2 id on
 * a line, or a hash of the normalised text. A retry therefore produces the
 * same files and cannot create duplicates.
 */
export function parseLegacyMemory(content: string): LegacyEntry[] {
  const entries: LegacyEntry[] = [];
  const idsInUse = new Map<string, string>();
  let headingType: EntryType = 'reference';
  const paragraph: string[] = [];

  const push = (text: string, type: EntryType, sourceId?: string) => {
    const normalized = normalizeText(text);
    if (!normalized || isNoneLabel(normalized)) return;
    let id = sourceId && isValidEntryId(sourceId) ? sourceId : hashId(normalized);
    // Two different facts claiming one id: the second falls back to its hash.
    if (idsInUse.has(id) && idsInUse.get(id) !== normalized) id = hashId(normalized);
    if (idsInUse.has(id)) return;
    idsInUse.set(id, normalized);
    entries.push({ id, type, text: normalized });
  };
  const flushParagraph = () => {
    if (paragraph.length > 0) push(paragraph.join(' '), headingType);
    paragraph.length = 0;
  };

  for (const rawLine of stripManagedFileMetadata(content).split('\n')) {
    const line = rawLine.trim();
    if (!line || isCommentLine(line)) {
      flushParagraph();
      continue;
    }
    if (HEADING_RE.test(line)) {
      flushParagraph();
      headingType = toEntryType(line.replace(HEADING_RE, ''));
      continue;
    }
    const v2 = V2_LINE_RE.exec(line);
    if (v2) {
      flushParagraph();
      const firstId = [...(v2[2] ?? '').matchAll(ID_COMMENT_RE)][0]?.[1]?.toLowerCase();
      push(stripIdComments(v2[2] ?? ''), toEntryType(v2[1]), firstId);
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flushParagraph();
      push(stripIdComments(bullet[1] ?? ''), headingType);
      continue;
    }
    paragraph.push(stripIdComments(line));
  }
  flushParagraph();
  return entries;
}

/**
 * Completeness check (D12 step 4): every non-empty source line must appear in
 * a converted entry after whitespace normalisation. Headings, metadata
 * comments and skipped "none" answers are the only exceptions.
 *
 * @returns the source lines that are missing; empty when the check passes.
 */
export function findMissingFacts(content: string, convertedBodies: string[]): string[] {
  const bodies = convertedBodies.map((body) => normalizeText(body).toLowerCase());
  const missing: string[] = [];
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const fact = factTextOfLine(line);
    if (!fact) continue;
    const needle = fact.toLowerCase();
    if (!bodies.some((body) => body.includes(needle))) missing.push(line.trim());
  }
  return missing;
}
