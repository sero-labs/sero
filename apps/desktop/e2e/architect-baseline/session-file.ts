/**
 * What a Pi session file says about one session's own model calls.
 *
 * Both strategies are read through this one parser, so a number that comes from
 * it means the same thing in both records. It only covers the session it is
 * given: an Architect owner's session does not include the work it delegated.
 * Anything the file does not state is reported as unknown, not as zero.
 */

import fs from 'node:fs';

export interface SessionObservation {
  /** One assistant message is one model request. */
  requests: number;
  toolCalls: number;
  compactions: number;
  /** Total tokens of each assistant turn, in order. Empty when none were reported. */
  tokensPerTurn: number[];
  /** Summed cost of the turns that reported a price. */
  costUsd: number;
  /** True when any request has no reported price or token count. */
  incomplete: boolean;
}

interface Usage {
  totalTokens?: unknown;
  cost?: { total?: unknown };
}

export function observeSession(file: string | null | undefined): SessionObservation | null {
  if (!file || !fs.existsSync(file)) return null;
  const seen: SessionObservation = { requests: 0, toolCalls: 0, compactions: 0, tokensPerTurn: [], costUsd: 0, incomplete: false };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry: { type?: string; message?: { role?: string; content?: unknown; usage?: Usage } };
    try {
      entry = JSON.parse(line) as typeof entry;
    } catch {
      // A line cut short by a killed process. The request it described is unknown.
      seen.incomplete = true;
      continue;
    }
    if (entry.type === 'compaction') seen.compactions += 1;
    if (entry.type !== 'message' || entry.message?.role !== 'assistant') continue;
    seen.requests += 1;
    if (Array.isArray(entry.message.content)) {
      seen.toolCalls += entry.message.content.filter((block: { type?: string }) => block?.type === 'toolCall').length;
    }
    const usage = entry.message.usage;
    const tokens = usage?.totalTokens;
    const cost = usage?.cost?.total;
    if (typeof tokens === 'number') seen.tokensPerTurn.push(tokens);
    if (typeof cost === 'number') seen.costUsd += cost;
    // A call with tokens but no price ran at an unknown cost. A free local model reports 0 and is complete.
    if (typeof tokens !== 'number' || typeof cost !== 'number') seen.incomplete = true;
  }
  return seen;
}
