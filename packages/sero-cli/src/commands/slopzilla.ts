/**
 * sero slopzilla — view SlopZilla history and saved ideas.
 *
 * State: global-scoped, read-only from CLI perspective.
 */

import type { CommandDef, Flags } from '../main.js';
import { resolveGlobalStatePath, readState } from '../state.js';

interface AppIdea {
  id: number;
  name: string;
  tagline: string;
  description: string;
  techStack: string[];
  slopScore: number;
}

interface SavedIdea {
  idea: AppIdea;
  savedAt: string;
}

type BuildStatus = 'launched' | 'complete' | 'failed';

interface HistoryEntry {
  idea: AppIdea;
  launchedAt: string;
  workspaceId: string;
  sessionId: string | null;
  sessionPath: string | null;
  status: BuildStatus;
}

interface SlopZillaState {
  phase: string;
  complexity: string | null;
  technologies: string[];
  ideas: AppIdea[] | null;
  chosenIdea: AppIdea | null;
  launchedWorkspaceId: string | null;
  launchedSessionId: string | null;
  history: HistoryEntry[];
  savedIdeas: SavedIdea[];
}

const DEFAULT: SlopZillaState = {
  phase: 'config',
  complexity: null,
  technologies: [],
  ideas: null,
  chosenIdea: null,
  launchedWorkspaceId: null,
  launchedSessionId: null,
  history: [],
  savedIdeas: [],
};

function statePath(): string {
  return resolveGlobalStatePath('slopzilla');
}

async function run(args: string[], flags: Flags): Promise<void> {
  const action = args[0] ?? 'history';
  const fp = statePath();
  const state = await readState<SlopZillaState>(fp, DEFAULT);

  switch (action) {
    case 'history': {
      if (state.history.length === 0) {
        process.stdout.write('No SlopZilla launches yet.\n');
        return;
      }

      if (flags.json) {
        process.stdout.write(JSON.stringify({ history: state.history }, null, 2) + '\n');
        return;
      }

      const lines = state.history.map((h, i) => {
        const status = h.status ?? 'launched';
        return `${i + 1}. ${h.idea.name} (slop: ${h.idea.slopScore}/10, status: ${status})\n` +
          `   ${h.idea.tagline}\n` +
          `   Tech: ${h.idea.techStack.join(', ')}\n` +
          `   Launched: ${h.launchedAt}`;
      });
      process.stdout.write(`SlopZilla Launch History:\n\n${lines.join('\n\n')}\n`);
      return;
    }

    case 'saved': {
      const saved = state.savedIdeas ?? [];
      if (saved.length === 0) {
        process.stdout.write('No saved ideas.\n');
        return;
      }

      if (flags.json) {
        process.stdout.write(JSON.stringify({ savedIdeas: saved }, null, 2) + '\n');
        return;
      }

      const lines = saved.map((s, i) =>
        `${i + 1}. ${s.idea.name} (slop: ${s.idea.slopScore}/10)\n` +
        `   ${s.idea.tagline}\n` +
        `   ${s.idea.description}\n` +
        `   Tech: ${s.idea.techStack.join(', ')}\n` +
        `   Saved: ${s.savedAt}`,
      );
      process.stdout.write(`SlopZilla Saved Ideas (${saved.length}):\n\n${lines.join('\n\n')}\n`);
      return;
    }

    default:
      throw new Error(`Unknown action "${action}". Run 'sero help slopzilla' for usage.`);
  }
}

export const slopzillaCommand: CommandDef = {
  description: 'View SlopZilla history and bookmarks',
  helpText: `View SlopZilla launch history and bookmarked ideas.

USAGE
  sero slopzilla [action]

ACTIONS
  history             List launched apps with status (default)
  saved               List bookmarked ideas

FLAGS
  --json              Output as JSON

EXAMPLES
  sero slopzilla
  sero slopzilla history
  sero slopzilla saved`,
  run,
};
