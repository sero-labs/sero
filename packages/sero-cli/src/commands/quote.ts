/**
 * sero quote — daily inspirational quote.
 *
 * State: global-scoped. The agent generates quotes and stores them via 'set'.
 */

import type { CommandDef, Flags } from '../main.js';
import { resolveGlobalStatePath, readState, writeState } from '../state.js';

interface Quote {
  text: string;
  author: string;
  generatedAt: string;
}

interface DailyQuoteState {
  quote: Quote | null;
  lastRefreshDate: string | null;
}

const DEFAULT: DailyQuoteState = {
  quote: null,
  lastRefreshDate: null,
};

function statePath(): string {
  return resolveGlobalStatePath('daily-quote');
}

function parseNamedArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      result[arg.slice(2)] = args[++i];
    }
  }
  return result;
}

async function run(args: string[], flags: Flags): Promise<void> {
  const action = args[0] ?? 'get';
  const fp = statePath();

  switch (action) {
    case 'get': {
      const state = await readState<DailyQuoteState>(fp, DEFAULT);
      if (!state.quote) {
        process.stdout.write('No quote yet. Generate one with: sero quote set --quote "..." --author "..."\n');
        return;
      }
      if (flags.json) {
        process.stdout.write(JSON.stringify(state, null, 2) + '\n');
        return;
      }
      process.stdout.write(`"${state.quote.text}"\n— ${state.quote.author}\n(${state.lastRefreshDate})\n`);
      return;
    }

    case 'set': {
      const named = parseNamedArgs(args.slice(1));
      if (!named.quote || !named.author) {
        throw new Error('--quote and --author are required for set.');
      }
      const state = await readState<DailyQuoteState>(fp, DEFAULT);
      state.quote = {
        text: named.quote,
        author: named.author,
        generatedAt: new Date().toISOString(),
      };
      state.lastRefreshDate = new Date().toISOString().split('T')[0];
      await writeState(fp, state);

      if (flags.json) {
        process.stdout.write(JSON.stringify(state, null, 2) + '\n');
      } else {
        process.stdout.write(`"${named.quote}"\n— ${named.author}\n`);
      }
      return;
    }

    default:
      throw new Error(`Unknown action "${action}". Run 'sero help quote' for usage.`);
  }
}

export const quoteCommand: CommandDef = {
  description: 'Daily inspirational quote',
  helpText: `Manage the daily inspirational quote.

USAGE
  sero quote [action] [flags]

ACTIONS
  get                 Show current quote (default)
  set                 Store a new quote

FLAGS
  --quote <text>      Quote text (required for set)
  --author <text>     Quote author (required for set)
  --json              Output as JSON

EXAMPLES
  sero quote
  sero quote get
  sero quote set --quote "The only way to do great work is to love what you do." --author "Steve Jobs"`,
  run,
};
