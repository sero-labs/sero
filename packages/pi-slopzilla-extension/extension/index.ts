/**
 * SlopZilla Extension — Pi extension that tracks generated app ideas.
 *
 * The web UI is the primary interface — this extension provides a lightweight
 * tool so the agent can query SlopZilla's history, and a /slopzilla command
 * to prompt the user to open the app.
 *
 * State: `~/.sero-ui/apps/slopzilla/state.json` (global scope)
 * Tools: slopzilla (list history of launched ideas)
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
  action: StringEnum(['history'] as const),
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
    name: 'slopzilla',
    label: 'SlopZilla',
    description:
      'View SlopZilla history — previously generated and launched app ideas. Actions: history (list all launched ideas).',
    parameters: Params,

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) {
        return {
          content: [{ type: 'text', text: 'Error: no workspace cwd' }],
          details: {},
        };
      }
      statePath = resolvedPath;
      const state = await readState(statePath);

      if (state.history.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No SlopZilla launches yet. Open the SlopZilla app to generate and launch some gloriously sloppy ideas!',
          }],
          details: {},
        };
      }

      const lines = state.history.map((h, i) =>
        `${i + 1}. ${h.idea.name} (slop: ${h.idea.slopScore}/10) — ${h.idea.tagline}\n   Tech: ${h.idea.techStack.join(', ')}\n   Launched: ${h.launchedAt}`,
      );
      return {
        content: [{ type: 'text', text: `SlopZilla Launch History:\n\n${lines.join('\n\n')}` }],
        details: {},
      };
    },

    renderCall(_args, theme) {
      return new Text(
        theme.fg('toolTitle', theme.bold('slopzilla ')) + theme.fg('muted', 'history'),
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
