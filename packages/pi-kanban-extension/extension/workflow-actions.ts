/**
 * Kanban workflow action handlers — start, approve, complete, retry, brainstorm, settings.
 *
 * Extracted from index.ts for file size compliance.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import { execFile } from 'node:child_process';
import { promises as fsPromises } from 'node:fs';
import { promisify } from 'node:util';

import type { KanbanState, Column } from '../shared/types';
import { COLUMN_LABELS } from '../shared/types';
import { validateCardTransition } from '../shared/validation';
import { writeState } from './state-io';

type ToolResult = { content: { type: 'text'; text: string }[]; details: Record<string, never> };

const execFileAsync = promisify(execFile);

function text(msg: string): ToolResult {
  return { content: [{ type: 'text', text: msg }], details: {} };
}

// ── Start ────────────────────────────────────────────────────

export async function handleStart(
  statePath: string, state: KanbanState, id: string,
): Promise<ToolResult> {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return text(`Card #${id} not found`);

  if (card.column !== 'backlog') {
    return text(`Card #${card.id} is in "${COLUMN_LABELS[card.column]}" — only backlog cards can be started`);
  }

  const validation = validateCardTransition(card, 'planning', state);
  if (!validation.valid) {
    return text(`Cannot start card #${card.id}:\n${validation.errors.map((e) => `  • ${e}`).join('\n')}`);
  }

  card.column = 'planning';
  card.status = 'agent-working';
  card.updatedAt = new Date().toISOString();
  await writeState(statePath, state);
  return text(`Started #${card.id} "${card.title}" → Planning. Automated analysis will begin shortly.`);
}

// ── Approve ──────────────────────────────────────────────────

export async function handleApprove(
  statePath: string, state: KanbanState, id: string,
): Promise<ToolResult> {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return text(`Card #${id} not found`);

  const validation = validateCardTransition(card, 'in-progress');
  if (!validation.valid) {
    return text(`Cannot approve card #${card.id}:\n${validation.errors.map((e) => `  • ${e}`).join('\n')}`);
  }

  card.column = 'in-progress';
  card.status = 'idle';
  card.updatedAt = new Date().toISOString();
  await writeState(statePath, state);

  const subtaskInfo = card.subtasks.length > 0 ? ` with ${card.subtasks.length} subtasks` : '';
  return text(`Approved #${card.id} "${card.title}" → In Progress${subtaskInfo}`);
}

// ── Complete ─────────────────────────────────────────────────

export async function handleComplete(
  statePath: string, state: KanbanState, id: string,
): Promise<ToolResult> {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return text(`Card #${id} not found`);

  if (card.column === 'done') return text(`Card #${card.id} is already done`);

  // Cards must go through the full workflow — only review→done is allowed
  if (card.column !== 'review') {
    return text(
      `Card #${card.id} is in "${COLUMN_LABELS[card.column]}" — only cards in Review can be completed. `
      + 'Cards must go through the full workflow: Backlog → Planning → In Progress → Review → Done.',
    );
  }

  const validation = validateCardTransition(card, 'done');
  if (!validation.valid) {
    return text(`Cannot complete card #${card.id}:\n${validation.errors.map((e) => `  • ${e}`).join('\n')}`);
  }

  card.column = 'done';
  card.status = 'idle';
  card.completedAt = card.completedAt ?? new Date().toISOString();
  card.updatedAt = new Date().toISOString();
  await writeState(statePath, state);

  const prInfo = card.prUrl ? ` (PR: ${card.prUrl})` : '';
  return text(`Completed #${card.id} "${card.title}" → Done${prInfo}`);
}

// ── Retry ────────────────────────────────────────────────────

export async function handleRetry(
  statePath: string, state: KanbanState, id: string,
): Promise<ToolResult> {
  const card = state.cards.find((c) => c.id === id);
  if (!card) return text(`Card #${id} not found`);

  const retryableColumns: Column[] = ['planning', 'in-progress', 'review'];
  if (!retryableColumns.includes(card.column)) {
    return text(`Card #${card.id} is in "${COLUMN_LABELS[card.column]}" — retry only works for planning, in-progress, or review cards`);
  }
  if (card.status === 'agent-working') {
    return text(`Card #${card.id} is already being processed (status: agent-working)`);
  }

  card.status = 'agent-working';
  card.error = undefined;
  card.updatedAt = new Date().toISOString();
  await writeState(statePath, state);
  return text(`Retrying #${card.id} "${card.title}" in ${COLUMN_LABELS[card.column]}. Orchestrator will pick it up shortly.`);
}

// ── Brainstorm ───────────────────────────────────────────────

export function handleBrainstorm(pi: ExtensionAPI): ToolResult {
  pi.sendUserMessage(
    'I want to brainstorm new features for this project. '
    + 'Follow the /brainstorm workflow: read the workspace context, '
    + 'ask me questions one at a time to refine the idea, propose approaches, '
    + 'and create well-scoped kanban cards when we\'re done. '
    + 'IMPORTANT: After creating the cards, your job is DONE. '
    + 'Do NOT implement any code yourself — the kanban orchestrator\'s '
    + 'automated subagents handle all implementation. Just use "kanban start" '
    + 'to kick off the first card and let the automation take over.',
  );
  return text('Brainstorming session started — check the chat panel.');
}

// ── Settings ─────────────────────────────────────────────────

export async function handleSettings(
  statePath: string,
  state: KanbanState,
  setting?: string,
  value?: string,
): Promise<ToolResult> {
  if (!setting) {
    const s = state.settings;
    return text(
      `## Board Settings\n- yoloMode: ${s.yoloMode} (auto-start, auto-approve, auto-complete)\n`
      + `- testingEnabled: ${s.testingEnabled} (TDD and test generation)\n`
      + `- reviewLevel: ${s.reviewLevel} (per-wave or per-subtask)\n`
      + `- autoAdvance: ${s.autoAdvance}\n- maxConcurrentCards: ${s.maxConcurrentCards}`,
    );
  }

  if (setting === 'yoloMode') {
    state.settings.yoloMode = value === 'true';
    await writeState(statePath, state);
    return text(`YOLO mode ${state.settings.yoloMode ? 'ON — full auto, no human gates' : 'OFF — human approval required'}`);
  }
  if (setting === 'testingEnabled') {
    state.settings.testingEnabled = value === 'true';
    await writeState(statePath, state);
    return text(`Mode: ${state.settings.testingEnabled ? 'Production (TDD enabled)' : 'Prototype (testing disabled)'}`);
  }
  if (setting === 'reviewLevel' && (value === 'per-wave' || value === 'per-subtask')) {
    state.settings.reviewLevel = value;
    await writeState(statePath, state);
    return text(`Review level set to: ${value}`);
  }

  return text(`Unknown setting "${setting}". Available: yoloMode, testingEnabled, reviewLevel`);
}

// ── Cleanup ──────────────────────────────────────────────────

export async function handleCleanup(
  statePath: string,
  state: KanbanState,
  cwd: string,
): Promise<ToolResult> {
  const doneCards = state.cards.filter((c) => c.column === 'done' && c.worktreePath);
  if (doneCards.length === 0) {
    return text('No worktrees to clean up — all done cards already cleaned.');
  }

  const notDone = state.cards.filter((c) => c.column !== 'done');
  if (notDone.length > 0) {
    return text(
      `Cannot clean up worktrees — ${notDone.length} card(s) still in progress:\n`
      + notDone.map((c) => `  • #${c.id} "${c.title}" (${COLUMN_LABELS[c.column]})`).join('\n')
      + '\n\nWait until all cards are done before cleaning up.',
    );
  }

  // All cards done — remove worktrees
  const cleaned: string[] = [];
  for (const card of doneCards) {
    if (!card.worktreePath) continue;
    try {
      await execFileAsync('git', ['worktree', 'remove', card.worktreePath, '--force'], {
        cwd,
        timeout: 15_000,
      });
      await execFileAsync('git', ['worktree', 'prune'], {
        cwd,
        timeout: 10_000,
      }).catch(() => {});
    } catch {
      await fsPromises.rm(card.worktreePath, { recursive: true, force: true });
      await execFileAsync('git', ['worktree', 'prune'], {
        cwd,
        timeout: 10_000,
      }).catch(() => {});
    } finally {
      card.worktreePath = undefined;
      cleaned.push(`#${card.id}`);
    }
  }

  await writeState(statePath, state);
  return text(`Cleaned up ${cleaned.length} worktree(s): ${cleaned.join(', ')}`);
}
