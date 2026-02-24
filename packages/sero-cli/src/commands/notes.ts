/**
 * sero notes — manage workspace notes.
 *
 * State: global-scoped, reads/writes the same JSON as pi-notes-extension.
 */

import type { CommandDef, Flags } from '../main.js';
import { resolveGlobalStatePath, readState, writeState } from '../state.js';

interface Note {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotesState {
  notes: Note[];
  nextId: number;
}

const DEFAULT: NotesState = { notes: [], nextId: 1 };

function statePath(): string {
  return resolveGlobalStatePath('notes');
}

function parseNamedArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      const key = arg.slice(2);
      result[key] = args[++i];
    } else if (!result._positional) {
      result._positional = arg;
    }
  }
  return result;
}

async function run(args: string[], flags: Flags): Promise<void> {
  const action = args[0];
  if (!action) throw new Error('No action specified. Run \'sero help notes\' for usage.');

  const fp = statePath();
  const state = await readState<NotesState>(fp, DEFAULT);
  const named = parseNamedArgs(args.slice(1));

  switch (action) {
    case 'list': {
      let notes = state.notes;
      const query = named.query;
      if (query) {
        const q = query.toLowerCase();
        notes = notes.filter(
          (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
        );
      }
      if (notes.length === 0) {
        process.stdout.write(query ? 'No notes matching that query.\n' : 'No notes yet.\n');
        return;
      }
      // Sort: pinned first, then by updatedAt desc
      const sorted = [...notes].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

      if (flags.json) {
        process.stdout.write(JSON.stringify({ notes: sorted, count: sorted.length }, null, 2) + '\n');
        return;
      }

      const lines = sorted.map((n) => {
        const pin = n.pinned ? '[pinned] ' : '';
        const preview = n.body.length > 60 ? n.body.slice(0, 60) + '...' : n.body;
        return `${n.id}. ${pin}${n.title}\n   ${preview || '(empty)'}`;
      });
      process.stdout.write(lines.join('\n') + `\n\n${sorted.length} notes` +
        (sorted.some((n) => n.pinned) ? ` (${sorted.filter((n) => n.pinned).length} pinned)` : '') + '\n');
      return;
    }

    case 'add': {
      const title = named.title;
      if (!title) throw new Error('--title is required for add.');
      const now = new Date().toISOString();
      const note: Note = {
        id: state.nextId,
        title,
        body: named.body ?? '',
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };
      state.notes.push(note);
      state.nextId++;
      await writeState(fp, state);

      if (flags.json) {
        process.stdout.write(JSON.stringify(note, null, 2) + '\n');
      } else {
        process.stdout.write(`Created note #${note.id}: ${note.title}\n`);
      }
      return;
    }

    case 'show': {
      const id = Number(named._positional ?? named.id);
      if (!id || isNaN(id)) throw new Error('Note ID is required. Usage: sero notes show <id>');
      const note = state.notes.find((n) => n.id === id);
      if (!note) throw new Error(`Note ${id} not found.`);

      if (flags.json) {
        process.stdout.write(JSON.stringify(note, null, 2) + '\n');
      } else {
        const pin = note.pinned ? ' [pinned]' : '';
        process.stdout.write(`# ${note.title}${pin}\n\n${note.body || '(empty)'}\n\n` +
          `Created: ${note.createdAt}\nUpdated: ${note.updatedAt}\n`);
      }
      return;
    }

    case 'edit': {
      const id = Number(named._positional ?? named.id);
      if (!id || isNaN(id)) throw new Error('Note ID is required. Usage: sero notes edit <id>');
      const note = state.notes.find((n) => n.id === id);
      if (!note) throw new Error(`Note ${id} not found.`);
      if (named.title !== undefined) note.title = named.title;
      if (named.body !== undefined) note.body = named.body;
      note.updatedAt = new Date().toISOString();
      await writeState(fp, state);

      if (flags.json) {
        process.stdout.write(JSON.stringify(note, null, 2) + '\n');
      } else {
        process.stdout.write(`Updated note #${note.id}: ${note.title}\n`);
      }
      return;
    }

    case 'remove': {
      const id = Number(named._positional ?? named.id);
      if (!id || isNaN(id)) throw new Error('Note ID is required. Usage: sero notes remove <id>');
      const idx = state.notes.findIndex((n) => n.id === id);
      if (idx === -1) throw new Error(`Note ${id} not found.`);
      state.notes.splice(idx, 1);
      await writeState(fp, state);
      process.stdout.write(`Removed note #${id}\n`);
      return;
    }

    case 'pin': {
      const id = Number(named._positional ?? named.id);
      if (!id || isNaN(id)) throw new Error('Note ID is required. Usage: sero notes pin <id>');
      const note = state.notes.find((n) => n.id === id);
      if (!note) throw new Error(`Note ${id} not found.`);
      note.pinned = true;
      note.updatedAt = new Date().toISOString();
      await writeState(fp, state);
      process.stdout.write(`Pinned note #${note.id}: ${note.title}\n`);
      return;
    }

    case 'unpin': {
      const id = Number(named._positional ?? named.id);
      if (!id || isNaN(id)) throw new Error('Note ID is required. Usage: sero notes unpin <id>');
      const note = state.notes.find((n) => n.id === id);
      if (!note) throw new Error(`Note ${id} not found.`);
      note.pinned = false;
      note.updatedAt = new Date().toISOString();
      await writeState(fp, state);
      process.stdout.write(`Unpinned note #${note.id}: ${note.title}\n`);
      return;
    }

    default:
      throw new Error(`Unknown action "${action}". Run 'sero help notes' for usage.`);
  }
}

export const notesCommand: CommandDef = {
  description: 'Manage workspace notes (add, edit, list, pin, remove, show)',
  helpText: `Manage workspace notes — create, edit, search, and organise notes.

USAGE
  sero notes <action> [flags]

ACTIONS
  list                List all notes (newest first)
  add                 Create a new note
  show <id>           Show full note content
  edit <id>           Edit an existing note
  remove <id>         Remove a note
  pin <id>            Pin a note to the top
  unpin <id>          Unpin a note

FLAGS
  --title <text>      Note title (required for add)
  --body <text>       Note body (required for add, optional for edit)
  --query <text>      Search filter (for list)
  --id <number>       Note ID (alternative to positional arg)
  --json              Output as JSON

EXAMPLES
  sero notes list
  sero notes list --query "design"
  sero notes add --title "Meeting Notes" --body "Discussed Q1 roadmap..."
  sero notes show 3
  sero notes edit 3 --body "Updated: added action items"
  sero notes pin 1
  sero notes remove 5`,
  run,
};
