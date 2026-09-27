/**
 * Memory entry actions (design D7): save, replace, remove, restore, pin,
 * unpin and list. The code checks format and reports close entries; the
 * model decides what is a duplicate.
 */

import {
  ENTRY_TYPES,
  isValidEntryId,
  newEntryId,
  todayStamp,
  type Delivery,
  type EntryType,
  type Scope,
  buildBody,
  splitBody,
} from './entry-format';
import {
  findEntry,
  globalLocation,
  listEntries,
  moveEntry,
  restoreEntry,
  trashEntry,
  workspaceLocation,
  writeEntry,
  type ScopeLocation,
  type StoredEntry,
} from './entry-store';
import { guardWorkspaceWrite } from './git-guard';
import { scanMemoryContent } from './memory-guards';
import { readMemorySettings, recallThresholdFor } from './memory-settings';
import { recordMetric } from './metrics';
import { searchEntries } from './memory-search';
import { refreshIndex, warmUp } from './qmd-index';
import { enqueueWrite } from './registry';

export interface EntryContext {
  sessionId: string;
  /** The chat session's workspace folder. */
  workspaceRoot: string;
  /** Entries recalled into this session since its last compaction. */
  recalled: ReadonlySet<string>;
  /** Called once when a save, replace or remove has changed memory. */
  onChange?: (change: MemoryChange) => void;
}

/** A change the chat shows as one line (design D13). */
export interface MemoryChange {
  action: 'save' | 'replace' | 'remove';
  id: string;
  fact: string;
}

export interface SaveInput {
  content?: string;
  behaviour?: string;
  type?: string;
  scope?: string;
  delivery?: string;
  terms?: string;
  distinct?: boolean;
}

export interface ReplaceInput {
  id?: string;
  content?: string;
  behaviour?: string;
  type?: string;
  terms?: string;
}

const MAX_CLOSE_ENTRIES = 3;

export function locationFor(scope: Scope, workspaceRoot: string): ScopeLocation {
  return scope === 'global' ? globalLocation() : workspaceLocation(workspaceRoot);
}

function locationsOf(ctx: EntryContext): ScopeLocation[] {
  return [globalLocation(), workspaceLocation(ctx.workspaceRoot)];
}

function firstLine(text: string, max = 100): string {
  const line = text.split('\n').find((value) => value.trim())?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function describeEntry(entry: StoredEntry): string {
  return `[${entry.id}] (${entry.scope}, ${entry.delivery}, ${entry.type}) ${firstLine(entry.body)}`;
}

function splitTerms(value: string | undefined): string[] {
  return (value ?? '').split(',').map((term) => term.trim()).filter(Boolean);
}

/** Security scan over everything that reaches the prompt. */
function scan(text: string): { ok: true; text: string } | { ok: false; message: string } {
  const result = scanMemoryContent(text);
  if (result.action === 'block') {
    return { ok: false, message: `Error: memory not saved — the text matches a blocked pattern (${result.reason ?? 'security pattern'}). Rephrase it.` };
  }
  return { ok: true, text: result.content };
}

async function guard(location: ScopeLocation, workspaceRoot: string): Promise<string | null> {
  if (location.scope !== 'workspace') return null;
  const result = await guardWorkspaceWrite(workspaceRoot);
  return result.ok ? null : `Error: ${result.reason}`;
}

async function pinnedCount(location: ScopeLocation): Promise<StoredEntry[]> {
  return listEntries(location, 'pinned');
}

function capMessage(scope: Scope, cap: number, pinned: StoredEntry[]): string {
  return [
    `The ${scope} pinned set is full (${pinned.length}/${cap}).`,
    'Unpin or replace one of these first:',
    ...pinned.map(describeEntry),
  ].join('\n');
}

async function closeEntries(location: ScopeLocation, text: string, workspaceRoot: string): Promise<StoredEntry[]> {
  // Keyword scoring works without the index; the vector half needs it warm.
  await warmUp(workspaceRoot).catch(() => false);
  const { results, mode } = await searchEntries(text, [location], 'close');
  const threshold = recallThresholdFor(mode);
  return results.filter((result) => result.score >= threshold).slice(0, MAX_CLOSE_ENTRIES).map((result) => result.entry);
}

export async function saveEntry(ctx: EntryContext, input: SaveInput): Promise<string> {
  const missing = [
    !input.content?.trim() && 'content (the fact)',
    !input.behaviour?.trim() && 'behaviour (how it changes what you do)',
    !(ENTRY_TYPES as readonly string[]).includes(input.type ?? '') && `type (${ENTRY_TYPES.join('|')})`,
    input.scope !== 'global' && input.scope !== 'workspace' && 'scope (global|workspace)',
    input.delivery !== 'pinned' && input.delivery !== 'on-match' && 'delivery (pinned|on-match)',
    splitTerms(input.terms).length === 0 && 'terms (comma-separated words a future task would use)',
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) return `Error: memory not saved. Missing or invalid: ${missing.join(', ')}.`;

  const scope = input.scope as Scope;
  const location = locationFor(scope, ctx.workspaceRoot);
  const blocked = await guard(location, ctx.workspaceRoot);
  if (blocked) return blocked;
  const scanned = scan(buildBody(input.content!, input.behaviour!));
  if (!scanned.ok) return scanned.message;

  if (!input.distinct) {
    const close = await closeEntries(location, `${input.content} ${input.terms}`, ctx.workspaceRoot);
    if (close.length > 0) {
      return [
        'Not saved. These memories are close to the new one:',
        ...close.map(describeEntry),
        'If the new fact updates one of them, call `replace` with its id. If it is a different fact, save again with `distinct: true`.',
      ].join('\n');
    }
  }

  const today = todayStamp();
  return enqueueWrite(async () => {
    const cap = readMemorySettings().pinnedCaps[scope];
    const pinned = input.delivery === 'pinned' ? await pinnedCount(location) : [];
    const delivery: Delivery = input.delivery === 'pinned' && pinned.length >= cap ? 'on-match' : input.delivery as Delivery;
    const stored = await writeEntry(location, {
      id: newEntryId(),
      type: input.type as EntryType,
      scope,
      created: today,
      confirmed: today,
      replaces: [],
      terms: splitTerms(input.terms),
      body: scanned.text,
    }, delivery);
    await refreshIndex(location);
    await recordMetric('save', { session: ctx.sessionId, id: stored.id, scope, delivery, type: stored.type });
    ctx.onChange?.({ action: 'save', id: stored.id, fact: input.content!.trim() });
    const saved = `Saved: ${firstLine(input.content!)} [${stored.id}, ${scope}, ${delivery}]`;
    return delivery === input.delivery ? saved : `${saved}\n${capMessage(scope, cap, pinned)}\nIt was saved as on-match.`;
  });
}

async function findVisible(ctx: EntryContext, id: string | undefined): Promise<StoredEntry | string> {
  if (!id || !isValidEntryId(id)) return 'Error: a valid entry id is required (see `list`).';
  const entry = await findEntry(locationsOf(ctx), id);
  return entry ?? `Error: no memory with id ${id}.`;
}

export async function replaceEntry(ctx: EntryContext, input: ReplaceInput): Promise<string> {
  const found = await findVisible(ctx, input.id);
  if (typeof found === 'string') return found;
  const missing = [
    !input.content?.trim() && 'content (the fact)',
    !input.behaviour?.trim() && 'behaviour (how it changes what you do)',
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) return `Error: memory not replaced. Missing: ${missing.join(', ')}.`;
  if (input.type && !(ENTRY_TYPES as readonly string[]).includes(input.type)) {
    return `Error: type must be one of ${ENTRY_TYPES.join('|')}.`;
  }
  const location = locationFor(found.scope, ctx.workspaceRoot);
  const blocked = await guard(location, ctx.workspaceRoot);
  if (blocked) return blocked;
  const scanned = scan(buildBody(input.content!, input.behaviour!));
  if (!scanned.ok) return scanned.message;

  return enqueueWrite(async () => {
    const current = await findEntry([location], found.id);
    if (!current) return `Error: memory ${found.id} changed while it was being replaced. Read it again with \`list\`.`;
    const terms = splitTerms(input.terms);
    await writeEntry(location, {
      ...current,
      type: (input.type as EntryType | undefined) ?? current.type,
      terms: terms.length > 0 ? terms : current.terms,
      confirmed: todayStamp(),
      body: scanned.text,
    }, current.delivery);
    await refreshIndex(location);
    await recordMetric('replace', { session: ctx.sessionId, id: current.id, scope: current.scope, delivery: current.delivery });
    if (!ctx.recalled.has(current.id)) {
      if (current.delivery === 'on-match') await recordMetric('miss', { session: ctx.sessionId, id: current.id, scope: current.scope });
      if (current.delivery === 'pinned') await recordMetric('pinned-break', { session: ctx.sessionId, id: current.id, scope: current.scope });
    }
    ctx.onChange?.({ action: 'replace', id: current.id, fact: input.content!.trim() });
    return `Saved: ${firstLine(input.content!)} [${current.id}, replaced]`;
  });
}

export async function removeEntry(ctx: EntryContext, id: string | undefined, reason: string | undefined): Promise<string> {
  const found = await findVisible(ctx, id);
  if (typeof found === 'string') return found;
  const location = locationFor(found.scope, ctx.workspaceRoot);
  const blocked = await guard(location, ctx.workspaceRoot);
  if (blocked) return blocked;
  return enqueueWrite(async () => {
    const current = await findEntry([location], found.id);
    if (!current) return `Error: no memory with id ${found.id}.`;
    await trashEntry(location, current, `removed by the agent${reason?.trim() ? `: ${reason.trim()}` : ''}`);
    await refreshIndex(location);
    await recordMetric('remove', { session: ctx.sessionId, id: current.id, scope: current.scope });
    ctx.onChange?.({ action: 'remove', id: current.id, fact: splitBody(current.body).fact });
    return `Removed: ${firstLine(current.body)} [${current.id}]. Restore it with \`restore\`.`;
  });
}

export async function restoreRemovedEntry(ctx: EntryContext, id: string | undefined): Promise<string> {
  if (!id || !isValidEntryId(id)) return 'Error: a valid entry id is required.';
  for (const location of locationsOf(ctx)) {
    const blocked = await guard(location, ctx.workspaceRoot);
    if (blocked) continue;
    const restored = await enqueueWrite(async () => {
      const entry = await restoreEntry(location, id);
      if (entry) await refreshIndex(location);
      return entry;
    });
    if (restored) {
      await recordMetric('restore', { session: ctx.sessionId, id, scope: restored.scope });
      return `Restored: ${describeEntry(restored)}`;
    }
  }
  return `Error: no removed memory with id ${id}.`;
}

export async function pinEntry(ctx: EntryContext, id: string | undefined): Promise<string> {
  const found = await findVisible(ctx, id);
  if (typeof found === 'string') return found;
  if (found.delivery === 'pinned') return `Already pinned: ${describeEntry(found)}`;
  const location = locationFor(found.scope, ctx.workspaceRoot);
  const blocked = await guard(location, ctx.workspaceRoot);
  if (blocked) return blocked;
  return enqueueWrite(async () => {
    const cap = readMemorySettings().pinnedCaps[found.scope];
    const pinned = await pinnedCount(location);
    if (pinned.length >= cap) return `Not pinned. ${capMessage(found.scope, cap, pinned)}`;
    const current = await findEntry([location], found.id);
    if (!current) return `Error: no memory with id ${found.id}.`;
    const moved = await moveEntry(location, current, 'pinned');
    await refreshIndex(location);
    await recordMetric('pin', { session: ctx.sessionId, id: moved.id, scope: moved.scope });
    return `Pinned: ${describeEntry(moved)}. It is in the system prompt from the next session.`;
  });
}

export async function unpinEntry(ctx: EntryContext, id: string | undefined): Promise<string> {
  const found = await findVisible(ctx, id);
  if (typeof found === 'string') return found;
  if (found.delivery === 'on-match') return `Already on-match: ${describeEntry(found)}`;
  const location = locationFor(found.scope, ctx.workspaceRoot);
  const blocked = await guard(location, ctx.workspaceRoot);
  if (blocked) return blocked;
  return enqueueWrite(async () => {
    const current = await findEntry([location], found.id);
    if (!current) return `Error: no memory with id ${found.id}.`;
    const moved = await moveEntry(location, current, 'on-match');
    await refreshIndex(location);
    await recordMetric('unpin', { session: ctx.sessionId, id: moved.id, scope: moved.scope });
    return `Unpinned: ${describeEntry(moved)}. It is kept and recalled when it matches.`;
  });
}

export async function listVisibleEntries(ctx: EntryContext): Promise<string> {
  const caps = readMemorySettings().pinnedCaps;
  const sections: string[] = [];
  for (const location of locationsOf(ctx)) {
    for (const delivery of ['pinned', 'on-match', 'unsorted'] as const) {
      if (location.scope === 'workspace' && delivery === 'unsorted') continue;
      const entries = await listEntries(location, delivery);
      const label = delivery === 'pinned' ? `${location.scope} pinned (${entries.length}/${caps[location.scope]})` : `${location.scope} ${delivery}`;
      if (entries.length === 0 && delivery !== 'pinned') continue;
      sections.push([`${label}:`, ...(entries.length > 0 ? entries.map((entry) => `- ${describeEntry(entry)}`) : ['- none'])].join('\n'));
    }
  }
  return sections.join('\n\n');
}
