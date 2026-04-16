/**
 * Kanban workflow action handlers — start, approve, complete, retry, brainstorm, settings.
 *
 * Extracted from index.ts for file size compliance.
 */

import type { KanbanState, Column, ErrorSeverity } from '../shared/types';
import type { KanbanSessionRuntime } from './session-runtime';
import { COLUMN_LABELS } from '../shared/types';
import { validateCardTransition } from '../shared/validation';
import { writeState } from './state-io';
import {
  appendError, readErrorLog, formatErrorLog,
  generateRetrospectiveSummary, writeErrorLog,
} from './error-log';
import { removeWorktree } from './worktree-cleanup';
import { formatCleanupWarnings } from './cleanup-warnings';
import {
  formatKanbanSettingsSummary,
  updateKanbanSetting,
} from '../shared/settings-descriptor';

type ToolResult = { content: { type: 'text'; text: string }[]; details: Record<string, never> };

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
  card.previewServerId = undefined;
  card.previewUrl = undefined;
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
  card.previewServerId = undefined;
  card.previewUrl = undefined;
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
  card.previewServerId = undefined;
  card.previewUrl = undefined;
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
  card.previewServerId = undefined;
  card.previewUrl = undefined;
  card.updatedAt = new Date().toISOString();
  await writeState(statePath, state);
  return text(`Retrying #${card.id} "${card.title}" in ${COLUMN_LABELS[card.column]}. Orchestrator will pick it up shortly.`);
}

// ── Brainstorm ───────────────────────────────────────────────

export async function handleBrainstorm(runtime: KanbanSessionRuntime): Promise<ToolResult> {
  await runtime.sendUserMessage('/brainstorm', { deliverAs: 'followUp' });
  return text('Queued the /brainstorm workflow in the chat session.');
}

// ── Settings ─────────────────────────────────────────────────

export async function handleSettings(
  statePath: string,
  state: KanbanState,
  setting?: string,
  value?: string,
): Promise<ToolResult> {
  if (!setting) {
    return text(formatKanbanSettingsSummary(state.settings));
  }

  const result = updateKanbanSetting(state.settings, setting, value);
  if (!result.ok) {
    return text(result.message);
  }

  await writeState(statePath, state);
  return text(result.message);
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
  const warnings: string[] = [];
  for (const card of doneCards) {
    if (!card.worktreePath) continue;
    const cardWarnings = (await removeWorktree(cwd, card.worktreePath)) ?? [];
    warnings.push(...cardWarnings);
    card.worktreePath = undefined;
    cleaned.push(`#${card.id}`);
    for (const warning of cardWarnings) {
      await appendError(statePath, {
        cardId: card.id,
        cardTitle: card.title,
        phase: 'review',
        agentName: 'system',
        severity: 'warning',
        message: warning,
      });
    }
  }

  await writeState(statePath, state);
  return text(`Cleaned up ${cleaned.length} worktree(s): ${cleaned.join(', ')}` + formatCleanupWarnings(warnings));
}

// ── Report Error ────────────────────────────────────────────

export async function handleReportError(
  statePath: string,
  state: KanbanState,
  params: {
    id?: string;
    errorMessage?: string;
    errorDetails?: string;
    errorSeverity?: string;
    agentName?: string;
    phase?: string;
    filePaths?: string[];
  },
): Promise<ToolResult> {
  if (!params.id) return text('Error: id is required for report-error');
  if (!params.errorMessage) return text('Error: errorMessage is required for report-error');

  const card = state.cards.find((c) => c.id === params.id);
  if (!card) return text(`Card #${params.id} not found`);

  const severity = (params.errorSeverity as ErrorSeverity) ?? 'error';
  const phase = (params.phase as 'planning' | 'implementation' | 'review') ?? inferPhase(card.column);
  const agentName = params.agentName ?? 'unknown';

  const report = await appendError(statePath, {
    cardId: card.id,
    cardTitle: card.title,
    phase,
    agentName,
    severity,
    message: params.errorMessage,
    details: params.errorDetails,
    filePaths: params.filePaths,
  });

  return text(
    `Error logged (${report.id}): [${severity}] ${agentName}/${phase} on card #${card.id} — ${params.errorMessage}`,
  );
}

function inferPhase(column: Column): 'planning' | 'implementation' | 'review' {
  if (column === 'planning') return 'planning';
  if (column === 'review') return 'review';
  return 'implementation';
}

// ── Error Log ───────────────────────────────────────────────

export async function handleErrorLog(statePath: string, cardId?: string): Promise<ToolResult> {
  const log = await readErrorLog(statePath);
  if (cardId) {
    const cardErrors = log.errors.filter((e) => e.cardId === cardId);
    if (cardErrors.length === 0) return text(`No errors recorded for card #${cardId}.`);
    return text(formatErrorLog({ ...log, errors: cardErrors }));
  }
  return text(formatErrorLog(log));
}

// ── Retrospective ───────────────────────────────────────────

export async function handleRetrospective(
  statePath: string,
  runtime: KanbanSessionRuntime,
): Promise<ToolResult> {
  const log = await readErrorLog(statePath);
  if (log.errors.length === 0) {
    return text('No errors recorded — nothing to retrospect on. The board is running clean!');
  }

  const summary = generateRetrospectiveSummary(log);

  // Mark the retrospective timestamp
  log.lastRetrospectiveAt = new Date().toISOString();
  await writeErrorLog(statePath, log);

  // Send the retrospective data to the agent for analysis
  await runtime.sendUserMessage(
    'Perform a retrospective analysis on the Kanban board errors below. '
    + 'Identify root causes, recurring patterns, and suggest concrete process '
    + 'improvements to prevent these errors in future. Group your findings by:\n'
    + '1. **Most impactful issues** — errors that blocked progress or recurred\n'
    + '2. **Root cause analysis** — why these errors happened\n'
    + '3. **Process improvements** — specific, actionable changes to prevent them\n'
    + '4. **Agent/phase hotspots** — which agents or phases need attention\n\n'
    + 'Here is the error data:\n\n'
    + summary,
  );

  return text(
    `Retrospective started — analyzing ${log.errors.length} error(s) across the board. Check the chat panel.`,
  );
}
