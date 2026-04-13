/**
 * Kanban state file I/O and formatting helpers.
 *
 * Extracted from index.ts for file size compliance.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { KanbanState, Card } from '../shared/types';
import {
  createDefaultKanbanState,
  COLUMNS,
  COLUMN_LABELS,
  PRIORITY_ORDER,
} from '../shared/types';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'kanban', 'state.json');

export function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O (atomic writes) ───────────────────────────────────

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function createStateReadError(filePath: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Kanban board state at ${filePath} is unreadable. Repair or remove the malformed file before retrying. Original error: ${detail}`,
  );
}

export async function readState(filePath: string): Promise<KanbanState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as KanbanState;
  } catch (error) {
    if (isMissingFileError(error)) {
      return createDefaultKanbanState();
    }
    throw createStateReadError(filePath, error);
  }
}

export async function writeState(filePath: string, state: KanbanState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Formatting ──────────────────────────────────────────────────

export function formatCard(card: Card, verbose = false): string {
  const priority = card.priority === 'critical' ? '!!!' : card.priority === 'high' ? '!!' : card.priority === 'medium' ? '!' : '';
  const status =
    card.status === 'agent-working' ? ' [working]' :
    card.status === 'waiting-input' ? ' [waiting]' :
    card.status === 'paused' ? ' [paused]' :
    card.status === 'failed' ? ' [FAILED]' : '';
  const blocked = card.blockedBy?.length
    ? ` 🔒 blocked by ${card.blockedBy.map((d) => `#${d}`).join(', ')}`
    : '';

  let line = `#${card.id} ${priority ? `(${priority}) ` : ''}${card.title} — ${COLUMN_LABELS[card.column]}${status}${blocked}`;

  if (verbose) {
    if (card.description) line += `\n   ${card.description}`;
    if (card.acceptance.length > 0) {
      line += `\n   Acceptance: ${card.acceptance.map((a) => `✓ ${a}`).join('; ')}`;
    }
    if (card.subtasks.length > 0) {
      const done = card.subtasks.filter((s) => s.status === 'completed').length;
      line += `\n   Subtasks: ${done}/${card.subtasks.length}`;
    }
    if (card.branch) line += `\n   Branch: ${card.branch}`;
    if (card.prUrl) line += `\n   PR: ${card.prUrl}`;
    if (card.error) line += `\n   Error: ${card.error}`;
  }

  return line;
}

export function formatBoard(state: KanbanState): string {
  if (state.cards.length === 0) return 'No cards on the board.';

  const lines: string[] = [];
  for (const col of COLUMNS) {
    const cards = state.cards
      .filter((c) => c.column === col)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    if (cards.length === 0) continue;

    lines.push(`\n## ${COLUMN_LABELS[col]} (${cards.length})`);
    for (const card of cards) {
      lines.push(`  ${formatCard(card)}`);
    }
  }

  return lines.join('\n');
}
