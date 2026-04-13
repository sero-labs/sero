/**
 * Context Extension — Pi extension for agent-driven context management.
 *
 * Provides three tools (context_tag, context_log, context_checkout) that let
 * the agent manage its own conversation history like a Git repo.
 *
 * In Sero, also writes structured state snapshots so the web UI can visualise
 * the latest saved context graph and token usage.
 *
 * Based on pi-context by ttttmr (https://github.com/ttttmr/pi-context)
 */

import path from 'node:path';
import { Type, type Static } from '@sinclair/typebox';
import type {
  ExtensionAPI,
  SessionManager,
  SessionEntry,
  ExtensionContext,
} from '@mariozechner/pi-coding-agent';
import type { TextContent, ImageContent, ToolCall } from '@mariozechner/pi-ai';
import { Text } from '@mariozechner/pi-tui';

import { resolveTargetId, formatTokens, isInternal } from './helpers';
import { buildSnapshot, writeSnapshot } from './snapshot';

// ── State file path ────────────────────────────────────────────

const STATE_REL_PATH = path.join('.sero', 'apps', 'context', 'state.json');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

// ── Tool parameters ────────────────────────────────────────────

const ContextTagParams = Type.Object({
  name: Type.String({ description: 'The tag/milestone name. Use meaningful names.' }),
  target: Type.Optional(
    Type.String({ description: 'The commit ID to tag. Defaults to HEAD (current state).' }),
  ),
});

const ContextLogParams = Type.Object({
  limit: Type.Optional(
    Type.Number({ description: 'History limit for visible entries (default: 50).' }),
  ),
  verbose: Type.Optional(
    Type.Boolean({
      description:
        "If true, show ALL messages. If false (default), collapses intermediate AI steps and only shows 'milestones': User messages, Tags, Branch Points, and Summaries.",
    }),
  ),
});

const ContextCheckoutParams = Type.Object({
  target: Type.String({
    description:
      "Where to jump/squash to. Can be a tag name (e.g., 'task-start'), a commit ID, or 'root'. This is the base for your new branch.",
  }),
  message: Type.String({
    description:
      "The 'Carryover Message' for the new branch. Good format: '[Status] + [Reason] + [Important Changes] + [Carryover Data]'",
  }),
  backupTag: Type.Optional(
    Type.String({
      description:
        'Optional tag name to apply to the CURRENT state before checking out. Creates an automatic backup.',
    }),
  ),
});

// ── Helper: update snapshot ────────────────────────────────────

async function updateSnapshot(
  sm: SessionManager,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  statePath: string,
): Promise<void> {
  try {
    const snapshot = await buildSnapshot(sm, ctx, pi);
    await writeSnapshot(statePath, snapshot);
  } catch (err) {
    console.error('[context-ext] Failed to write snapshot:', err);
  }
}

// ── Extension entry point ──────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  // ── Tool: context_tag ──────────────────────────────────────

  pi.registerTool({
    name: 'context_tag',
    label: 'Context Tag',
    description:
      "Creates a 'Save Point' (Bookmark) in the history. Use before risky changes or when a feature is stable.",
    parameters: ContextTagParams,

    async execute(_id, params: Static<typeof ContextTagParams>, _signal, _onUpdate, ctx) {
      const sm = ctx.sessionManager as SessionManager;
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (resolvedPath) statePath = resolvedPath;

      let id = params.target ? resolveTargetId(sm, params.target) : undefined;

      if (!id) {
        const branch = sm.getBranch();
        for (let i = branch.length - 1; i >= 0; i--) {
          const entry = branch[i];
          if (entry.type === 'message' && entry.message.role === 'toolResult') {
            if (isInternal((entry.message as any).toolName)) continue;
            id = entry.id;
            break;
          }
          if (entry.type === 'message' && entry.message.role === 'assistant') {
            const hasInternalTool = (entry.message as any).content.some(
              (c: any) => c.type === 'toolCall' && isInternal(c.name),
            );
            if (!hasInternalTool) { id = entry.id; break; }
          }
          id = entry.id;
          break;
        }
        if (!id) id = sm.getLeafId() ?? '';
      }

      pi.setLabel(id, params.name);

      if (statePath) await updateSnapshot(sm, ctx, pi, statePath);

      return {
        content: [{ type: 'text', text: `Created tag '${params.name}' at ${id}` }],
        details: {},
      };
    },

    renderCall(args, theme) {
      return new Text(
        theme.fg('toolTitle', theme.bold('context_tag ')) +
          theme.fg('accent', `"${args.name}"`),
        0, 0,
      );
    },
    renderResult(result, _opts, theme) {
      const msg = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(theme.fg('success', '🔖 ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Tool: context_log ──────────────────────────────────────

  pi.registerTool({
    name: 'context_log',
    label: 'Context Log',
    description:
      "Show the history structure (status, message, tags, milestones). Analogous to 'git log --graph --oneline --decorate'.",
    parameters: ContextLogParams,

    async execute(_id, params: Static<typeof ContextLogParams>, _signal, _onUpdate, ctx) {
      const sm = ctx.sessionManager as SessionManager;
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (resolvedPath) statePath = resolvedPath;

      const text = buildLogText(sm, ctx, params.verbose ?? false, params.limit ?? 50);

      if (statePath) await updateSnapshot(sm, ctx, pi, statePath);

      return { content: [{ type: 'text', text: await text }], details: {} };
    },

    renderCall(_args, theme) {
      return new Text(theme.fg('toolTitle', theme.bold('context_log')), 0, 0);
    },
    renderResult(result, _opts, theme) {
      const msg = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Tool: context_checkout ─────────────────────────────────

  pi.registerTool({
    name: 'context_checkout',
    label: 'Context Checkout',
    description:
      'Navigate to ANY point in the conversation history. Only resets conversation history, NOT disk files. ALWAYS provide a detailed message.',
    parameters: ContextCheckoutParams,

    async execute(_id, params: Static<typeof ContextCheckoutParams>, _signal, _onUpdate, ctx) {
      const sm = ctx.sessionManager as SessionManager;
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (resolvedPath) statePath = resolvedPath;

      const tid = resolveTargetId(sm, params.target);
      const currentLeaf = sm.getLeafId();

      if (currentLeaf === tid) {
        return { content: [{ type: 'text', text: `Already at target ${tid}` }], details: {} };
      }

      if (params.backupTag && currentLeaf) {
        pi.setLabel(currentLeaf, params.backupTag);
      }

      const currentLabel = currentLeaf ? sm.getLabel(currentLeaf) : undefined;
      const origin = currentLabel ? `tag: ${currentLabel}` : currentLeaf || 'unknown';
      const enrichedMessage = `(summary from ${origin})\n${params.message}`;

      await sm.branchWithSummary(tid, enrichedMessage);

      if (statePath) await updateSnapshot(sm, ctx, pi, statePath);

      return {
        content: [
          {
            type: 'text',
            text: `Checked out ${tid}\nBackup tag: ${params.backupTag || 'none'}\nMessage: ${enrichedMessage}`,
          },
        ],
        details: {},
      };
    },

    renderCall(args, theme) {
      return new Text(
        theme.fg('toolTitle', theme.bold('context_checkout ')) +
          theme.fg('accent', args.target),
        0, 0,
      );
    },
    renderResult(result, _opts, theme) {
      const msg = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(theme.fg('success', '⏪ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Command: /context ──────────────────────────────────────

  pi.registerCommand('context', {
    description: 'Refresh the context graph snapshot (updates the Context app)',
    handler: async (_args, ctx) => {
      pi.sendUserMessage(
        'Use the context_log tool to show the current context state.',
      );
    },
  });
}

// ── Log text builder (replicates pi-context output format) ────

async function buildLogText(
  sm: SessionManager,
  ctx: ExtensionContext,
  verbose: boolean,
  limit: number,
): Promise<string> {
  const branch = sm.getBranch();
  const leafId = sm.getLeafId();
  const backboneIds = new Set(branch.map((e) => e.id));
  const sequence: SessionEntry[] = [];

  for (const entry of branch) {
    sequence.push(entry);
    for (const child of sm.getChildren(entry.id)) {
      if (
        (child.type === 'branch_summary' || child.type === 'compaction') &&
        !backboneIds.has(child.id)
      ) {
        sequence.push(child);
      }
    }
  }

  const getContent = (entry: SessionEntry): string => {
    if (entry.type === 'branch_summary' || entry.type === 'compaction')
      return entry.summary || '[No summary]';
    if (entry.type === 'label') return `tag: ${entry.label}`;
    if (entry.type !== 'message') return '';

    const m = entry.message;
    if (m.role === 'toolResult') {
      if (!verbose && isInternal(m.toolName)) return '';
      const text = m.content.map((p) => (p.type === 'text' ? p.text : '')).join(' ').trim();
      return `(${m.toolName}) ${text}`;
    }
    if (m.role === 'bashExecution') return `[Bash] ${m.command}`;
    if (m.role === 'user' || m.role === 'assistant') {
      let text = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p: any) => p?.text || '').join(' ').trim()
          : '';
      if (m.role === 'assistant') {
        const calls = (m.content as any[])
          .filter((c): c is ToolCall => c.type === 'toolCall')
          .filter((tc) => verbose || !isInternal(tc.name))
          .map((tc) => `call: ${tc.name}(${JSON.stringify(tc.arguments)})`)
          .join('; ');
        text = [text, calls].filter(Boolean).join(' ');
      }
      return text;
    }
    return '';
  };

  const isInteresting = (entry: SessionEntry): boolean => {
    if (entry.id === leafId || (branch.length > 0 && entry.id === branch[0].id)) return true;
    if (sm.getLabel(entry.id)) return true;
    if (entry.type === 'label') return false;
    if (entry.type === 'branch_summary' || entry.type === 'compaction') return true;
    if (sm.getChildren(entry.id).length > 1) return true;
    if (entry.type === 'message' && entry.message.role === 'user') return true;
    return false;
  };

  let visible = sequence.filter((e) => verbose || isInteresting(e));
  if (visible.length > limit) visible = visible.slice(-limit);
  const visibleIds = new Set(visible.map((e) => e.id));

  const lines: string[] = [];
  let hidden = 0;

  for (const entry of sequence) {
    if (!visibleIds.has(entry.id)) { hidden++; continue; }
    if (hidden > 0) { lines.push(`  :  ... (${hidden} hidden messages) ...`); hidden = 0; }

    const isHead = entry.id === leafId;
    const label = sm.getLabel(entry.id);
    const body = getContent(entry).replace(/\s+/g, ' ');
    const role = entry.type !== 'message'
      ? (entry.type === 'branch_summary' || entry.type === 'compaction' ? 'SUMMARY' : entry.type.toUpperCase())
      : entry.message.role === 'assistant' ? 'AI'
      : entry.message.role === 'user' ? 'USER'
      : entry.message.role === 'bashExecution' ? 'BASH' : 'TOOL';
    const isRoot = branch.length > 0 && entry.id === branch[0].id;
    const meta = [isRoot ? 'ROOT' : null, isHead ? 'HEAD' : null, label ? `tag: ${label}` : null]
      .filter(Boolean).join(', ');
    const marker = isHead ? '*' : role === 'USER' ? '•' : '|';
    const trimmed = body.length > 100 ? body.slice(0, 100) + '...' : body;
    lines.push(`${marker} ${entry.id}${meta ? ` (${meta})` : ''} [${role}] ${trimmed}`);
  }
  if (hidden > 0) lines.push(`  :  ... (${hidden} hidden messages) ...`);

  // HUD
  const usage = await ctx.getContextUsage();
  const usageStr = usage
    ? `${usage.percent.toFixed(1)}% (${formatTokens(usage.tokens)}/${formatTokens(usage.contextWindow)})`
    : 'Unknown';

  let stepsSinceTag = 0;
  let nearestTagName = 'None';
  for (let i = branch.length - 1; i >= 0; i--) {
    const l = sm.getLabel(branch[i].id);
    if (l) { nearestTagName = l; break; }
    stepsSinceTag++;
  }

  return [
    `[Context Dashboard]`,
    `• Context Usage:    ${usageStr}`,
    `• Segment Size:     ${stepsSinceTag} steps since last tag '${nearestTagName}'`,
    `---------------------------------------------------`,
    lines.join('\n') || '(Root Path Only)',
  ].join('\n');
}
