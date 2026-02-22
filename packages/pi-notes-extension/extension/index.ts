/**
 * Notes Extension — standard Pi extension with file-based state.
 *
 * Reads/writes `.sero/apps/notes/state.json` relative to the workspace cwd.
 * Works in Pi CLI (no Sero dependency) and in Sero (where the web UI
 * watches the same file for live updates).
 *
 * Tools (LLM-callable): notes (list, add, edit, remove, pin, unpin, show)
 * Commands (user): /notes
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { NotesState, Note } from '../shared/types';
import { DEFAULT_NOTES_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'notes', 'state.json');

/**
 * Resolve the state file path. This is a global-scoped app:
 * - In Sero (SERO_HOME set): state lives at ~/.sero-ui/apps/notes/state.json
 * - In Pi CLI (no SERO_HOME): falls back to workspace-relative path
 */
function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'notes', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O (atomic writes) ───────────────────────────────────

async function readState(filePath: string): Promise<NotesState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as NotesState;
  } catch {
    return { ...DEFAULT_NOTES_STATE };
  }
}

async function writeState(filePath: string, state: NotesState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Tool parameters ────────────────────────────────────────────

const NotesParams = Type.Object({
  action: StringEnum(['list', 'add', 'edit', 'remove', 'pin', 'unpin', 'show'] as const),
  title: Type.Optional(Type.String({ description: 'Note title (for add/edit)' })),
  body: Type.Optional(Type.String({ description: 'Note body content (for add/edit)' })),
  id: Type.Optional(Type.Number({ description: 'Note ID (for edit/remove/pin/unpin/show)' })),
  query: Type.Optional(Type.String({ description: 'Search query (for list)' })),
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

  // ── Tool: notes ────────────────────────────────────────────

  pi.registerTool({
    name: 'notes',
    label: 'Notes',
    description:
      'Manage notes. Actions: list (show all, optional query to search), add (requires title, optional body), edit (requires id, optional title/body), remove (requires id), pin (requires id), unpin (requires id), show (requires id — display full note).',
    parameters: NotesParams,

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
          let notes = state.notes;
          if (params.query) {
            const q = params.query.toLowerCase();
            notes = notes.filter(
              (n) =>
                n.title.toLowerCase().includes(q) ||
                n.body.toLowerCase().includes(q),
            );
          }
          if (notes.length === 0) {
            return {
              content: [{ type: 'text', text: params.query ? 'No notes matching that query.' : 'No notes yet.' }],
              details: {},
            };
          }
          // Sort: pinned first, then by updatedAt desc
          const sorted = [...notes].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
          const text = sorted
            .map((n) => {
              const pin = n.pinned ? '📌 ' : '';
              const preview = n.body.length > 60 ? n.body.slice(0, 60) + '…' : n.body;
              return `${pin}#${n.id}: ${n.title}${preview ? ` — ${preview}` : ''}`;
            })
            .join('\n');
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'add': {
          if (!params.title) {
            return {
              content: [{ type: 'text', text: 'Error: title is required for add' }],
              details: {},
            };
          }
          const now = new Date().toISOString();
          const note: Note = {
            id: state.nextId,
            title: params.title,
            body: params.body ?? '',
            pinned: false,
            createdAt: now,
            updatedAt: now,
          };
          state.notes.push(note);
          state.nextId++;
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Created note #${note.id}: ${note.title}` }],
            details: {},
          };
        }

        case 'edit': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for edit' }],
              details: {},
            };
          }
          const note = state.notes.find((n) => n.id === params.id);
          if (!note) {
            return {
              content: [{ type: 'text', text: `Note #${params.id} not found` }],
              details: {},
            };
          }
          if (params.title !== undefined) note.title = params.title;
          if (params.body !== undefined) note.body = params.body;
          note.updatedAt = new Date().toISOString();
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Updated note #${note.id}: ${note.title}` }],
            details: {},
          };
        }

        case 'remove': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for remove' }],
              details: {},
            };
          }
          const idx = state.notes.findIndex((n) => n.id === params.id);
          if (idx === -1) {
            return {
              content: [{ type: 'text', text: `Note #${params.id} not found` }],
              details: {},
            };
          }
          state.notes.splice(idx, 1);
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Removed note #${params.id}` }],
            details: {},
          };
        }

        case 'pin': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for pin' }],
              details: {},
            };
          }
          const note = state.notes.find((n) => n.id === params.id);
          if (!note) {
            return {
              content: [{ type: 'text', text: `Note #${params.id} not found` }],
              details: {},
            };
          }
          note.pinned = true;
          note.updatedAt = new Date().toISOString();
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Pinned note #${note.id}: ${note.title}` }],
            details: {},
          };
        }

        case 'unpin': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for unpin' }],
              details: {},
            };
          }
          const note = state.notes.find((n) => n.id === params.id);
          if (!note) {
            return {
              content: [{ type: 'text', text: `Note #${params.id} not found` }],
              details: {},
            };
          }
          note.pinned = false;
          note.updatedAt = new Date().toISOString();
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Unpinned note #${note.id}: ${note.title}` }],
            details: {},
          };
        }

        case 'show': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for show' }],
              details: {},
            };
          }
          const note = state.notes.find((n) => n.id === params.id);
          if (!note) {
            return {
              content: [{ type: 'text', text: `Note #${params.id} not found` }],
              details: {},
            };
          }
          const pin = note.pinned ? ' 📌' : '';
          const text = `# ${note.title}${pin}\n\n${note.body || '(empty)'}\n\n— Created: ${note.createdAt}\n— Updated: ${note.updatedAt}`;
          return { content: [{ type: 'text', text }], details: {} };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown action: ${params.action}` }],
            details: {},
          };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('notes '));
      text += theme.fg('muted', args.action);
      if (args.title) text += ` ${theme.fg('dim', `"${args.title}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg('accent', `#${args.id}`)}`;
      if (args.query) text += ` ${theme.fg('dim', `search:"${args.query}"`)}`;
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

  // ── Command: /notes ────────────────────────────────────────

  pi.registerCommand('notes', {
    description: 'Show all notes (or pass instructions inline)',
    handler: async (args, _ctx) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the notes tool: ${instruction}`);
      } else {
        pi.sendUserMessage('List all my notes using the notes tool.');
      }
    },
  });
}
