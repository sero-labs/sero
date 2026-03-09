/**
 * Humanizer Extension — Pi extension for text transformation.
 *
 * Provides a tool for querying/saving transformation history,
 * and registers the humanizer skill for AI-pattern removal.
 *
 * State: `~/.sero-ui/apps/humanizer/state.json` (global scope)
 * Skills: `skills/humanizer/SKILL.md`
 * Tools: humanize (list/save history)
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

function statePath(): string {
  const seroHome = process.env.SERO_HOME;
  if (!seroHome) {
    throw new Error('SERO_HOME is not set — humanizer requires the Sero desktop environment');
  }
  return path.join(seroHome, 'apps', 'humanizer', 'state.json');
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
  output: Type.Optional(Type.String({ description: 'Transformed text (for save)' })),
  instructions: Type.Optional(Type.String({ description: 'Instructions/modifiers used (for save)' })),
  styles: Type.Optional(Type.String({ description: 'Comma-separated style IDs used (for save)' })),
});

// ── Helpers ────────────────────────────────────────────────

function formatHistory(state: HumanizerState): string {
  if (state.entries.length === 0) {
    return 'No transformations yet. Use the Humanizer app or ask me to transform some text.';
  }
  const lines = state.entries.slice(-10).map((e, i) => {
    const preview = e.inputText.slice(0, 80).replace(/\n/g, ' ');
    const styleStr = e.styleIds?.length ? ` [styles: ${e.styleIds.join(', ')}]` : '';
    const instrStr = e.instructions ? ` (modifiers: ${e.instructions.slice(0, 40)})` : '';
    return `${i + 1}. [${e.createdAt}]${styleStr}${instrStr}\n   Input: "${preview}..."`;
  });
  return `Recent transformations (${state.entries.length} total):\n\n${lines.join('\n\n')}`;
}

// ── Extension ──────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'humanize',
    label: 'Humanize',
    description:
      'Manage text transformation history. Actions: list (show recent transformations), ' +
      'save (store a transformation — requires input + output, optional styles + instructions).',
    parameters: Params,

    async execute(_toolCallId, params) {
      const filePath = statePath();
      const state = await readState(filePath);

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
            styleIds: params.styles ? params.styles.split(',').map((s) => s.trim()) : undefined,
          };
          state.entries = [...state.entries.slice(-19), entry]; // keep last 20
          state.nextId++;
          await writeState(filePath, state);
          return {
            content: [{ type: 'text', text: `Saved transformation #${entry.id}` }],
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
    description: 'Open the Humanizer — transform text with creative writing styles',
    handler: async (_args, _ctx) => {
      pi.sendUserMessage(
        'Show my recent transformations using the humanize tool with action list.',
      );
    },
  });
}
