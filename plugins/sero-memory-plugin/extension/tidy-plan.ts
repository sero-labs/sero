/**
 * The tidy-up's model contract (design D9): the prompt, and strict validation
 * of the JSON decisions that come back. The model interprets the text; this
 * code only checks format and evidence. A decision that is not valid is
 * dropped with its reason. Output that is not valid as a whole changes nothing.
 */

import path from 'node:path';

import { ENTRY_TYPES, type EntryType, type Scope } from './entry-format';
import type { StoredEntry } from './entry-store';

export interface TidyEntryView {
  id: string;
  delivery: StoredEntry['delivery'];
  type: EntryType;
  created: string;
  confirmed: string;
  terms: string[];
  body: string;
  /** On-match and not recalled in 60 days: the model re-checks it. */
  recheck: boolean;
}

export interface MergedEntryDraft {
  type: EntryType;
  body: string;
  terms: string[];
  delivery: 'pinned' | 'on-match';
}

export type TidyDecision =
  | { action: 'keep' | 'recheck'; id: string; reason: string }
  | { action: 'sort'; id: string; delivery: 'pinned' | 'on-match'; reason: string }
  | { action: 'merge'; ids: string[]; merged: MergedEntryDraft; reason: string }
  | { action: 'remove'; id: string; missingPath: string; reason: string };

export interface RejectedDecision {
  decision: unknown;
  reason: string;
}

export interface ValidatedPlan {
  decisions: TidyDecision[];
  rejected: RejectedDecision[];
}

export const TIDY_SYSTEM_PROMPT = [
  'You tidy a list of long-term memories for a coding assistant. Reply with JSON only.',
  '',
  'Return {"decisions": [...]} with one object per decision:',
  '- {"action":"keep","id":"…","reason":"…"} — the memory is fine as it is.',
  '- {"action":"recheck","id":"…","reason":"…"} — for a memory marked recheck that is still valid.',
  '- {"action":"sort","id":"…","delivery":"pinned"|"on-match","reason":"…"} — only for a memory in "unsorted". pinned is for rules that apply to most tasks; on-match is for facts that apply only to some tasks.',
  '- {"action":"merge","ids":["…","…"],"merged":{"type":"preference|decision|lesson|reference","body":"…","terms":["…"],"delivery":"pinned"|"on-match"},"reason":"…"} — two or more memories say the same thing, or a newer one supersedes an older one. The merged body keeps every fact still true and says how it changes behaviour; for a superseded fact, keep the newer one.',
  '- {"action":"remove","id":"…","missingPath":"…","reason":"…"} — only for a workspace memory that names a file path in its own text, when that file is the whole point of the memory. Give the path exactly as the memory writes it. The code removes the memory only if that file does not exist in the workspace.',
  '',
  'Rules:',
  '- Never remove a memory because it is old, unused or because you disagree with it. When unsure, keep it.',
  '- A command name, a package name or a path outside the workspace is not evidence for a removal.',
  '- Every memory id must appear in at most one decision.',
].join('\n');

export function buildTidyPrompt(scope: Scope, entries: TidyEntryView[], pinnedCap: number, workspaceRoot?: string): string {
  return [
    `Scope: ${scope}${workspaceRoot ? ` (workspace ${workspaceRoot})` : ''}.`,
    `At most ${pinnedCap} memories can be pinned in this scope; the code moves extra pinned ones to on-match.`,
    scope === 'global' ? 'This is the global scope: remove decisions are not allowed here.' : '',
    '',
    'Memories:',
    JSON.stringify(entries, null, 2),
  ].filter((line) => line !== '').join('\n');
}

function extractJson(output: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(output);
  const candidate = (fenced?.[1] ?? output).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the output');
  return JSON.parse(candidate.slice(start, end + 1));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDelivery(value: unknown): value is 'pinned' | 'on-match' {
  return value === 'pinned' || value === 'on-match';
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value as string[] : null;
}

/**
 * Checks a named path is evidence at all: a relative file path with an
 * extension, inside the workspace. Commands, package names and outside paths
 * are not.
 */
export function resolveEvidencePath(workspaceRoot: string, missingPath: string): string | null {
  const trimmed = missingPath.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.startsWith('@') || trimmed.startsWith('-')) return null;
  if (!/\.[A-Za-z0-9]{1,10}$/.test(path.basename(trimmed))) return null;
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, trimmed);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

/**
 * Validates model output against the entries the tidy-up read.
 * @throws when the output as a whole is not valid; nothing may change then.
 */
export function validatePlan(output: string, entries: Map<string, TidyEntryView>, scope: Scope, workspaceRoot?: string): ValidatedPlan {
  const parsed = extractJson(output);
  if (!isRecord(parsed) || !Array.isArray(parsed.decisions)) throw new Error('output has no decisions array');

  const decisions: TidyDecision[] = [];
  const rejected: RejectedDecision[] = [];
  const used = new Set<string>();
  const reject = (decision: unknown, reason: string) => { rejected.push({ decision, reason }); };

  for (const raw of parsed.decisions) {
    if (!isRecord(raw) || typeof raw.action !== 'string') {
      reject(raw, 'not a decision object');
      continue;
    }
    const reason = typeof raw.reason === 'string' ? raw.reason : '';
    const ids = raw.action === 'merge' ? stringList(raw.ids) : typeof raw.id === 'string' ? [raw.id] : null;
    if (!ids || ids.length === 0) {
      reject(raw, 'missing id');
      continue;
    }
    if (ids.some((id) => !entries.has(id))) {
      reject(raw, 'names a memory that was not in the list');
      continue;
    }
    if (ids.some((id) => used.has(id))) {
      reject(raw, 'a memory appears in more than one decision');
      continue;
    }

    switch (raw.action) {
      case 'keep':
      case 'recheck':
        decisions.push({ action: raw.action, id: ids[0]!, reason });
        break;
      case 'sort':
        if (entries.get(ids[0]!)!.delivery !== 'unsorted') { reject(raw, 'only unsorted memories are sorted'); continue; }
        if (!isDelivery(raw.delivery)) { reject(raw, 'delivery must be pinned or on-match'); continue; }
        decisions.push({ action: 'sort', id: ids[0]!, delivery: raw.delivery, reason });
        break;
      case 'merge': {
        const merged = raw.merged;
        if (ids.length < 2 || new Set(ids).size !== ids.length) { reject(raw, 'a merge needs two or more different memories'); continue; }
        if (!isRecord(merged) || typeof merged.body !== 'string' || !merged.body.trim()
          || !(ENTRY_TYPES as readonly unknown[]).includes(merged.type) || !stringList(merged.terms)
          || !isDelivery(merged.delivery)) {
          reject(raw, 'the merged memory is not complete');
          continue;
        }
        decisions.push({
          action: 'merge',
          ids,
          merged: { type: merged.type as EntryType, body: merged.body.trim(), terms: stringList(merged.terms)!, delivery: merged.delivery },
          reason,
        });
        break;
      }
      case 'remove': {
        const missingPath = typeof raw.missingPath === 'string' ? raw.missingPath : '';
        const entry = entries.get(ids[0]!)!;
        if (scope !== 'workspace' || !workspaceRoot) { reject(raw, 'a global memory is never removed for a missing file'); continue; }
        if (!missingPath || !`${entry.body} ${entry.terms.join(' ')}`.includes(missingPath.trim())) {
          reject(raw, 'the path is not named in the memory');
          continue;
        }
        if (!resolveEvidencePath(workspaceRoot, missingPath)) { reject(raw, 'the evidence is not a file path inside the workspace'); continue; }
        decisions.push({ action: 'remove', id: ids[0]!, missingPath: missingPath.trim(), reason });
        break;
      }
      default:
        reject(raw, `unknown action ${String(raw.action)}`);
        continue;
    }
    for (const id of ids) used.add(id);
  }
  return { decisions, rejected };
}
