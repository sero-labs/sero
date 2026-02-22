/**
 * Todo Extension — standard Pi extension with file-based state.
 *
 * Reads/writes `.sero/apps/todo/state.json` relative to the workspace cwd.
 * Works in Pi CLI (no Sero dependency) and in Sero (where the web UI
 * watches the same file for live updates).
 *
 * Tools (LLM-callable): todo (list, add, toggle, clear)
 * Commands (user): /todos
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { TodoState, Todo } from '../shared/types';
import { DEFAULT_TODO_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'todo', 'state.json');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O (atomic writes) ───────────────────────────────────

async function readState(filePath: string): Promise<TodoState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    console.log(`Loaded todo state from ${filePath}`);
    return JSON.parse(raw) as TodoState;
  } catch {
    return { ...DEFAULT_TODO_STATE };
  }
}

async function writeState(filePath: string, state: TodoState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Atomic write: write to temp, then rename
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Tool parameters ────────────────────────────────────────────

const TodoParams = Type.Object({
  action: StringEnum(['list', 'add', 'toggle', 'clear'] as const),
  text: Type.Optional(Type.String({ description: 'Todo text (for add)' })),
  id: Type.Optional(Type.Number({ description: 'Todo ID (for toggle)' })),
});

// ── Extension ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';

  // Resolve state path from session cwd (if events fire)
  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  // ── Tool: todo ─────────────────────────────────────────────

  pi.registerTool({
    name: 'todo',
    label: 'Todo',
    description:
      'Manage workspace todos. Actions: list (show all), add (requires text), toggle (requires id), clear (remove all).',
    parameters: TodoParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Resolve path from execution context (reliable) or cached session path
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
          const text = state.todos.length
            ? state.todos
                .map((t) => `[${t.done ? 'x' : ' '}] #${t.id}: ${t.text}`)
                .join('\n')
            : 'No todos yet.';
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'add': {
          if (!params.text) {
            return {
              content: [{ type: 'text', text: 'Error: text is required for add' }],
              details: {},
            };
          }
          const todo: Todo = {
            id: state.nextId,
            text: params.text,
            done: false,
            createdAt: new Date().toISOString(),
          };
          state.todos.push(todo);
          state.nextId++;
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Added todo #${todo.id}: ${todo.text}` }],
            details: {},
          };
        }

        case 'toggle': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for toggle' }],
              details: {},
            };
          }
          const todo = state.todos.find((t) => t.id === params.id);
          if (!todo) {
            return {
              content: [{ type: 'text', text: `Todo #${params.id} not found` }],
              details: {},
            };
          }
          todo.done = !todo.done;
          await writeState(statePath, state);
          return {
            content: [
              {
                type: 'text',
                text: `Todo #${todo.id} ${todo.done ? 'completed' : 'uncompleted'}`,
              },
            ],
            details: {},
          };
        }

        case 'clear': {
          const count = state.todos.length;
          await writeState(statePath, { ...DEFAULT_TODO_STATE });
          return {
            content: [{ type: 'text', text: `Cleared ${count} todos` }],
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
      let text = theme.fg('toolTitle', theme.bold('todo '));
      text += theme.fg('muted', args.action);
      if (args.text) text += ` ${theme.fg('dim', `"${args.text}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg('accent', `#${args.id}`)}`;
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

  // ── Command: /todos ────────────────────────────────────────

  pi.registerCommand('todos', {
    description: 'Show all workspace todos (or pass instructions inline)',
    handler: async (args, _ctx) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the todo tool: ${instruction}`);
      } else {
        pi.sendUserMessage('List all my current todos using the todo tool.');
      }
    },
  });
}
