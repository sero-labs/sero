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
import { resolveStatePath, readState, writeState, formatCard, formatBoard } from './state-io';

// ── Tool parameters ────────────────────────────────────────────

const KanbanParams = Type.Object({
  action: StringEnum(['list', 'add', 'move', 'update', 'delete', 'show', 'start', 'approve', 'complete', 'retry'] as const),
  title: Type.Optional(Type.String({ description: 'Card title (for add)' })),
  id: Type.Optional(Type.String({ description: 'Card ID' })),
  column: Type.Optional(StringEnum(COLUMNS)),
  priority: Type.Optional(StringEnum(['critical', 'high', 'medium', 'low'] as const)),
  description: Type.Optional(Type.String({ description: 'Card description' })),
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
      'Manage the workspace Kanban board. Actions: list (show board), add (requires title), move (requires id + column), update (requires id, optional title/description/priority), delete (requires id), show (requires id, detailed view), start (requires id — move card to planning and trigger automated analysis), approve (requires id — approve plan and advance card to in-progress), complete (requires id — mark card as done, clean up worktree), retry (requires id — re-trigger the current phase for a stuck or failed card).',
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
          const card = createCard(id, params.title, {
            description: params.description,
            priority: params.priority as Priority | undefined,
          });
          state.cards.push(card);
          state.nextId++;
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Added card #${id}: ${card.title} → Backlog` }],
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
          card.column = params.column as Column;
          card.updatedAt = new Date().toISOString();
          if (params.column === 'done' && !card.completedAt) {
            card.completedAt = new Date().toISOString();
          }
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

        case 'start': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for start' }],
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
          if (card.column !== 'backlog') {
            return {
              content: [
                {
                  type: 'text',
                  text: `Card #${card.id} is in "${COLUMN_LABELS[card.column]}" — only backlog cards can be started`,
                },
              ],
              details: {},
            };
          }
          card.column = 'planning';
          card.status = 'agent-working';
          card.updatedAt = new Date().toISOString();
          await writeState(statePath, state);
          return {
            content: [
              {
                type: 'text',
                text: `Started #${card.id} "${card.title}" → Planning. Automated analysis will begin shortly.`,
              },
            ],
            details: {},
          };
        }

        case 'approve': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for approve' }],
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
          if (card.column !== 'planning' || card.status !== 'waiting-input') {
            return {
              content: [
                {
                  type: 'text',
                  text: `Card #${card.id} is not awaiting approval (column: ${card.column}, status: ${card.status})`,
                },
              ],
              details: {},
            };
          }
          card.column = 'in-progress';
          card.status = 'idle';
          card.updatedAt = new Date().toISOString();
          await writeState(statePath, state);

          const subtaskInfo = card.subtasks.length > 0
            ? ` with ${card.subtasks.length} subtasks`
            : '';
          return {
            content: [
              {
                type: 'text',
                text: `Approved #${card.id} "${card.title}" → In Progress${subtaskInfo}`,
              },
            ],
            details: {},
          };
        }

        case 'retry': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for retry' }],
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
          const retryableColumns: Column[] = ['planning', 'in-progress', 'review'];
          if (!retryableColumns.includes(card.column)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Card #${card.id} is in "${COLUMN_LABELS[card.column]}" — retry only works for planning, in-progress, or review cards`,
                },
              ],
              details: {},
            };
          }
          if (card.status === 'agent-working') {
            return {
              content: [
                {
                  type: 'text',
                  text: `Card #${card.id} is already being processed (status: agent-working)`,
                },
              ],
              details: {},
            };
          }
          card.status = 'agent-working';
          card.error = undefined;
          card.updatedAt = new Date().toISOString();
          await writeState(statePath, state);
          return {
            content: [
              {
                type: 'text',
                text: `Retrying #${card.id} "${card.title}" in ${COLUMN_LABELS[card.column]}. Orchestrator will pick it up shortly.`,
              },
            ],
            details: {},
          };
        }

        case 'complete': {
          if (!params.id) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for complete' }],
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
          if (card.column === 'done') {
            return {
              content: [{ type: 'text', text: `Card #${card.id} is already done` }],
              details: {},
            };
          }
          card.column = 'done';
          card.status = 'idle';
          card.completedAt = card.completedAt ?? new Date().toISOString();
          card.updatedAt = new Date().toISOString();
          await writeState(statePath, state);

          const prInfo = card.prUrl ? ` (PR: ${card.prUrl})` : '';
          return {
            content: [
              {
                type: 'text',
                text: `Completed #${card.id} "${card.title}" → Done${prInfo}`,
              },
            ],
            details: {},
          };
        }

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
