/**
 * Kanban Extension — standard Pi extension with file-based state.
 *
 * Reads/writes `.sero/apps/kanban/state.json` relative to the workspace cwd.
 * Works in Pi CLI (no Sero dependency) and in Sero (where the web UI
 * watches the same file for live updates).
 *
 * Tools (LLM-callable): kanban (list, add, move, update, delete, show, start, approve, complete, retry)
 * Commands (user): /kanban
 */

import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { Column, Priority } from '../shared/types';
import { COLUMNS, COLUMN_LABELS, createCard } from '../shared/types';
import { validateManualMove } from '../shared/validation';
import { resolveStatePath, readState, writeState, formatCard, formatBoard } from './state-io';
import {
  handleStart, handleApprove, handleComplete,
  handleRetry, handleBrainstorm, handleSettings, handleCleanup,
  handleRequestRevisions, handleCancelPR,
  handleReportError, handleErrorLog, handleRetrospective,
} from './workflow-actions';

// ── Tool parameters ────────────────────────────────────────────

const KanbanParams = Type.Object({
  action: StringEnum(['list', 'add', 'move', 'update', 'delete', 'show', 'start', 'approve', 'complete', 'retry', 'brainstorm', 'settings', 'cleanup', 'request-revisions', 'cancel-pr', 'report-error', 'error-log', 'retrospective'] as const),
  title: Type.Optional(Type.String({ description: 'Card title (for add)' })),
  id: Type.Optional(Type.String({ description: 'Card ID' })),
  column: Type.Optional(StringEnum(COLUMNS)),
  priority: Type.Optional(StringEnum(['critical', 'high', 'medium', 'low'] as const)),
  description: Type.Optional(Type.String({ description: 'Card description' })),
  blockedBy: Type.Optional(Type.Array(Type.String(), { description: 'IDs of cards that must be done before this card can start' })),
  acceptance: Type.Optional(Type.Array(Type.String(), { description: 'Acceptance criteria' })),
  setting: Type.Optional(Type.String({ description: 'Setting name for settings action (testingEnabled, reviewMode, reviewLevel)' })),
  value: Type.Optional(Type.String({ description: 'Setting value for settings action' })),
  revisionFeedback: Type.Optional(Type.String({ description: 'Feedback text for request-revisions action' })),
  errorMessage: Type.Optional(Type.String({ description: 'Error message (for report-error)' })),
  errorDetails: Type.Optional(Type.String({ description: 'Full error details/stack trace (for report-error)' })),
  errorSeverity: Type.Optional(StringEnum(['error', 'warning', 'test-failure'] as const)),
  agentName: Type.Optional(Type.String({ description: 'Name of the subagent reporting the error (for report-error)' })),
  phase: Type.Optional(StringEnum(['planning', 'implementation', 'review'] as const)),
  filePaths: Type.Optional(Type.Array(Type.String(), { description: 'File paths involved in the error (for report-error)' })),
});

// ── Extension ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  // ── Tool: kanban ─────────────────────────────────────────────

  pi.registerTool({
    name: 'kanban',
    label: 'Kanban',
    description:
      'Manage the workspace Kanban board. IMPORTANT: Cards are implemented by automated orchestrator subagents — do NOT implement card work yourself. Your role is to manage the board, brainstorm, and approve. Actions: list (show board), add (requires title; optional description, priority, acceptance, blockedBy), move (requires id + column — for backward moves only), update (requires id; optional title/description/priority/acceptance/blockedBy), delete (requires id), show (requires id, detailed view), start (requires id — move card to planning, triggers automated agents), approve (requires id — approve plan and advance to in-progress), complete (requires id — only from review, mark as done), retry (requires id — re-trigger current phase), brainstorm (start collaborative card creation session), settings (view/update board settings), request-revisions (requires id + revisionFeedback — send card back to implementation with feedback), cancel-pr (requires id — cancel the PR, remove worktree, return card to backlog), report-error (requires id + errorMessage; optional errorDetails, errorSeverity, agentName, phase, filePaths — subagents report errors/failures here), error-log (view error log; optional id to filter by card), retrospective (analyze all logged errors and suggest process improvements).',
    parameters: KanbanParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return {
          content: [{ type: 'text', text: 'Error: no workspace cwd set' }],
          details: {},
        };
      }
      statePath = resolvedPath;

      const state = await readState(statePath);

      switch (params.action) {
        case 'list': {
          return {
            content: [{ type: 'text', text: formatBoard(state) }],
            details: {},
          };
        }

        case 'add': {
          if (!params.title) {
            return {
              content: [{ type: 'text', text: 'Error: title is required for add' }],
              details: {},
            };
          }
          const id = String(state.nextId);
          // Validate blockedBy references if provided
          if (params.blockedBy?.length) {
            const missing = params.blockedBy.filter(
              (depId) => !state.cards.some((c) => c.id === depId),
            );
            if (missing.length > 0) {
              return {
                content: [{ type: 'text', text: `Error: blockedBy references non-existent card(s): ${missing.map((id) => `#${id}`).join(', ')}` }],
                details: {},
              };
            }
          }
          const card = createCard(id, params.title, {
            description: params.description,
            priority: params.priority as Priority | undefined,
            acceptance: params.acceptance,
            blockedBy: params.blockedBy,
          });
          state.cards.push(card);
          state.nextId++;
          await writeState(statePath, state);
          const blockedInfo = card.blockedBy?.length
            ? ` (blocked by ${card.blockedBy.map((d) => `#${d}`).join(', ')})`
            : '';
          return {
            content: [{ type: 'text', text: `Added card #${id}: ${card.title} → Backlog${blockedInfo}` }],
            details: {},
          };
        }

        case 'move': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for move' }],
              details: {},
            };
          }
          if (!params.column) {
            return {
              content: [{ type: 'text', text: 'Error: column is required for move' }],
              details: {},
            };
          }
          const card = state.cards.find((c) => c.id === params.id);
          if (!card) {
            return {
              content: [{ type: 'text', text: `Card #${params.id} not found` }],
              details: {},
            };
          }
          const fromCol = card.column;
          const toCol = params.column as Column;
          const validation = validateManualMove(card, toCol);
          if (!validation.valid) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Cannot move to "${COLUMN_LABELS[toCol]}" directly.\n${validation.errors.map((error) => `  • ${error}`).join('\n')}`,
                },
              ],
              details: {},
            };
          }
          card.column = toCol;
          card.status = 'idle';
          card.error = undefined;
          if (toCol !== 'review') {
            card.previewServerId = undefined;
            card.previewUrl = undefined;
          }
          if (toCol === 'backlog') {
            card.completedAt = undefined;
            card.planningProgress = undefined;
            card.implementationProgress = undefined;
            card.reviewProgress = undefined;
          }
          card.updatedAt = new Date().toISOString();
          await writeState(statePath, state);
          return {
            content: [
              {
                type: 'text',
                text: `Moved #${card.id} "${card.title}": ${COLUMN_LABELS[fromCol]} → ${COLUMN_LABELS[card.column]}`,
              },
            ],
            details: {},
          };
        }

        case 'update': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for update' }],
              details: {},
            };
          }
          const card = state.cards.find((c) => c.id === params.id);
          if (!card) {
            return {
              content: [{ type: 'text', text: `Card #${params.id} not found` }],
              details: {},
            };
          }
          const changes: string[] = [];
          if (params.title) {
            card.title = params.title;
            changes.push(`title="${params.title}"`);
          }
          if (params.description) {
            card.description = params.description;
            changes.push('description updated');
          }
          if (params.priority) {
            card.priority = params.priority as Priority;
            changes.push(`priority=${params.priority}`);
          }
          if (params.acceptance) {
            card.acceptance = params.acceptance;
            changes.push(`acceptance (${params.acceptance.length} criteria)`);
          }
          if (params.blockedBy) {
            card.blockedBy = params.blockedBy;
            changes.push(`blockedBy=[${params.blockedBy.map((d) => `#${d}`).join(', ')}]`);
          }
          card.updatedAt = new Date().toISOString();
          await writeState(statePath, state);
          return {
            content: [
              {
                type: 'text',
                text: `Updated #${card.id}: ${changes.join(', ') || 'no changes'}`,
              },
            ],
            details: {},
          };
        }

        case 'delete': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for delete' }],
              details: {},
            };
          }
          const idx = state.cards.findIndex((c) => c.id === params.id);
          if (idx === -1) {
            return {
              content: [{ type: 'text', text: `Card #${params.id} not found` }],
              details: {},
            };
          }
          const removed = state.cards.splice(idx, 1)[0];
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Deleted #${removed.id}: ${removed.title}` }],
            details: {},
          };
        }

        case 'show': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for show' }],
              details: {},
            };
          }
          const card = state.cards.find((c) => c.id === params.id);
          if (!card) {
            return {
              content: [{ type: 'text', text: `Card #${params.id} not found` }],
              details: {},
            };
          }
          return {
            content: [{ type: 'text', text: formatCard(card, true) }],
            details: {},
          };
        }

        case 'start':
          if (!params.id) return { content: [{ type: 'text', text: 'Error: id is required for start' }], details: {} };
          return handleStart(statePath, state, params.id);

        case 'approve':
          if (!params.id) return { content: [{ type: 'text', text: 'Error: id is required for approve' }], details: {} };
          return handleApprove(statePath, state, params.id);

        case 'complete':
          if (!params.id) return { content: [{ type: 'text', text: 'Error: id is required for complete' }], details: {} };
          return handleComplete(statePath, state, params.id);

        case 'retry':
          if (!params.id) return { content: [{ type: 'text', text: 'Error: id is required for retry' }], details: {} };
          return handleRetry(statePath, state, params.id);

        case 'brainstorm':
          return handleBrainstorm(pi);

        case 'settings':
          return handleSettings(statePath, state, params.setting, params.value);

        case 'cleanup':
          return handleCleanup(statePath, state, resolvedPath);

        case 'request-revisions':
          if (!params.id) return { content: [{ type: 'text', text: 'Error: id is required for request-revisions' }], details: {} };
          if (!params.revisionFeedback) return { content: [{ type: 'text', text: 'Error: revisionFeedback is required for request-revisions' }], details: {} };
          return handleRequestRevisions(statePath, state, params.id, params.revisionFeedback);

        case 'cancel-pr':
          if (!params.id) return { content: [{ type: 'text', text: 'Error: id is required for cancel-pr' }], details: {} };
          return handleCancelPR(statePath, state, params.id, resolvedPath);

        case 'report-error':
          return handleReportError(statePath, state, {
            id: params.id,
            errorMessage: params.errorMessage,
            errorDetails: params.errorDetails,
            errorSeverity: params.errorSeverity,
            agentName: params.agentName,
            phase: params.phase,
            filePaths: params.filePaths,
          });

        case 'error-log':
          return handleErrorLog(statePath, params.id);

        case 'retrospective':
          return handleRetrospective(statePath, pi);

        default:
          return {
            content: [{ type: 'text', text: `Unknown action: ${params.action}` }],
            details: {},
          };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('kanban '));
      text += theme.fg('muted', args.action);
      if (args.title) text += ` ${theme.fg('dim', `"${args.title}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg('accent', `#${args.id}`)}`;
      if (args.column) text += ` → ${theme.fg('accent', args.column)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      if (msg.startsWith('Error:')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Command: /kanban ────────────────────────────────────────

  pi.registerCommand('kanban', {
    description: 'Show the Kanban board or manage cards (pass instructions inline)',
    handler: async (args, _ctx) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the kanban tool: ${instruction}`);
      } else {
        pi.sendUserMessage('List all cards on the Kanban board using the kanban tool.');
      }
    },
  });
}
