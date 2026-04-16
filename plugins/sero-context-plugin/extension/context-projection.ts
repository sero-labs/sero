import type { SessionEntry, SessionManager } from '@mariozechner/pi-coding-agent';

import { isInternal } from './helpers';

export interface ContextBranchMeta {
  leafId: string | undefined;
  rootId: string | undefined;
}

interface TextPart {
  type: 'text';
  text: string;
}

interface ToolCallPart {
  type: 'toolCall';
  name: string;
  arguments?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextPart(value: unknown): value is TextPart {
  return isRecord(value)
    && value.type === 'text'
    && typeof value.text === 'string';
}

function isToolCallPart(value: unknown): value is ToolCallPart {
  return isRecord(value)
    && value.type === 'toolCall'
    && typeof value.name === 'string';
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isTextPart)
    .map((part) => part.text)
    .join(' ')
    .trim();
}

function extractAssistantToolCalls(
  content: unknown,
  includeInternal: boolean,
): ToolCallPart[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter(isToolCallPart)
    .filter((toolCall) => includeInternal || !isInternal(toolCall.name));
}

export function buildContextSequence(sm: SessionManager): SessionEntry[] {
  const branch = sm.getBranch();
  const backboneIds = new Set(branch.map((entry) => entry.id));
  const sequence: SessionEntry[] = [];

  for (const entry of branch) {
    sequence.push(entry);
    for (const child of sm.getChildren(entry.id)) {
      if (
        (child.type === 'branch_summary' || child.type === 'compaction')
        && !backboneIds.has(child.id)
      ) {
        sequence.push(child);
      }
    }
  }

  return sequence;
}

export function getContextBranchMeta(sm: SessionManager): ContextBranchMeta {
  const branch = sm.getBranch();
  return {
    leafId: sm.getLeafId() ?? undefined,
    rootId: branch.length > 0 ? branch[0]?.id : undefined,
  };
}

export function getNearestTagInfo(
  branch: SessionEntry[],
  sm: SessionManager,
): { nearestTag: string; stepsSinceTag: number } {
  let stepsSinceTag = 0;
  let nearestTag = 'None';

  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const label = sm.getLabel(branch[index]?.id ?? '');
    if (label) {
      nearestTag = label;
      break;
    }
    stepsSinceTag += 1;
  }

  return { nearestTag, stepsSinceTag };
}

export function isInterestingContextEntry(
  entry: SessionEntry,
  sm: SessionManager,
  meta: ContextBranchMeta,
): boolean {
  if (entry.id === meta.leafId || entry.id === meta.rootId) return true;
  if (sm.getLabel(entry.id)) return true;
  if (entry.type === 'label') return false;
  if (entry.type === 'branch_summary' || entry.type === 'compaction') return true;
  if (sm.getChildren(entry.id).length > 1) return true;
  if (entry.type === 'message' && entry.message.role === 'user') return true;
  return false;
}

export function getContextEntryContent(
  entry: SessionEntry,
  options: { verbose: boolean; includeInternalToolResults?: boolean },
): string {
  if (entry.type === 'branch_summary' || entry.type === 'compaction') {
    return entry.summary || '[No summary]';
  }
  if (entry.type !== 'message') return '';

  const message = entry.message;
  if (message.role === 'bashExecution') {
    return options.verbose ? `[Bash] ${message.command}` : `$ ${message.command || ''}`;
  }

  if (message.role === 'toolResult') {
    if (!options.verbose && isInternal(message.toolName)) return '';
    const resultText = extractTextFromContent(message.content);
    return options.verbose
      ? `(${message.toolName}) ${resultText}`
      : `(${message.toolName}) ${resultText}`;
  }

  if (message.role === 'user' || message.role === 'assistant') {
    const text = extractTextFromContent(message.content);
    if (message.role !== 'assistant') return text;

    const toolCalls = extractAssistantToolCalls(
      message.content,
      options.includeInternalToolResults ?? false,
    );
    if (options.verbose) {
      const calls = toolCalls
        .map((toolCall) => `call: ${toolCall.name}(${JSON.stringify(toolCall.arguments ?? {})})`)
        .join('; ');
      return [text, calls].filter(Boolean).join(' ');
    }

    const callText = toolCalls
      .map((toolCall) => `→ ${toolCall.name}`)
      .join(', ');
    return [text, callText].filter(Boolean).join(' ');
  }

  return '';
}
