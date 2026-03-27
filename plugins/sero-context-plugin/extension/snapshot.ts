/**
 * Builds a structured snapshot of the context graph and writes it to
 * the state file for the Sero UI to render.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  SessionManager,
  SessionEntry,
  ExtensionContext,
} from '@mariozechner/pi-coding-agent';
import type { TextContent, ImageContent, ToolCall } from '@mariozechner/pi-ai';
import type { ContextNode, ContextState, ContextUsage, NodeRole } from '../shared/types';
import { isInternal, estimateTokens } from './helpers';

// ── Entry content extraction ──────────────────────────────────

function getEntryRole(entry: SessionEntry): NodeRole {
  if (entry.type === 'branch_summary' || entry.type === 'compaction') return 'summary';
  if (entry.type !== 'message') return 'summary';

  const m = entry.message;
  if (m.role === 'assistant') return 'ai';
  if (m.role === 'user') return 'user';
  if (m.role === 'bashExecution') return 'bash';
  return 'tool'; // toolResult
}

function getEntryContent(entry: SessionEntry): string {
  if (entry.type === 'branch_summary' || entry.type === 'compaction') {
    return entry.summary || '[No summary]';
  }
  if (entry.type !== 'message') return '';

  const m = entry.message;
  if (m.role === 'bashExecution') return `$ ${m.command || ''}`;

  if (m.role === 'toolResult') {
    const extractText = (content: (TextContent | ImageContent)[]): string =>
      content.map((p) => (p.type === 'text' ? p.text : '')).join(' ').trim();
    const resText = extractText(m.content);
    return `(${m.toolName}) ${resText}`;
  }

  if (m.role === 'user' || m.role === 'assistant') {
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      text = m.content
        .map((p: any) => (p?.type === 'text' ? (p as TextContent).text : ''))
        .join(' ')
        .trim();
    }

    if (m.role === 'assistant') {
      const toolCalls = (m.content as any[]).filter(
        (c): c is ToolCall => c.type === 'toolCall',
      );
      const callText = toolCalls
        .filter((tc) => !isInternal(tc.name))
        .map((tc) => `→ ${tc.name}`)
        .join(', ');
      if (callText) text = [text, callText].filter(Boolean).join(' ');
    }
    return text;
  }
  return '';
}

function truncate(s: string, max = 120): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

// ── Interesting-node filter (same logic as context_log) ───────

function isInteresting(
  entry: SessionEntry,
  sm: SessionManager,
  currentLeafId: string | undefined,
  rootId: string | undefined,
): boolean {
  if (entry.id === currentLeafId || entry.id === rootId) return true;
  if (sm.getLabel(entry.id)) return true;
  if (entry.type === 'label') return false;
  if (entry.type === 'branch_summary' || entry.type === 'compaction') return true;
  if (sm.getChildren(entry.id).length > 1) return true;
  if (entry.type === 'message' && entry.message.role === 'user') return true;
  return false;
}

// ── Usage breakdown ───────────────────────────────────────────

async function buildUsage(
  ctx: ExtensionContext,
  branch: SessionEntry[],
  systemPrompt: string,
  toolDefs: any[],
): Promise<ContextUsage | null> {
  const usage = await ctx.getContextUsage();
  if (!usage) return null;

  let msgRaw = 0, toolUseRaw = 0, toolResultRaw = 0;
  for (const entry of branch) {
    if (entry.type !== 'message') {
      if (entry.type === 'branch_summary' || entry.type === 'compaction') {
        msgRaw += estimateTokens(entry.summary || '');
      }
      continue;
    }
    const m = entry.message;
    if (m.role === 'user') {
      if (typeof m.content === 'string') msgRaw += estimateTokens(m.content);
      else if (Array.isArray(m.content))
        for (const p of m.content) if (p.type === 'text') msgRaw += estimateTokens(p.text);
    } else if (m.role === 'assistant') {
      if (typeof m.content === 'string') msgRaw += estimateTokens(m.content);
      else if (Array.isArray(m.content))
        for (const p of m.content) {
          if (p.type === 'text') msgRaw += estimateTokens(p.text);
          if (p.type === 'toolCall') toolUseRaw += estimateTokens(JSON.stringify(p));
        }
    } else if (m.role === 'toolResult') {
      if (Array.isArray(m.content))
        for (const p of m.content) if (p.type === 'text') toolResultRaw += estimateTokens(p.text);
    } else if (m.role === 'bashExecution') {
      toolUseRaw += estimateTokens(m.command || '');
    }
  }

  const systemRaw = estimateTokens(systemPrompt);
  const toolDefRaw = estimateTokens(JSON.stringify(toolDefs));
  const totalRaw = systemRaw + toolDefRaw + msgRaw + toolUseRaw + toolResultRaw;
  const ratio = totalRaw > 0 ? usage.tokens / totalRaw : 1;

  return {
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    percent: usage.percent,
    breakdown: {
      system: Math.round(systemRaw * ratio),
      toolDefs: Math.round(toolDefRaw * ratio),
      messages: Math.round(msgRaw * ratio),
      toolCalls: Math.round(toolUseRaw * ratio),
      toolResults: Math.round(toolResultRaw * ratio),
      other: Math.max(
        0,
        usage.tokens -
          Math.round((systemRaw + toolDefRaw + msgRaw + toolUseRaw + toolResultRaw) * ratio),
      ),
    },
  };
}

// ── Main snapshot builder ─────────────────────────────────────

export async function buildSnapshot(
  sm: SessionManager,
  ctx: ExtensionContext,
  pi: { getActiveTools(): string[]; getAllTools(): any[] },
): Promise<ContextState> {
  const branch = sm.getBranch();
  const leafId = sm.getLeafId();
  const rootId = branch.length > 0 ? branch[0].id : undefined;

  // Build sequence (backbone + off-path summaries)
  const backboneIds = new Set(branch.map((e) => e.id));
  const sequence: SessionEntry[] = [];
  for (const entry of branch) {
    sequence.push(entry);
    for (const child of sm.getChildren(entry.id)) {
      if ((child.type === 'branch_summary' || child.type === 'compaction') && !backboneIds.has(child.id)) {
        sequence.push(child);
      }
    }
  }

  // Filter to interesting nodes (non-verbose mode)
  const nodes: ContextNode[] = [];
  let hiddenCount = 0;

  for (const entry of sequence) {
    if (!isInteresting(entry, sm, leafId, rootId)) {
      hiddenCount++;
      continue;
    }

    nodes.push({
      id: entry.id,
      role: getEntryRole(entry),
      content: truncate(getEntryContent(entry)),
      label: sm.getLabel(entry.id) || undefined,
      isHead: entry.id === leafId,
      isRoot: entry.id === rootId,
      isBranchPoint: sm.getChildren(entry.id).length > 1,
      hiddenBefore: hiddenCount,
    });
    hiddenCount = 0;
  }

  // Steps since last tag
  let stepsSinceTag = 0;
  let nearestTag = 'None';
  for (let i = branch.length - 1; i >= 0; i--) {
    const label = sm.getLabel(branch[i].id);
    if (label) { nearestTag = label; break; }
    stepsSinceTag++;
  }

  // Usage breakdown
  const activeNames = pi.getActiveTools();
  const allTools = pi.getAllTools();
  const activeDefs = allTools.filter((t: any) => activeNames.includes(t.name));
  const usageData = await buildUsage(ctx, branch, ctx.getSystemPrompt(), activeDefs);

  return {
    nodes,
    usage: usageData,
    stepsSinceTag,
    nearestTag,
    totalEntries: branch.length,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Write state to disk ───────────────────────────────────────

export async function writeSnapshot(
  filePath: string,
  state: ContextState,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
