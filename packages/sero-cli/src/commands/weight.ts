/**
 * sero weight — track weight over time.
 *
 * State: global-scoped.
 */

import type { CommandDef, Flags } from '../main.js';
import { resolveGlobalStatePath, readState, writeState } from '../state.js';

type WeightUnit = 'kg' | 'lbs' | 'st';

interface WeightEntry {
  id: number;
  weight: number;
  date: string;
  note?: string;
  createdAt: string;
}

interface WeightGoal {
  target: number;
  startWeight: number;
  startDate: string;
}

interface WeightTrackerState {
  entries: WeightEntry[];
  nextId: number;
  unit: WeightUnit;
  goal: WeightGoal | null;
}

const DEFAULT: WeightTrackerState = {
  entries: [],
  nextId: 1,
  unit: 'kg',
  goal: null,
};

function statePath(): string {
  return resolveGlobalStatePath('weight-tracker');
}

function formatWeight(weight: number, unit: WeightUnit): string {
  if (unit === 'st') {
    const stones = Math.floor(weight / 6.35029);
    const lbs = Math.round((weight % 6.35029) / 0.453592);
    return `${stones}st ${lbs}lbs`;
  }
  if (unit === 'lbs') return `${Math.round(weight * 2.20462 * 10) / 10} lbs`;
  return `${Math.round(weight * 10) / 10} kg`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function parseNamedArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      result[arg.slice(2)] = args[++i];
    } else if (!result._positional) {
      result._positional = arg;
    }
  }
  return result;
}

async function run(args: string[], flags: Flags): Promise<void> {
  const action = args[0];
  if (!action) throw new Error('No action specified. Run \'sero help weight\' for usage.');

  const fp = statePath();
  const state = await readState<WeightTrackerState>(fp, DEFAULT);
  const named = parseNamedArgs(args.slice(1));

  // Update unit if specified
  if (named.unit && ['kg', 'lbs', 'st'].includes(named.unit)) {
    state.unit = named.unit as WeightUnit;
  }

  switch (action) {
    case 'log': {
      const weight = Number(named._positional ?? named.weight);
      if (!weight || isNaN(weight)) throw new Error('Weight value is required. Usage: sero weight log <value>');
      const entry: WeightEntry = {
        id: state.nextId,
        weight,
        date: named.date || todayISO(),
        note: named.note,
        createdAt: new Date().toISOString(),
      };
      state.entries.push(entry);
      state.nextId++;
      await writeState(fp, state);

      if (flags.json) {
        process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
      } else {
        process.stdout.write(`Logged ${formatWeight(entry.weight, state.unit)} on ${entry.date}\n`);
      }
      return;
    }

    case 'list': {
      if (state.entries.length === 0) {
        process.stdout.write('No weight entries yet. Log your first one!\n');
        return;
      }
      const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));

      if (flags.json) {
        process.stdout.write(JSON.stringify({ entries: sorted, unit: state.unit }, null, 2) + '\n');
        return;
      }

      const lines = sorted.map((e) => {
        let line = `#${e.id}: ${e.date} — ${formatWeight(e.weight, state.unit)}`;
        if (e.note) line += ` (${e.note})`;
        return line;
      });
      process.stdout.write(lines.join('\n') + '\n');
      return;
    }

    case 'remove': {
      const id = Number(named._positional ?? named.id);
      if (!id || isNaN(id)) throw new Error('Entry ID is required. Usage: sero weight remove <id>');
      const before = state.entries.length;
      state.entries = state.entries.filter((e) => e.id !== id);
      if (state.entries.length === before) throw new Error(`Entry #${id} not found.`);
      await writeState(fp, state);
      process.stdout.write(`Removed entry #${id}\n`);
      return;
    }

    case 'goal': {
      const target = Number(named._positional ?? named.weight);
      if (!target || isNaN(target)) throw new Error('Target weight is required. Usage: sero weight goal <value>');
      const latestEntry = [...state.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
      state.goal = {
        target,
        startWeight: latestEntry?.weight ?? target,
        startDate: todayISO(),
      };
      await writeState(fp, state);
      process.stdout.write(`Goal set: ${formatWeight(target, state.unit)}\n`);
      return;
    }

    case 'status': {
      if (state.entries.length === 0) {
        process.stdout.write('No entries yet — log your weight to get started!\n');
        return;
      }
      const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
      const latest = sorted[sorted.length - 1];
      const first = sorted[0];
      const totalChange = latest.weight - first.weight;
      const sign = totalChange <= 0 ? '' : '+';

      if (flags.json) {
        process.stdout.write(JSON.stringify({
          current: latest.weight,
          currentDate: latest.date,
          totalChange,
          entryCount: state.entries.length,
          unit: state.unit,
          goal: state.goal,
        }, null, 2) + '\n');
        return;
      }

      let text = `Current: ${formatWeight(latest.weight, state.unit)} (${latest.date})\n`;
      text += `Total change: ${sign}${formatWeight(Math.abs(totalChange), state.unit)}\n`;
      text += `Entries: ${state.entries.length}\n`;

      if (state.goal) {
        const remaining = latest.weight - state.goal.target;
        if (remaining > 0) {
          text += `Goal: ${formatWeight(state.goal.target, state.unit)} (${formatWeight(remaining, state.unit)} to go)\n`;
        } else {
          text += `Goal reached! Target was ${formatWeight(state.goal.target, state.unit)}\n`;
        }
      }
      process.stdout.write(text);
      return;
    }

    case 'clear': {
      const count = state.entries.length;
      await writeState(fp, { ...DEFAULT });
      process.stdout.write(`Cleared ${count} weight entries\n`);
      return;
    }

    default:
      throw new Error(`Unknown action "${action}". Run 'sero help weight' for usage.`);
  }
}

export const weightCommand: CommandDef = {
  description: 'Track weight over time',
  helpText: `Track body weight over time with goals and status reports.

USAGE
  sero weight <action> [args] [flags]

ACTIONS
  log <weight>        Log a weight entry
  list                Show all entries (chronological)
  remove <id>         Remove an entry
  goal <weight>       Set a target weight
  status              Summary with progress toward goal
  clear               Remove all entries

FLAGS
  --date <YYYY-MM-DD> Date for log entry (defaults to today)
  --note <text>       Optional note for log entry
  --unit <kg|lbs|st>  Set display unit (persisted)
  --json              Output as JSON

EXAMPLES
  sero weight log 75.5
  sero weight log 74.2 --date 2026-02-24 --note "After morning run"
  sero weight list
  sero weight goal 70 --unit kg
  sero weight status
  sero weight remove 3
  sero weight clear`,
  run,
};
