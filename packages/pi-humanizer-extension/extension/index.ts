/**
 * Humanizer Extension — Pi extension for humanizing AI-generated text.
 *
 * Provides a lightweight tool so the agent can query humanization history,
 * and registers the humanizer skill so the agent can apply it directly.
 *
 * State: `~/.sero-ui/apps/humanizer/state.json` (global scope)
 * Skills: `skills/humanizer/SKILL.md`
 * Tools: humanize (list history)
 * Commands: /humanize
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { HumanizerState, HumanizeEntry } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── State file path ────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'humanizer', 'state.json');

function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'humanizer', 'state.json');
  }
  return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O ───────────────────────────────────────────────

async function readState(filePath: string): Promise<HumanizerState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as HumanizerState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: HumanizerState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Tool parameters ────────────────────────────────────────

const Params = Type.Object({
  action: StringEnum(['list', 'save'] as const),
  input: Type.Optional(Type.String({ description: 'Original text (for save)' })),
  output: Type.Optional(Type.String({ description: 'Humanized text (for save)' })),
  instructions: Type.Optional(Type.String({ description: 'Instructions used (for save)' })),
});

// ── Helpers ────────────────────────────────────────────────

function formatHistory(state: HumanizerState): string {
  if (state.entries.length === 0) {
    return 'No humanizations yet. Use the Humanizer app or ask me to humanize some text.';
  }
  const lines = state.entries.slice(-10).map((e, i) => {
    const preview = e.inputText.slice(0, 80).replace(/\n/g, ' ');
    const instr = e.instructions ? ` (instructions: ${e.instructions.slice(0, 40)})` : '';
    return `${i + 1}. [${e.createdAt}]${instr}\n   Input: "${preview}..."`;
  });
  return `Recent humanizations (${state.entries.length} total):\n\n${lines.join('\n\n')}`;
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
    name: 'humanize',
    label: 'Humanize',
    description:
      'Manage humanized text history. Actions: list (show recent humanizations), save (store a humanization result — requires input + output).',
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
      const state = await readState(statePath);

      switch (params.action) {
        case 'list': {
          return {
            content: [{ type: 'text', text: formatHistory(state) }],
            details: {},
          };
        }

        case 'save': {
          if (!params.input || !params.output) {
            return {
              content: [{ type: 'text', text: 'Error: input and output are required for save' }],
              details: {},
            };
          }
          const entry: HumanizeEntry = {
            id: state.nextId,
            inputText: params.input,
            instructions: params.instructions ?? '',
            outputText: params.output,
            createdAt: new Date().toISOString(),
          };
          state.entries = [...state.entries.slice(-19), entry]; // keep last 20
          state.nextId++;
          await writeState(statePath, state);
          return {
            content: [{ type: 'text', text: `Saved humanization #${entry.id}` }],
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
      const action = (args as { action?: string }).action ?? 'list';
      return new Text(
        theme.fg('toolTitle', theme.bold('humanize ')) +
          theme.fg('muted', action),
        0, 0,
      );
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const msg = text?.type === 'text' ? text.text : '';
      return new Text(
        msg.startsWith('Error:')
          ? theme.fg('error', msg)
          : theme.fg('success', '✓ ') + theme.fg('muted', msg),
        0, 0,
      );
    },
  });

  pi.registerCommand('humanize', {
    description: 'Open the Humanizer — remove AI writing patterns from text',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage(
        'Show my recent humanizations using the humanize tool with action list.',
      );
    },
  });
}
