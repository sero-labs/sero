/**
 * Scratchpad — a persistent checklist of things to fix/remember.
 *
 * Stored at ~/.sero-ui/workspaces/global/SCRATCHPAD.md as a
 * markdown checklist. Open items are injected into the per-turn
 * message stream by the context injector (NOT the system prompt) so
 * scratchpad edits never invalidate the provider's cached prefix.
 *
 * Tool actions: add, done, undo, clear_done, list.
 * Bridged into sero-cli as `sero scratchpad add "Fix auth bug"`.
 */

import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from 'typebox';

import {
  resolveMemoryRoot,
  readFile,
  writeFile,
  getScratchpadPath as resolveScratchpadPath,
  getTargetUsage,
} from './memory-manager';
import { nowTimestamp } from './memory-format';
import { scheduleQmdUpdate } from './qmd';
import type { ScratchpadItem } from '../shared/types';

// ── Path ───────────────────────────────────────────────────────

export function getScratchpadPath(): string {
  return resolveScratchpadPath(resolveMemoryRoot());
}

// ── Parse / Serialize ──────────────────────────────────────────

export function parseScratchpad(content: string): ScratchpadItem[] {
  const items: ScratchpadItem[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(/^- \[([ xX])\] (.+)$/);
    if (match) {
      let meta = '';
      if (i > 0 && lines[i - 1]!.match(/^<!--.*-->$/)) {
        meta = lines[i - 1]!;
      }
      items.push({
        done: match[1]!.toLowerCase() === 'x',
        text: match[2]!,
        meta,
      });
    }
  }

  return items;
}

export function serializeScratchpad(items: ScratchpadItem[]): string {
  const lines: string[] = ['# Scratchpad', ''];
  for (const item of items) {
    if (item.meta) lines.push(item.meta);
    const checkbox = item.done ? '[x]' : '[ ]';
    lines.push(`- ${checkbox} ${item.text}`);
  }
  return `${lines.join('\n')}\n`;
}

// ── Read open items (for context injection) ────────────────────

export async function getOpenScratchpadItems(): Promise<ScratchpadItem[]> {
  const content = await readFile(getScratchpadPath());
  if (!content?.trim()) return [];
  return parseScratchpad(content).filter((i) => !i.done);
}

export function formatScratchpadForInjection(items: ScratchpadItem[]): string {
  if (items.length === 0) return '';
  const lines = items.map((i) => `- [ ] ${i.text}`);
  return `## Scratchpad (${items.length} open)\n\n${lines.join('\n')}`;
}

// ── Helpers ─────────────────────────────────────────────────────

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }], details: {} };
}

function withinScratchpadCapacity(content: string): string | null {
  const usage = getTargetUsage('scratchpad', content);
  if (usage.chars <= usage.max) return null;
  return `Error: SCRATCHPAD.md would exceed capacity (${usage.chars}/${usage.max} chars). Clear done items or shorten open items before adding more.`;
}

// ── Tool parameters ────────────────────────────────────────────

const ScratchpadParams = Type.Object({
  action: StringEnum(['add', 'done', 'undo', 'clear_done', 'list'] as const),
  text: Type.Optional(
    Type.String({ description: 'Item text for add, or substring to match for done/undo' }),
  ),
});

// ── Register ───────────────────────────────────────────────────

export function registerScratchpadTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'scratchpad',
    label: 'Scratchpad',
    description: [
      'Manage a persistent checklist of things to fix or keep in mind.',
      "- 'add': Add a new item (requires text)",
      "- 'done': Mark an item as done (match by substring)",
      "- 'undo': Uncheck a done item (match by substring)",
      "- 'clear_done': Remove all checked items",
      "- 'list': Show all items",
    ].join('\n'),
    parameters: ScratchpadParams,

    async execute(_toolCallId, params) {
      const filePath = getScratchpadPath();
      const existing = await readFile(filePath);
      let items = existing?.trim() ? parseScratchpad(existing) : [];
      const ts = nowTimestamp();

      const action = params.action as string;
      const itemText = params.text as string | undefined;

      switch (action) {
        case 'list': {
          if (items.length === 0) return text('Scratchpad is empty.');
          const serialised = serializeScratchpad(items);
          const open = items.filter((i) => !i.done).length;
          return text(`${serialised}\n(${open} open, ${items.length - open} done)`);
        }

        case 'add': {
          if (!itemText) return text('Error: text is required for add.');
          const nextItems = [...items, { done: false, text: itemText, meta: `<!-- ${ts} -->` }];
          const nextContent = serializeScratchpad(nextItems);
          const capacityError = withinScratchpadCapacity(nextContent);
          if (capacityError) return text(capacityError);
          items = nextItems;
          await writeFile(filePath, nextContent);
          scheduleQmdUpdate();
          return text(`Added: - [ ] ${itemText}`);
        }

        case 'done':
        case 'undo': {
          if (!itemText) return text(`Error: text is required for ${action}.`);
          const needle = itemText.toLowerCase();
          const targetDone = action === 'done';
          let matched = false;

          for (const item of items) {
            if (item.done !== targetDone && item.text.toLowerCase().includes(needle)) {
              item.done = targetDone;
              matched = true;
              break;
            }
          }

          if (!matched) {
            return text(`No matching ${targetDone ? 'open' : 'done'} item for: "${itemText}"`);
          }

          await writeFile(filePath, serializeScratchpad(items));
          scheduleQmdUpdate();
          const verb = targetDone ? 'Completed' : 'Reopened';
          return text(`${verb} item matching "${itemText}".`);
        }

        case 'clear_done': {
          const before = items.length;
          items = items.filter((i) => !i.done);
          const removed = before - items.length;
          await writeFile(filePath, serializeScratchpad(items));
          scheduleQmdUpdate();
          return text(`Cleared ${removed} done item(s). ${items.length} remaining.`);
        }

        default:
          return text(`Unknown action: ${action}`);
      }
    },

    renderCall(args, theme) {
      let t = theme.fg('toolTitle', theme.bold('scratchpad '));
      t += theme.fg('muted', args.action);
      if (args.text) t += ` ${theme.fg('dim', `"${args.text}"`)}`;
      return new Text(t, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('Error:')) return new Text(theme.fg('error', msg), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });
}
