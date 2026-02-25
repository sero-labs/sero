/**
 * Count Slopula Extension — Pi extension that tracks generated content pieces.
 *
 * The web UI is the primary interface — this extension provides a lightweight
 * tool so the agent can query Count Slopula's history and entombed pieces,
 * and a /count-slopula command to prompt the user to open the app.
 *
 * State: `~/.sero-ui/apps/count-slopula/state.json` (global scope)
 * Tools: count_slopula (list history or entombed)
 * Commands: /count-slopula
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { CountSlopulaState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'count-slopula', 'state.json');

function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'count-slopula', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O ───────────────────────────────────────────────

async function readState(filePath: string): Promise<CountSlopulaState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as CountSlopulaState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// ── Tool parameters ────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['history', 'entombed'] as const),
});

// ── Helpers ────────────────────────────────────────────────

function formatHistory(state: CountSlopulaState): string {
  if (state.history.length === 0) {
    return 'No Count Slopula rituals performed yet. Open the Count Slopula app to summon gloriously cliched content from the crypt!';
  }

  const lines = state.history.map((h, i) => {
    const status = h.status ?? 'launched';
    return `${i + 1}. ${h.piece.name} (slop: ${h.piece.slopRating}/10, status: ${status}) — ${h.piece.tagline}\n   Genre: ${h.piece.genre}\n   Launched: ${h.launchedAt}`;
  });
  return `Count Slopula Ritual Log:\n\n${lines.join('\n\n')}`;
}

function formatEntombed(state: CountSlopulaState): string {
  const saved = state.savedPieces ?? [];
  if (saved.length === 0) {
    return 'No entombed pieces. Open Count Slopula to summon content and entomb the best pieces for later!';
  }

  const lines = saved.map((s, i) =>
    `${i + 1}. ${s.piece.name} (slop: ${s.piece.slopRating}/10) — ${s.piece.tagline}\n   ${s.piece.body.slice(0, 150)}...\n   Genre: ${s.piece.genre}\n   Entombed: ${s.savedAt}`,
  );
  return `Count Slopula Entombed Pieces (${saved.length}):\n\n${lines.join('\n\n')}`;
}

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
    name: 'count_slopula',
    label: 'Count Slopula',
    description:
      'View Count Slopula data — previously launched content pieces or entombed/bookmarked pieces. Actions: history (list ritual log with status), entombed (list bookmarked pieces).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return {
          content: [{ type: 'text', text: 'Error: no workspace cwd' }],
          details: {},
        };
      }
      statePath = resolvedPath;

      const { action } = params as { action: 'history' | 'entombed' };
      const state = await readState(statePath);

      const text =
        action === 'history'
          ? formatHistory(state)
          : formatEntombed(state);

      return { content: [{ type: 'text', text }], details: {} };
    },

    renderCall(args, theme) {
      const { action } = args as { action: string };
      return new Text(
        theme.fg('toolTitle', theme.bold('count_slopula ')) +
          theme.fg('muted', action ?? 'history'),
        0, 0,
      );
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      return new Text(theme.fg('success', msg), 0, 0);
    },
  });

  pi.registerCommand('count-slopula', {
    description: 'Open Count Slopula — the vampire-themed cliche content generator',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage(
        'Show my Count Slopula history using the count_slopula tool.',
      );
    },
  });
}
