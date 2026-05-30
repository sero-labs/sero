import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import type { Note, NotesState } from '../shared/types';
import { DEFAULT_STATE, normalizeNotesState } from '../shared/types';

const STATE_REL_PATH = path.join('.sero', 'apps', 'notes', 'state.json');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

async function readState(filePath: string): Promise<NotesState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeNotesState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: NotesState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Atomic write: temp -> rename prevents partial-read corruption.
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

const Params = Type.Object({
  action: StringEnum(['list', 'add', 'toggle', 'remove'] as const),
  title: Type.Optional(Type.String({ description: 'Note title (for add)' })),
  id: Type.Optional(Type.Number({ description: 'Note id (for toggle/remove)' })),
});

type CliResult = {
  output: string;
  exitCode: number;
};

type SeroToolCli = {
  summary: string;
  help: string;
  group: string;
  execute(
    args: readonly string[],
    context: { cwd?: string },
    signal?: AbortSignal,
  ): Promise<CliResult>;
};

function resolveCliStatePath(context: { cwd?: string }): string {
  return resolveStatePath(context.cwd ?? process.cwd());
}

type SeroCliTool<T> = T & {
  cli: SeroToolCli;
};

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  const notesTool: SeroCliTool<ToolDefinition<typeof Params>> = {
    name: 'notes',
    label: 'Notes',
    description:
      'Manage notes. Actions: list, add (title), toggle (id), remove (id).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolved = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolved) {
        return {
          content: [{ type: 'text', text: 'Error: no workspace cwd' }],
          details: {},
        };
      }
      statePath = resolved;
      const state = await readState(statePath);

      switch (params.action) {
        case 'list': {
          const text = state.notes.length
            ? state.notes
                .map((n) => `${n.done ? '[x]' : '[ ]'} #${n.id} ${n.title}`)
                .join('\n')
            : 'No notes yet.';
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'add': {
          if (!params.title) {
            return {
              content: [{ type: 'text', text: 'Error: title is required' }],
              details: {},
            };
          }
          const note: Note = {
            id: state.nextId,
            title: params.title,
            done: false,
            createdAt: new Date().toISOString(),
          };
          state.notes.push(note);
          state.nextId++;
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Added #${note.id}: ${note.title}` }],
            details: {},
          };
        }

        case 'toggle': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required' }],
              details: {},
            };
          }
          const note = state.notes.find((n) => n.id === params.id);
          if (!note) {
            return {
              content: [{ type: 'text', text: `Error: no note #${params.id}` }],
              details: {},
            };
          }
          note.done = !note.done;
          await writeState(statePath, state);
          return {
            content: [
              { type: 'text', text: `Toggled #${note.id} -> ${note.done ? 'done' : 'open'}` },
            ],
            details: {},
          };
        }

        case 'remove': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required' }],
              details: {},
            };
          }
          const before = state.notes.length;
          state.notes = state.notes.filter((n) => n.id !== params.id);
          if (state.notes.length === before) {
            return {
              content: [{ type: 'text', text: `Error: no note #${params.id}` }],
              details: {},
            };
          }
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Removed #${params.id}` }],
            details: {},
          };
        }
      }
    },

    // Pi CLI TUI rendering — ignored by the Sero host.
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('notes '));
      text += theme.fg('muted', args.action);
      if (args.title) text += ` ${theme.fg('dim', `"${args.title}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg('dim', `#${args.id}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const first = result.content[0];
      const msg = first?.type === 'text' ? first.text : '';
      return new Text(
        msg.startsWith('Error:')
          ? theme.fg('error', msg)
          : theme.fg('success', '+ ') + theme.fg('muted', msg),
        0,
        0,
      );
    },

    // Custom bridged CLI surface — callable as `sero notes <subcommand>`.
    // Requires `sero.plugin.bridgeTools: ["notes"]` and the `tool.cli` capability.
    cli: {
      summary: 'Manage notes from the CLI',
      help: 'sero notes <list|add|toggle|remove> [title|id]',
      group: 'Apps',
      async execute(args, context) {
        const [subcommand, ...rest] = args;
        if (!subcommand) {
          return { output: 'Usage: sero notes <list|add|toggle|remove>', exitCode: 1 };
        }
        const filePath = resolveCliStatePath(context);
        const state = await readState(filePath);

        if (subcommand === 'list') {
          const out = state.notes.length
            ? state.notes
                .map((n) => `${n.done ? '[x]' : '[ ]'} #${n.id} ${n.title}`)
                .join('\n')
            : 'No notes yet.';
          return { output: out, exitCode: 0 };
        }

        if (subcommand === 'add') {
          const title = rest.join(' ').trim();
          if (!title) return { output: 'Error: title is required', exitCode: 1 };
          state.notes.push({
            id: state.nextId,
            title,
            done: false,
            createdAt: new Date().toISOString(),
          });
          state.nextId++;
          await writeState(filePath, state);
          return { output: `Added #${state.nextId - 1}: ${title}`, exitCode: 0 };
        }

        if (subcommand === 'toggle') {
          const id = Number(rest[0]);
          if (!Number.isInteger(id)) return { output: 'Error: id is required', exitCode: 1 };
          const note = state.notes.find((n) => n.id === id);
          if (!note) return { output: `Error: no note #${id}`, exitCode: 1 };
          note.done = !note.done;
          await writeState(filePath, state);
          return { output: `Toggled #${id} -> ${note.done ? 'done' : 'open'}`, exitCode: 0 };
        }

        if (subcommand === 'remove') {
          const id = Number(rest[0]);
          if (!Number.isInteger(id)) return { output: 'Error: id is required', exitCode: 1 };
          const before = state.notes.length;
          state.notes = state.notes.filter((n) => n.id !== id);
          if (state.notes.length === before) {
            return { output: `Error: no note #${id}`, exitCode: 1 };
          }
          await writeState(filePath, state);
          return { output: `Removed #${id}`, exitCode: 0 };
        }

        return { output: `Unknown subcommand: ${subcommand}`, exitCode: 1 };
      },
    },
  };

  pi.registerTool(notesTool);

  // User-callable slash command. Keep the command name distinct from the tool
  // name ('notes'): when tools are bridged, Sero also bridges non-builtin
  // commands into the CLI, and the command would otherwise shadow
  // `sero notes ...` and bypass this tool's `cli.execute` handler.
  pi.registerCommand('list-notes', {
    description: 'Ask the agent to list all notes',
    handler: async () => {
      pi.sendUserMessage('List all notes using the notes tool.');
    },
  });
}
