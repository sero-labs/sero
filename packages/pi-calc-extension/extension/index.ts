/**
 * Calculator Extension — standard Pi extension with file-based state.
 *
 * Reads/writes `.sero/apps/calc/state.json` relative to the workspace cwd.
 * Works in Pi CLI (no Sero dependency) and in Sero (where the web UI
 * watches the same file for live updates).
 *
 * Tools (LLM-callable): calc (evaluate, history, clear)
 * Commands (user): /calc
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { CalcState, HistoryEntry } from '../shared/types';
import { DEFAULT_CALC_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'calc', 'state.json');

/**
 * Resolve the state file path. This is a global-scoped app:
 * - In Sero (SERO_HOME set): state lives at ~/.sero-ui/apps/calc/state.json
 * - In Pi CLI (no SERO_HOME): falls back to workspace-relative path
 */
function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'calc', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O (atomic writes) ───────────────────────────────────

async function readState(filePath: string): Promise<CalcState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as CalcState;
  } catch {
    return { ...DEFAULT_CALC_STATE };
  }
}

async function writeState(filePath: string, state: CalcState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Safe math evaluation ───────────────────────────────────────

function safeEval(expr: string): string {
  // Sanitise: only allow numbers, operators, parens, decimal points, spaces
  const sanitised = expr.replace(/\s/g, '');
  if (!/^[\d+\-*/().%^]+$/.test(sanitised)) {
    throw new Error(`Invalid expression: ${expr}`);
  }

  // Replace ^ with ** for exponentiation
  const jsExpr = sanitised.replace(/\^/g, '**');

  // Use Function constructor for sandboxed eval (no access to scope)
  const fn = new Function(`"use strict"; return (${jsExpr});`);
  const result = fn() as number;

  if (!Number.isFinite(result)) {
    throw new Error('Result is not a finite number');
  }

  // Format: remove trailing zeros from decimals
  return Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(10)).toString();
}

// ── Tool parameters ────────────────────────────────────────────

const CalcParams = Type.Object({
  action: StringEnum(['evaluate', 'history', 'clear'] as const),
  expression: Type.Optional(
    Type.String({ description: 'Math expression to evaluate (for evaluate)' }),
  ),
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

  // ── Tool: calc ─────────────────────────────────────────────

  pi.registerTool({
    name: 'calc',
    label: 'Calculator',
    description:
      'Perform calculations. Actions: evaluate (requires expression), history (show past calculations), clear (reset calculator).',
    parameters: CalcParams,

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
        case 'evaluate': {
          if (!params.expression) {
            return {
              content: [{ type: 'text', text: 'Error: expression is required' }],
              details: {},
            };
          }
          try {
            const result = safeEval(params.expression);
            const entry: HistoryEntry = {
              id: state.nextId,
              expression: params.expression,
              result,
              createdAt: new Date().toISOString(),
            };
            state.history.unshift(entry);
            state.nextId++;
            state.display = result;
            state.expression = params.expression;
            await writeState(statePath, state);
            return {
              content: [{ type: 'text', text: `${params.expression} = ${result}` }],
              details: {},
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Evaluation failed';
            return {
              content: [{ type: 'text', text: `Error: ${msg}` }],
              details: {},
            };
          }
        }

        case 'history': {
          if (state.history.length === 0) {
            return {
              content: [{ type: 'text', text: 'No calculation history.' }],
              details: {},
            };
          }
          const lines = state.history
            .slice(0, 20)
            .map((h) => `${h.expression} = ${h.result}`)
            .join('\n');
          return { content: [{ type: 'text', text: lines }], details: {} };
        }

        case 'clear': {
          await writeState(statePath, { ...DEFAULT_CALC_STATE });
          return {
            content: [{ type: 'text', text: 'Calculator cleared.' }],
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
      let text = theme.fg('toolTitle', theme.bold('calc '));
      text += theme.fg('muted', args.action);
      if (args.expression) text += ` ${theme.fg('dim', args.expression)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      if (msg.startsWith('Error:')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(theme.fg('success', '= ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Command: /calc ─────────────────────────────────────────

  pi.registerCommand('calc', {
    description: 'Open calculator / evaluate expression',
    handler: async (args, _ctx) => {
      if (args.trim()) {
        pi.sendUserMessage(`Evaluate this expression using the calc tool: ${args}`);
      } else {
        pi.sendUserMessage('Show my recent calculation history using the calc tool.');
      }
    },
  });
}
