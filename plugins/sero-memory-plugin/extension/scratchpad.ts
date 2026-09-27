/**
 * The per-workspace scratchpad: a checklist of open items with no expiry,
 * stored in `<workspace>/.sero/apps/memory/scratchpad.md`.
 *
 * Open items are part of the session snapshot. A change during a session
 * returns the full current list in the tool result, so the conversation holds
 * the current state and the system prompt stays unchanged until the next
 * session or compaction.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type, type Static } from 'typebox';

import { workspaceMemoryDir, writeFileAtomic } from './entry-store';
import { guardWorkspaceWrite } from './git-guard';
import { error, errorDetails } from './logger';
import { scanMemoryContent } from './memory-guards';
import { recordMetric } from './metrics';
import { enqueueWrite } from './registry';

export interface ScratchpadItem {
  done: boolean;
  text: string;
}

const ITEM_RE = /^- \[( |x|X)\] (.+)$/;

export function scratchpadPath(workspaceRoot: string): string {
  return path.join(workspaceMemoryDir(workspaceRoot), 'scratchpad.md');
}

export function parseScratchpad(content: string): ScratchpadItem[] {
  return content.split('\n').flatMap((line) => {
    const match = ITEM_RE.exec(line.trim());
    return match ? [{ done: match[1] !== ' ', text: match[2]!.trim() }] : [];
  });
}

export function serializeScratchpad(items: ScratchpadItem[]): string {
  return `${items.map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`).join('\n')}\n`;
}

export async function readScratchpad(workspaceRoot: string): Promise<ScratchpadItem[]> {
  try {
    return parseScratchpad(await fs.readFile(scratchpadPath(workspaceRoot), 'utf8'));
  } catch {
    return [];
  }
}

export function formatScratchpad(items: ScratchpadItem[]): string {
  const open = items.filter((item) => !item.done).length;
  if (items.length === 0) return 'Scratchpad is empty.';
  return [
    `Scratchpad (${open} open):`,
    ...items.map((item, index) => `${index + 1}. [${item.done ? 'x' : ' '}] ${item.text}`),
  ].join('\n');
}

const ScratchpadParams = Type.Object({
  action: StringEnum(['add', 'done', 'undo', 'list'] as const),
  text: Type.Optional(Type.String({ description: 'add: the open item, one line.' })),
  item: Type.Optional(Type.Number({ description: 'done/undo: the item number shown by list.' })),
});

type ScratchpadParamsType = Static<typeof ScratchpadParams>;

/** @internal Exported for testing. */
export async function executeScratchpad(workspaceRoot: string, sessionId: string, p: ScratchpadParamsType): Promise<string> {
  if (p.action === 'list') return formatScratchpad(await readScratchpad(workspaceRoot));

  const guard = await guardWorkspaceWrite(workspaceRoot);
  if (!guard.ok) return `Error: ${guard.reason}`;

  return enqueueWrite(async () => {
    const items = await readScratchpad(workspaceRoot);
    if (p.action === 'add') {
      const itemText = p.text?.replace(/\s+/g, ' ').trim();
      if (!itemText) return 'Error: text is required for add.';
      const scan = scanMemoryContent(itemText);
      if (scan.action === 'block') return `Error: item not added — the text matches a blocked pattern (${scan.reason ?? 'security pattern'}).`;
      items.push({ done: false, text: scan.content });
    } else {
      const index = typeof p.item === 'number' ? Math.trunc(p.item) - 1 : -1;
      if (index < 0 || index >= items.length) return `Error: item must be a number from 1 to ${items.length}.\n${formatScratchpad(items)}`;
      items[index] = { ...items[index]!, done: p.action === 'done' };
    }
    await writeFileAtomic(scratchpadPath(workspaceRoot), serializeScratchpad(items));
    await recordMetric('scratchpad', { session: sessionId, action: p.action, open: items.filter((item) => !item.done).length });
    return formatScratchpad(items);
  });
}

export const SCRATCHPAD_TOOL_DESCRIPTION = [
  'A checklist of open items for this workspace that carries over between sessions (for example "migrate the auth tests", "ask about the release date").',
  'add an item when work is left open; mark it done when it is finished. Every change returns the full current list.',
  'Open items appear in the system prompt of the next session.',
].join('\n');

export function registerScratchpadTool(pi: ExtensionAPI, workspaceOf: (ctx: ExtensionContext) => { workspaceRoot: string; sessionId: string }): void {
  pi.registerTool({
    name: 'scratchpad',
    label: 'Scratchpad',
    description: SCRATCHPAD_TOOL_DESCRIPTION,
    parameters: ScratchpadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as ScratchpadParamsType;
      const { workspaceRoot, sessionId } = workspaceOf(ctx);
      try {
        return { content: [{ type: 'text' as const, text: await executeScratchpad(workspaceRoot, sessionId, p) }], details: {} };
      } catch (err) {
        await error('scratchpad_tool_failed', { action: p.action, ...errorDetails(err) });
        throw err;
      }
    },
  });
}
