/**
 * Memory tool — unified read/write/search/list for memory files.
 *
 * Registered via `pi.registerTool()` and bridged into `sero-cli`
 * by the schema bridge (AD-020). The agent invokes it as:
 *   sero memory read --target memory
 *   sero memory write --target daily --content "..."
 */

import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

import {
  resolveMemoryRoot,
  ensureDirectories,
  readFile,
  writeFile,
  appendFile,
  resolveTargetPath,
  searchFiles,
  listFiles,
  todayStr,
} from './memory-manager';

// ── Tool parameters ────────────────────────────────────────────

const MemoryParams = Type.Object({
  action: StringEnum(['read', 'write', 'search', 'list'] as const),
  target: Type.Optional(
    StringEnum(['memory', 'identity', 'user', 'daily'] as const),
  ),
  content: Type.Optional(
    Type.String({ description: 'Content to write (for write action)' }),
  ),
  mode: Type.Optional(
    StringEnum(['append', 'overwrite'] as const),
  ),
  date: Type.Optional(
    Type.String({ description: 'Date for daily log (YYYY-MM-DD), defaults to today' }),
  ),
  query: Type.Optional(
    Type.String({ description: 'Search query (for search action)' }),
  ),
  max_results: Type.Optional(
    Type.Number({ description: 'Max search results (default: 20)' }),
  ),
});

type MemoryParamsType = Static<typeof MemoryParams>;

// ── Helpers ─────────────────────────────────────────────────────

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }], details: {} };
}

// ── Action handlers ────────────────────────────────────────────

async function handleRead(
  root: string,
  target?: string,
  date?: string,
) {
  if (!target) return handleList(root);

  const resolved = resolveTargetPath(root, target, date);
  if (!resolved) return text(`Unknown target: ${target}`);

  const content = await readFile(resolved.path);
  if (!content) return text(`${resolved.displayName} not found or empty.`);

  return text(content);
}

async function handleWrite(
  root: string,
  target?: string,
  content?: string,
  mode?: string,
  date?: string,
) {
  if (!content) return text('Error: content is required for write action.');
  if (!target) return text('Error: target is required for write action.');

  const resolved = resolveTargetPath(root, target, date);
  if (!resolved) {
    return text(`Unknown target: ${target}. Use 'memory', 'identity', 'user', or 'daily'.`);
  }

  if (mode === 'overwrite') {
    const timestamp = new Date()
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '');
    await writeFile(resolved.path, `<!-- last updated: ${timestamp} -->\n${content}`);
  } else {
    await appendFile(resolved.path, content);
  }

  const verb = mode === 'overwrite' ? 'Wrote to' : 'Appended to';
  return text(`${verb} ${resolved.displayName}`);
}

async function handleSearch(
  root: string,
  query?: string,
  maxResults?: number,
) {
  if (!query) return text('Error: query is required for search action.');

  const results = await searchFiles(root, query, maxResults ?? 20);
  if (results.length === 0) return text(`No results for "${query}".`);

  const output = results.map((r) => `${r.file}:${r.line}: ${r.text}`).join('\n');
  return text(`Found ${results.length} results:\n\n${output}`);
}

async function handleList(root: string) {
  const files = await listFiles(root);
  const parts: string[] = [];

  if (files.root.length > 0) {
    parts.push(`Root files:\n${files.root.map((f) => `- ${f}`).join('\n')}`);
  }

  if (files.daily.length > 0) {
    const shown = files.daily.slice(0, 10);
    const more = files.daily.length > 10
      ? `\n  ... and ${files.daily.length - 10} more`
      : '';
    parts.push(
      `Daily logs (${files.daily.length}):\n${shown.map((f) => `- memory/daily/${f}`).join('\n')}${more}`,
    );
  }

  if (parts.length === 0) return text('No memory files found.');
  return text(parts.join('\n\n'));
}

// ── Register ───────────────────────────────────────────────────

export function registerMemoryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'memory',
    label: 'Memory',
    description: [
      'Manage persistent memory files for long-term context across sessions.',
      '',
      'Actions: read, write, search, list.',
      'Targets: memory (MEMORY.md), identity (IDENTITY.md), user (USER.md), daily (daily log).',
    ].join('\n'),
    parameters: MemoryParams,

    async execute(_toolCallId, params) {
      const root = resolveMemoryRoot();
      await ensureDirectories(root);

      const p = params as MemoryParamsType;

      switch (p.action) {
        case 'read':
          return handleRead(root, p.target, p.date);
        case 'write':
          return handleWrite(root, p.target, p.content, p.mode, p.date);
        case 'search':
          return handleSearch(root, p.query, p.max_results);
        case 'list':
          return handleList(root);
        default:
          return text(`Unknown action: ${p.action}`);
      }
    },

    renderCall(args, theme) {
      let t = theme.fg('toolTitle', theme.bold('memory '));
      t += theme.fg('muted', args.action);
      if (args.target) t += ` ${theme.fg('accent', args.target)}`;
      if (args.query) t += ` ${theme.fg('dim', `"${args.query}"`)}`;
      if (args.content) {
        const preview = args.content.length > 60
          ? args.content.slice(0, 57) + '...'
          : args.content;
        t += ` ${theme.fg('dim', `"${preview}"`)}`;
      }
      return new Text(t, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('Error:')) {
        return new Text(theme.fg('error', msg), 0, 0);
      }
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });
}
