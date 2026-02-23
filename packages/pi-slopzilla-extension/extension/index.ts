/**
 * SlopZilla Extension — Pi extension that tracks generated app ideas.
 *
 * The web UI is the primary interface — this extension provides a lightweight
 * tool so the agent can query SlopZilla's history and saved ideas, and a
 * /slopzilla command to prompt the user to open the app.
 *
 * State: `~/.sero-ui/apps/slopzilla/state.json` (global scope)
 * Tools: slopzilla (list history or saved ideas)
 * Commands: /slopzilla
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { SlopZillaState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'slopzilla', 'state.json');

function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'slopzilla', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O ───────────────────────────────────────────────

async function readState(filePath: string): Promise<SlopZillaState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as SlopZillaState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// ── Tool parameters ────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['history', 'saved'] as const),
});

// ── Helpers ────────────────────────────────────────────────

function formatHistory(state: SlopZillaState): string {
  if (state.history.length === 0) {
    return 'No SlopZilla launches yet. Open the SlopZilla app to generate and launch some gloriously sloppy ideas!';
  }

  const lines = state.history.map((h, i) => {
    const status = h.status ?? 'launched';
    return `${i + 1}. ${h.idea.name} (slop: ${h.idea.slopScore}/10, status: ${status}) — ${h.idea.tagline}\n   Tech: ${h.idea.techStack.join(', ')}\n   Launched: ${h.launchedAt}`;
  });
  return `SlopZilla Launch History:\n\n${lines.join('\n\n')}`;
}

function formatSaved(state: SlopZillaState): string {
  const saved = state.savedIdeas ?? [];
  if (saved.length === 0) {
    return 'No saved ideas. Open SlopZilla to generate ideas and bookmark the best ones for later!';
  }

  const lines = saved.map((s, i) =>
    `${i + 1}. ${s.idea.name} (slop: ${s.idea.slopScore}/10) — ${s.idea.tagline}\n   ${s.idea.description}\n   Tech: ${s.idea.techStack.join(', ')}\n   Saved: ${s.savedAt}`,
  );
  return `SlopZilla Saved Ideas (${saved.length}):\n\n${lines.join('\n\n')}`;
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
    name: 'slopzilla',
    label: 'SlopZilla',
    description:
      'View SlopZilla data — previously launched ideas or saved/bookmarked ideas. Actions: history (list launches with status), saved (list bookmarked ideas).',
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

      const { action } = params as { action: 'history' | 'saved' };
      const state = await readState(statePath);

      const text =
        action === 'history'
          ? formatHistory(state)
          : formatSaved(state);

      return { content: [{ type: 'text', text }], details: {} };
    },

    renderCall(args, theme) {
      const { action } = args as { action: string };
      return new Text(
        theme.fg('toolTitle', theme.bold('slopzilla ')) +
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

  pi.registerCommand('slopzilla', {
    description: 'Open SlopZilla — the kaiju-sized AI slop idea generator',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage(
        'Show my SlopZilla history using the slopzilla tool.',
      );
    },
  });
}
