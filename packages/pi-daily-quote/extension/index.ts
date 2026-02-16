/**
 * Daily Quote Extension — Pi extension that stores inspirational quotes.
 *
 * The agent generates quotes (it IS the LLM) and stores them via this tool.
 * The web UI displays the current quote and can request a new one via
 * useAgentPrompt.
 *
 * State: `.sero/apps/daily-quote/state.json`
 * Tools: daily_quote (get, set, refresh)
 * Commands: /quote
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { DailyQuoteState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'daily-quote', 'state.json');

/**
 * Resolve the state file path. This is a global-scoped app:
 * - In Sero (SERO_HOME set): state lives at ~/.sero-ui/apps/daily-quote/state.json
 * - In Pi CLI (no SERO_HOME): falls back to workspace-relative path
 */
function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'daily-quote', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── State validation ───────────────────────────────────────

/** Runtime check that parsed JSON conforms to DailyQuoteState. */
function isValidState(data: unknown): data is DailyQuoteState {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.quote !== null) {
    if (typeof obj.quote !== 'object') return false;
    const q = obj.quote as Record<string, unknown>;
    if (typeof q.text !== 'string' || typeof q.author !== 'string') return false;
  }
  return (
    (obj.lastRefreshDate === null || typeof obj.lastRefreshDate === 'string')
  );
}

// ── File I/O (atomic writes) ───────────────────────────────

async function readState(filePath: string): Promise<DailyQuoteState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return { ...DEFAULT_STATE };
    return parsed;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: DailyQuoteState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Helpers ────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Tool parameters ────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['get', 'set'] as const),
  quote: Type.Optional(Type.String({ description: 'The quote text (for set)' })),
  author: Type.Optional(Type.String({ description: 'The quote author (for set)' })),
});

// ── Extension ──────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  pi.registerTool({
    name: 'daily_quote',
    label: 'Daily Quote',
    description:
      'Manage the daily inspirational quote. Actions: get (show current quote), set (requires quote + author — generate a unique, thoughtful inspirational quote attributed to a real historical figure, philosopher, author, scientist, or leader, then store it).',
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

      switch (params.action) {
        case 'get': {
          if (!state.quote) {
            return {
              content: [{ type: 'text', text: 'No quote yet. Generate one with action "set".' }],
              details: {},
            };
          }
          return {
            content: [{
              type: 'text',
              text: `"${state.quote.text}"\n— ${state.quote.author}\n(${state.lastRefreshDate})`,
            }],
            details: {},
          };
        }

        case 'set': {
          if (!params.quote || !params.author) {
            return {
              content: [{ type: 'text', text: 'Error: quote and author are required for set' }],
              details: {},
            };
          }
          state.quote = {
            text: params.quote,
            author: params.author,
            generatedAt: new Date().toISOString(),
          };
          state.lastRefreshDate = todayISO();
          await writeState(statePath, state);
          return {
            content: [{
              type: 'text',
              text: `"${params.quote}"\n— ${params.author}`,
            }],
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
      let text = theme.fg('toolTitle', theme.bold('daily_quote '));
      text += theme.fg('muted', args.action);
      if (args.author) text += ` ${theme.fg('dim', `— ${args.author}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      if (msg.startsWith('Error:')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(theme.fg('success', '✨ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  pi.registerCommand('quote', {
    description: 'Show or generate today\'s inspirational quote',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage(
        'Show me today\'s inspirational quote using the daily_quote tool. If there isn\'t one yet, or it\'s from a previous day, generate a fresh one and store it with the set action.',
      );
    },
  });
}
