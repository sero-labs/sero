/**
 * Sero CLI — workspace tools, integrations, and app control.
 *
 * Self-contained Node.js script with zero external dependencies.
 * Commands are organised into tiers:
 *   - Local: file-based state, no host communication
 *   - Host: requires host API call (future Phase 2)
 *   - Control: mutates Sero app state (future Phase 3)
 */

import { notesCommand } from './commands/notes.js';
import { todoCommand } from './commands/todo.js';
import { calcCommand } from './commands/calc.js';
import { quoteCommand } from './commands/quote.js';
import { weightCommand } from './commands/weight.js';
import { planCommand } from './commands/plan.js';
import { slopzillaCommand } from './commands/slopzilla.js';

// ── Types ───────────────────────────────────────────────────

export interface CommandDef {
  description: string;
  helpText: string;
  run: (args: string[], flags: Flags) => Promise<void>;
}

export interface Flags {
  json: boolean;
  quiet: boolean;
  help: boolean;
}

// ── Command registry ────────────────────────────────────────

const commands: Record<string, CommandDef> = {
  notes: notesCommand,
  todo: todoCommand,
  calc: calcCommand,
  quote: quoteCommand,
  weight: weightCommand,
  plan: planCommand,
  slopzilla: slopzillaCommand,
};

// ── Flag parsing ────────────────────────────────────────────

function parseFlags(argv: string[]): { args: string[]; flags: Flags } {
  const flags: Flags = { json: false, quiet: false, help: false };
  const args: string[] = [];

  for (const arg of argv) {
    if (arg === '--json') flags.json = true;
    else if (arg === '--quiet' || arg === '-q') flags.quiet = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else args.push(arg);
  }

  return { args, flags };
}

// ── Help text ───────────────────────────────────────────────

const TOP_LEVEL_HELP = `Sero CLI — workspace tools, integrations, and app control.

USAGE
  sero <command> [subcommand] [args] [flags]
  sero help <command>

COMMANDS
  notes        Manage workspace notes (add, edit, list, pin, remove, show)
  todo         Manage todo list (add, toggle, list, clear)
  calc         Evaluate math expressions
  quote        Daily inspirational quote
  weight       Track weight over time
  plan         Plan mode and task management
  slopzilla    View SlopZilla history and bookmarks

GLOBAL FLAGS
  --help, -h    Show help for a command
  --json        Output as JSON
  --quiet, -q   Suppress non-essential output

EXAMPLES
  sero notes add --title "API Design" --body "REST vs GraphQL comparison"
  sero todo add "Fix login bug" && sero todo add "Write tests"
  sero calc "sqrt(144) + 2^3"
  sero help notes

Run 'sero help <command>' for detailed usage of any command.`;

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { args, flags } = parseFlags(rawArgs);

  if (args.length === 0 || flags.help && args.length === 0) {
    process.stdout.write(TOP_LEVEL_HELP + '\n');
    return;
  }

  // sero --version
  if (args[0] === '--version') {
    process.stdout.write('sero 0.1.0\n');
    return;
  }

  // sero help [command]
  if (args[0] === 'help') {
    const cmdName = args[1];
    if (!cmdName) {
      process.stdout.write(TOP_LEVEL_HELP + '\n');
      return;
    }
    const cmd = commands[cmdName];
    if (!cmd) {
      process.stderr.write(`Error: Unknown command "${cmdName}". Run 'sero help' to see available commands.\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(cmd.helpText + '\n');
    return;
  }

  // sero <command> [subcommand] [args]
  const cmdName = args[0];
  const cmd = commands[cmdName];

  if (!cmd) {
    process.stderr.write(`Error: Unknown command "${cmdName}". Run 'sero help' to see available commands.\n`);
    process.exitCode = 1;
    return;
  }

  // sero <command> --help
  if (flags.help) {
    process.stdout.write(cmd.helpText + '\n');
    return;
  }

  try {
    await cmd.run(args.slice(1), flags);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : err}\n`);
  process.exitCode = 1;
});
