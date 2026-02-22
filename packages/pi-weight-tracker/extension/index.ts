/**
 * Weight Tracker Extension — standard Pi extension with file-based state.
 *
 * Reads/writes `.sero/apps/weight-tracker/state.json` relative to the workspace cwd.
 * Works in Pi CLI (no Sero dependency) and in Sero (where the web UI
 * watches the same file for live updates).
 *
 * Tools (LLM-callable): weight (log, list, remove, goal, status, clear)
 * Commands (user): /weight
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { WeightTrackerState, WeightEntry, WeightUnit } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'weight-tracker', 'state.json');

/**
 * Resolve the state file path. This is a global-scoped app:
 * - In Sero (SERO_HOME set): state lives at ~/.sero-ui/apps/weight-tracker/state.json
 * - In Pi CLI (no SERO_HOME): falls back to workspace-relative path
 */
function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'weight-tracker', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── State validation ───────────────────────────────────────────

/** Runtime check that parsed JSON conforms to WeightTrackerState. */
function isValidState(data: unknown): data is WeightTrackerState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.entries) &&
    typeof obj.nextId === 'number' &&
    typeof obj.unit === 'string' &&
    ['kg', 'lbs', 'st'].includes(obj.unit) &&
    (obj.goal === null || (typeof obj.goal === 'object' && obj.goal !== null))
  );
}

// ── File I/O (atomic writes) ───────────────────────────────────

async function readState(filePath: string): Promise<WeightTrackerState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return { ...DEFAULT_STATE };
    return parsed;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: WeightTrackerState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Helpers ────────────────────────────────────────────────────

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

function getEncouragement(entries: WeightEntry[], goal: WeightTrackerState['goal']): string {
  if (entries.length < 2) return 'Great start — every journey begins with a single step! 🌟';

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const diff = latest.weight - previous.weight;

  if (diff < -0.5) return 'Fantastic progress — you\'re smashing it! 🔥';
  if (diff < 0) return 'Heading in the right direction — keep it up! 💪';
  if (diff === 0) return 'Holding steady — consistency is key! 🎯';
  if (diff < 0.5) return 'Small fluctuations are normal — you\'ve got this! 🌊';

  if (goal) {
    const totalLost = goal.startWeight - latest.weight;
    if (totalLost > 0) return `Still ${formatWeight(totalLost, 'kg')} down from your start — don't lose sight of how far you've come! 🏔️`;
  }

  return 'Tomorrow is a new day — be kind to yourself! 🌱';
}

// ── Tool parameters ────────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['log', 'list', 'remove', 'goal', 'status', 'clear'] as const),
  weight: Type.Optional(Type.Number({ description: 'Weight value (for log/goal)' })),
  date: Type.Optional(Type.String({ description: 'Date as YYYY-MM-DD (for log, defaults to today)' })),
  note: Type.Optional(Type.String({ description: 'Optional note (for log)' })),
  id: Type.Optional(Type.Number({ description: 'Entry ID (for remove)' })),
  unit: Type.Optional(StringEnum(['kg', 'lbs', 'st'] as const)),
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

  // ── Tool: weight ─────────────────────────────────────────────

  pi.registerTool({
    name: 'weight',
    label: 'Weight Tracker',
    description:
      'Track body weight over time. Actions: log (requires weight, optional date/note), list (show history), remove (requires id), goal (set target weight), status (summary + encouragement), clear (remove all entries).',
    parameters: Params,

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

      if (params.unit) {
        state.unit = params.unit;
      }

      switch (params.action) {
        case 'log': {
          if (params.weight === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: weight is required for log' }],
              details: {},
            };
          }
          const entry: WeightEntry = {
            id: state.nextId,
            weight: params.weight,
            date: params.date || todayISO(),
            note: params.note,
            createdAt: new Date().toISOString(),
          };
          state.entries.push(entry);
          state.nextId++;
          await writeState(statePath, state);
          const msg = `Logged ${formatWeight(entry.weight, state.unit)} on ${entry.date}`;
          const encouragement = getEncouragement(state.entries, state.goal);
          return {
            content: [{ type: 'text', text: `${msg}\n${encouragement}` }],
            details: {},
          };
        }

        case 'list': {
          if (state.entries.length === 0) {
            return {
              content: [{ type: 'text', text: 'No weight entries yet. Log your first one!' }],
              details: {},
            };
          }
          const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
          const lines = sorted.map((e) => {
            let line = `#${e.id}: ${e.date} — ${formatWeight(e.weight, state.unit)}`;
            if (e.note) line += ` (${e.note})`;
            return line;
          });
          return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
        }

        case 'remove': {
          if (params.id === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: id is required for remove' }],
              details: {},
            };
          }
          const before = state.entries.length;
          state.entries = state.entries.filter((e) => e.id !== params.id);
          if (state.entries.length === before) {
            return {
              content: [{ type: 'text', text: `Entry #${params.id} not found` }],
              details: {},
            };
          }
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Removed entry #${params.id}` }],
            details: {},
          };
        }

        case 'goal': {
          if (params.weight === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: target weight is required for goal' }],
              details: {},
            };
          }
          const latestEntry = [...state.entries]
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          const currentWeight = latestEntry?.weight ?? params.weight;
          state.goal = {
            target: params.weight,
            startWeight: currentWeight,
            startDate: todayISO(),
          };
          await writeState(statePath, state);
          return {
            content: [{
              type: 'text',
              text: `Goal set: ${formatWeight(params.weight, state.unit)}. You've got this! 🎯`,
            }],
            details: {},
          };
        }

        case 'status': {
          if (state.entries.length === 0) {
            return {
              content: [{ type: 'text', text: 'No entries yet — log your weight to get started!' }],
              details: {},
            };
          }
          const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
          const latest = sorted[sorted.length - 1];
          const first = sorted[0];
          const totalChange = latest.weight - first.weight;
          const sign = totalChange <= 0 ? '' : '+';

          let text = `Current: ${formatWeight(latest.weight, state.unit)} (${latest.date})\n`;
          text += `Total change: ${sign}${formatWeight(Math.abs(totalChange), state.unit)}\n`;
          text += `Entries: ${state.entries.length}\n`;

          if (state.goal) {
            const remaining = latest.weight - state.goal.target;
            if (remaining > 0) {
              text += `Goal: ${formatWeight(state.goal.target, state.unit)} (${formatWeight(remaining, state.unit)} to go)\n`;
            } else {
              text += `🎉 Goal reached! Target was ${formatWeight(state.goal.target, state.unit)}\n`;
            }
          }

          text += '\n' + getEncouragement(state.entries, state.goal);
          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'clear': {
          const count = state.entries.length;
          await writeState(statePath, { ...DEFAULT_STATE });
          return {
            content: [{ type: 'text', text: `Cleared ${count} weight entries` }],
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
      let text = theme.fg('toolTitle', theme.bold('weight '));
      text += theme.fg('muted', args.action);
      if (args.weight !== undefined) text += ` ${theme.fg('accent', `${args.weight}`)}`;
      if (args.date) text += ` ${theme.fg('dim', args.date)}`;
      if (args.note) text += ` ${theme.fg('dim', `"${args.note}"`)}`;
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

  // ── Command: /weight ────────────────────────────────────────

  pi.registerCommand('weight', {
    description: 'Show weight tracking status (or pass instructions inline)',
    handler: async (args, _ctx) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the weight tool: ${instruction}`);
      } else {
        pi.sendUserMessage('Show my weight tracking status using the weight tool.');
      }
    },
  });
}
