/**
 * Memory entry file format (design D1): one markdown file per memory, with a
 * small frontmatter block and a body that states the fact and how it changes
 * behaviour.
 *
 *   ---
 *   id: mem-1a2b3c4d
 *   type: preference
 *   scope: global
 *   created: 2026-09-27
 *   confirmed: 2026-09-27
 *   replaces: mem-aaaa, mem-bbbb
 *   terms: pnpm, package manager, add dependency
 *   ---
 *   Use pnpm for JS projects. Never run npm install.
 *
 * Trashed entries also carry `delivery` (where a restore puts them back),
 * `removed` and `evidence`.
 */

import { randomBytes } from 'node:crypto';

export const ENTRY_TYPES = ['preference', 'decision', 'lesson', 'reference'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const SCOPES = ['global', 'workspace'] as const;
export type Scope = (typeof SCOPES)[number];

/** Folder that sets how an entry reaches context. `unsorted` holds converted legacy entries only. */
export const DELIVERIES = ['pinned', 'on-match', 'unsorted'] as const;
export type Delivery = (typeof DELIVERIES)[number];

export interface MemoryEntry {
  id: string;
  type: EntryType;
  scope: Scope;
  created: string;
  confirmed: string;
  replaces: string[];
  terms: string[];
  body: string;
}

const BEHAVIOUR_MARKER = 'Behaviour: ';

/** An entry body: the fact, then a `Behaviour:` line. Converted entries have only the fact. */
export function buildBody(content: string, behaviour: string): string {
  return `${content.trim()}\n\n${BEHAVIOUR_MARKER}${behaviour.trim()}`;
}

/** The fact and behaviour parts of a body written by `buildBody`. */
export function splitBody(body: string): { fact: string; behaviour?: string } {
  const match = /\n+Behaviour:\s*/.exec(body);
  if (!match) return { fact: body.trim() };
  return { fact: body.slice(0, match.index).trim(), behaviour: body.slice(match.index + match[0].length).trim() };
}

/** Extra fields a trashed entry keeps so it can be restored and audited. */
export interface TrashFields {
  delivery: Delivery;
  removed: string;
  evidence: string;
}

export type TrashedEntry = MemoryEntry & TrashFields;

const ID_RE = /^mem-[a-z0-9-]{4,64}$/;

/** IDs name files, so only a narrow character set is ever accepted. */
export function isValidEntryId(value: string): boolean {
  return ID_RE.test(value);
}

export function newEntryId(): string {
  return `mem-${randomBytes(4).toString('hex')}`;
}

export function todayStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function isOneOf<T extends string>(values: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (values as readonly string[]).includes(value);
}

export function serializeEntry(entry: MemoryEntry, trash?: TrashFields): string {
  const lines = [
    '---',
    `id: ${entry.id}`,
    `type: ${entry.type}`,
    `scope: ${entry.scope}`,
    `created: ${entry.created}`,
    `confirmed: ${entry.confirmed}`,
  ];
  if (entry.replaces.length > 0) lines.push(`replaces: ${entry.replaces.join(', ')}`);
  lines.push(`terms: ${entry.terms.map(singleLine).join(', ')}`);
  if (trash) {
    lines.push(`delivery: ${trash.delivery}`, `removed: ${trash.removed}`, `evidence: ${singleLine(trash.evidence)}`);
  }
  lines.push('---', entry.body.trim(), '');
  return lines.join('\n');
}

function parseFrontmatter(content: string): { fields: Map<string, string>; body: string } | null {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---', 4);
  if (end < 0) return null;
  const fields = new Map<string, string>();
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([a-z]+):\s?(.*)$/.exec(line.trim());
    if (match) fields.set(match[1]!, match[2]!.trim());
  }
  const afterMarker = normalized.indexOf('\n', end + 4);
  const body = afterMarker < 0 ? '' : normalized.slice(afterMarker + 1);
  return { fields, body: body.trim() };
}

/** Parses an entry file. Returns null for a file that is not a valid entry. */
export function parseEntry(content: string): MemoryEntry | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;
  const { fields, body } = parsed;
  const id = fields.get('id') ?? '';
  const type = fields.get('type');
  const scope = fields.get('scope');
  if (!isValidEntryId(id) || !isOneOf(ENTRY_TYPES, type) || !isOneOf(SCOPES, scope) || !body) return null;
  return {
    id,
    type,
    scope,
    created: fields.get('created') ?? '',
    confirmed: fields.get('confirmed') ?? '',
    replaces: splitList(fields.get('replaces')).filter(isValidEntryId),
    terms: splitList(fields.get('terms')),
    body,
  };
}

/** Parses a trashed entry, including where a restore puts it back. */
export function parseTrashedEntry(content: string): TrashedEntry | null {
  const entry = parseEntry(content);
  if (!entry) return null;
  const { fields } = parseFrontmatter(content)!;
  const delivery = fields.get('delivery');
  return {
    ...entry,
    delivery: isOneOf(DELIVERIES, delivery) ? delivery : 'on-match',
    removed: fields.get('removed') ?? '',
    evidence: fields.get('evidence') ?? '',
  };
}
