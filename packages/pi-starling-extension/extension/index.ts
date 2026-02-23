/**
 * Starling Bank Extension — Pi extension with file-based state.
 *
 * Reads/writes `.sero/apps/starling/state.json`.
 * The web UI handles token encryption/decryption and API calls.
 * This extension provides CLI tools for basic account info.
 *
 * Tools (LLM-callable): starling (status, clear)
 * Commands (user): /starling
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { StarlingState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'starling', 'state.json');

/**
 * Resolve the state file path. Global-scoped app:
 * - In Sero (SERO_HOME set): ~/.sero-ui/apps/starling/state.json
 * - In Pi CLI (no SERO_HOME): workspace-relative
 */
function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'starling', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O ────────────────────────────────────────────────────

async function readState(filePath: string): Promise<StarlingState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StarlingState;
    if (parsed && typeof parsed === 'object' && parsed.auth) {
      return parsed;
    }
    return { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: StarlingState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Helpers ────────────────────────────────────────────────────

function formatMoney(minorUnits: number, currency: string): string {
  const major = minorUnits / 100;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(major);
}

// ── Tool parameters ────────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['status', 'clear'] as const),
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

  // ── Tool: starling ─────────────────────────────────────────

  pi.registerTool({
    name: 'starling',
    label: 'Starling Bank',
    description:
      'Interact with your Starling Bank account. Actions: status (show cached account info), clear (remove all stored data).',
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
        case 'status': {
          const isLoggedIn = !!state.auth.encryptedToken;
          if (!isLoggedIn) {
            return {
              content: [{
                type: 'text',
                text: 'Not connected. Open the Starling Bank app in Sero to connect your account.',
              }],
              details: {},
            };
          }

          let text = 'Starling Bank — Connected\n';

          if (state.cache.balance) {
            const b = state.cache.balance;
            const currency = b.effectiveBalance?.currency || 'GBP';
            text += `\nBalance: ${formatMoney(b.effectiveBalance?.minorUnits ?? 0, currency)}`;
            text += `\nAvailable: ${formatMoney(b.amount?.minorUnits ?? 0, currency)}`;
          }

          if (state.cache.transactions && state.cache.transactions.length > 0) {
            text += `\n\nRecent Transactions (${Math.min(5, state.cache.transactions.length)}):`;
            const recent = state.cache.transactions.slice(0, 5);
            for (const tx of recent) {
              const sign = tx.direction === 'OUT' ? '-' : '+';
              const amount = formatMoney(tx.amount.minorUnits, tx.amount.currency);
              text += `\n  ${sign}${amount} — ${tx.counterPartyName || tx.reference || 'Unknown'}`;
            }
          }

          if (state.cache.savingsGoals && state.cache.savingsGoals.length > 0) {
            text += `\n\nSavings Goals:`;
            for (const goal of state.cache.savingsGoals) {
              const saved = formatMoney(goal.totalSaved.minorUnits, goal.totalSaved.currency);
              const target = goal.target
                ? ` / ${formatMoney(goal.target.minorUnits, goal.target.currency)}`
                : '';
              text += `\n  ${goal.name}: ${saved}${target}`;
            }
          }

          if (state.cache.lastFetchedAt) {
            text += `\n\nLast updated: ${new Date(state.cache.lastFetchedAt).toLocaleString()}`;
          }

          return { content: [{ type: 'text', text }], details: {} };
        }

        case 'clear': {
          await writeState(statePath, { ...DEFAULT_STATE });
          return {
            content: [{ type: 'text', text: 'Cleared all Starling Bank data and credentials.' }],
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
      let text = theme.fg('toolTitle', theme.bold('starling '));
      text += theme.fg('muted', args.action);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      if (msg.startsWith('Error:') || msg.startsWith('Not connected')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Command: /starling ──────────────────────────────────────

  pi.registerCommand('starling', {
    description: 'Show Starling Bank account status (or pass instructions inline)',
    handler: async (args, _ctx) => {
      const instruction = args.trim();
      if (instruction) {
        pi.sendUserMessage(`Using the starling tool: ${instruction}`);
      } else {
        pi.sendUserMessage('Show my Starling Bank account status using the starling tool.');
      }
    },
  });
}
