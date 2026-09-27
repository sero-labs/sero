/**
 * The `memory` tool (design D7), bridged into `sero-cli` (AD-020).
 *
 * Entries: save, replace, remove, restore, pin, unpin, list.
 * Profile: read and write for `identity` (IDENTITY.md) and `user` (USER.md).
 * Profile writes overwrite the whole file and need no entry fields.
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type, type Static } from 'typebox';

import { error, errorDetails } from './logger';
import {
  listVisibleEntries,
  pinEntry,
  removeEntry,
  replaceEntry,
  restoreRemovedEntry,
  saveEntry,
  unpinEntry,
  type EntryContext,
  type MemoryChange,
} from './memory-entries';
import { normalizeManagedMarkdown, stripManagedFileMetadata } from './memory-format';
import { scanMemoryContent } from './memory-guards';
import { getTargetUsage, readFile, resolveMemoryRoot, resolveTargetPath, writeFile } from './memory-manager';

const MemoryParams = Type.Object({
  action: StringEnum(['save', 'replace', 'remove', 'restore', 'pin', 'unpin', 'list', 'read', 'write'] as const),
  content: Type.Optional(Type.String({ description: 'save/replace: the fact. write: the complete new profile file.' })),
  behaviour: Type.Optional(Type.String({ description: 'save/replace: how the fact changes what you do.' })),
  type: Type.Optional(StringEnum(['preference', 'decision', 'lesson', 'reference'] as const)),
  scope: Type.Optional(StringEnum(['global', 'workspace'] as const, { description: 'global: about the user, every workspace. workspace: this project only.' })),
  delivery: Type.Optional(StringEnum(['pinned', 'on-match'] as const, { description: 'pinned: always in the prompt. on-match: added when a message matches its terms.' })),
  terms: Type.Optional(Type.String({ description: 'Comma-separated words a future task would use.' })),
  id: Type.Optional(Type.String({ description: 'Entry id for replace, remove, restore, pin and unpin.' })),
  distinct: Type.Optional(Type.Boolean({ description: 'save: confirm the new memory is a different fact from the close ones reported.' })),
  reason: Type.Optional(Type.String({ description: 'remove: why the memory is no longer true.' })),
  target: Type.Optional(StringEnum(['identity', 'user'] as const, { description: 'read/write: identity (IDENTITY.md) or user (USER.md).' })),
});

type MemoryParamsType = Static<typeof MemoryParams>;

export const MEMORY_TOOL_DESCRIPTION = [
  'Long-term memory for this user and project. Never edit memory files with bash, read, write or edit.',
  '',
  'Save a memory when:',
  '- the user corrects you;',
  '- the user states a preference;',
  '- the user makes a decision and gives a reason;',
  '- you meet a surprise or a trap (something that did not work as expected).',
  'Save it only if a future session would behave worse without it and could not learn it from the code, the git history or this chat. Do not save summaries of finished work.',
  '',
  'save needs: content (the fact), behaviour (how it changes what you do), type (preference|decision|lesson|reference), scope (global: about the user, every workspace; workspace: this project only), delivery (pinned: rules for most tasks, always in the prompt; on-match: added when a message matches) and terms (the words a future task would use).',
  'If save reports close memories, replace the one the new fact updates, or save again with distinct: true. When a new fact conflicts with a memory, replace it; never keep two.',
  'remove moves a wrong memory to the trash; restore brings it back. pin and unpin change delivery. list shows every memory with its id.',
  '',
  'Profile: read or write --target identity|user. write replaces the whole file, so read it first and keep the fields that do not change. Use it when the user changes how you should behave or tells you about themselves.',
].join('\n');

const PROFILE_TITLES = { identity: 'IDENTITY.md', user: 'USER.md' } as const;

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }], details: {} };
}

/** @internal Exported for testing. */
export async function readProfile(target: MemoryParamsType['target']): Promise<string> {
  if (!target) return 'Error: target (identity|user) is required for read.';
  const resolved = resolveTargetPath(resolveMemoryRoot(), target)!;
  const content = await readFile(resolved.path);
  return content?.trim() ? stripManagedFileMetadata(content) : `${resolved.displayName} is empty.`;
}

/** @internal Exported for testing. */
export async function writeProfile(target: MemoryParamsType['target'], content: string | undefined): Promise<string> {
  if (!target) return 'Error: target (identity|user) is required for write.';
  if (!content?.trim()) return 'Error: content is required for write.';
  const scan = scanMemoryContent(content.replace(/\\n/g, '\n'));
  if (scan.action === 'block') {
    return `Error: profile not written — the text matches a blocked pattern (${scan.reason ?? 'security pattern'}). Rephrase it.`;
  }
  const next = normalizeManagedMarkdown(scan.content);
  const usage = getTargetUsage(target, next);
  if (usage.chars > usage.max) {
    return `Error: ${PROFILE_TITLES[target]} would exceed its size limit (${usage.chars}/${usage.max} chars). Shorten it.`;
  }
  await writeFile(resolveTargetPath(resolveMemoryRoot(), target)!.path, next);
  return `Wrote ${PROFILE_TITLES[target]}. The new profile is in the system prompt from the next session.`;
}

/** @internal Exported for testing. */
export async function executeMemoryAction(entryContext: EntryContext, p: MemoryParamsType): Promise<string> {
  switch (p.action) {
    case 'save':
      return saveEntry(entryContext, p);
    case 'replace':
      return replaceEntry(entryContext, p);
    case 'remove':
      return removeEntry(entryContext, p.id, p.reason);
    case 'restore':
      return restoreRemovedEntry(entryContext, p.id);
    case 'pin':
      return pinEntry(entryContext, p.id);
    case 'unpin':
      return unpinEntry(entryContext, p.id);
    case 'list':
      return listVisibleEntries(entryContext);
    case 'read':
      return readProfile(p.target);
    case 'write':
      return writeProfile(p.target, p.content);
    default:
      return `Unknown action: ${String((p as { action: unknown }).action)}`;
  }
}

export function registerMemoryTool(pi: ExtensionAPI, entryContextOf: (ctx: ExtensionContext) => EntryContext): void {
  pi.registerTool({
    name: 'memory',
    label: 'Memory',
    description: MEMORY_TOOL_DESCRIPTION,
    parameters: MemoryParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p = params as MemoryParamsType;
      try {
        let change: MemoryChange | undefined;
        const result = await executeMemoryAction({ ...entryContextOf(ctx), onChange: (value) => { change = value; } }, p);
        // The chat draws a save, replace or remove as one line from this (design D13).
        return { ...text(result), details: change ? { memoryChange: change } : {} };
      } catch (err) {
        await error('memory_tool_failed', { action: p.action, ...errorDetails(err) });
        throw err;
      }
    },

    renderCall(args, theme) {
      let output = theme.fg('toolTitle', theme.bold('memory '));
      output += theme.fg('muted', args.action);
      if (args.target) output += ` ${theme.fg('accent', args.target)}`;
      if (args.id) output += ` ${theme.fg('accent', args.id)}`;
      if (args.content) {
        const preview = args.content.length > 60 ? `${args.content.slice(0, 57)}...` : args.content;
        output += ` ${theme.fg('dim', `"${preview}"`)}`;
      }
      return new Text(output, 0, 0);
    },

    renderResult(result, _options, theme) {
      const message = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (message.startsWith('Error:')) return new Text(theme.fg('error', message), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', message), 0, 0);
    },
  });
}
