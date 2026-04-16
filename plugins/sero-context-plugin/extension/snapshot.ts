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
import type { ContextNode, ContextState, ContextUsage, NodeRole } from '../shared/types';
import { estimateTokens } from './helpers';
import {
  buildContextSequence,
  getContextBranchMeta,
  getContextEntryContent,
  getNearestTagInfo,
  isInterestingContextEntry,
} from './context-projection';

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
  return getContextEntryContent(entry, {
    verbose: false,
    includeInternalToolResults: false,
  });
}

function truncate(s: string, max = 120): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

// ── Interesting-node filter (same logic as context_log) ───────


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
  if (usage.tokens === null || usage.contextWindow === null || usage.percent === null) {
    return null;
  }

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
  const meta = getContextBranchMeta(sm);
  const sequence = buildContextSequence(sm);

  // Filter to interesting nodes (non-verbose mode)
  const nodes: ContextNode[] = [];
  let hiddenCount = 0;

  for (const entry of sequence) {
    if (!isInterestingContextEntry(entry, sm, meta)) {
      hiddenCount++;
      continue;
    }

    nodes.push({
      id: entry.id,
      role: getEntryRole(entry),
      content: truncate(getEntryContent(entry)),
      label: sm.getLabel(entry.id) ?? undefined,
      isHead: entry.id === meta.leafId,
      isRoot: entry.id === meta.rootId,
      isBranchPoint: sm.getChildren(entry.id).length > 1,
      hiddenBefore: hiddenCount,
    });
    hiddenCount = 0;
  }

  // Steps since last tag
  const { nearestTag, stepsSinceTag } = getNearestTagInfo(branch, sm);

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
