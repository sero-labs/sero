/**
 * On-match recall (design D6).
 *
 * Before each user message that starts a new run, the prompt is searched over
 * the on-match entries of the global scope and the current workspace. Matches
 * above the threshold that were not added earlier in the session go into one
 * persistent `memory-recall` message, which Pi appends after the user's
 * message. Earlier recall messages are never removed, which keeps the prompt
 * cache valid. Compaction clears the "already added" set, because it can
 * summarise earlier recall messages away.
 *
 * A message sent while the agent runs goes through `steer()`, which does not
 * emit `before_agent_start`, so it gets no recall (accepted limit).
 */

import type { BeforeAgentStartEventResult, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { splitBody } from './entry-format';
import { globalLocation, workspaceLocation, type StoredEntry } from './entry-store';
import { recallThresholdFor } from './memory-settings';
import { recordMetric } from './metrics';
import { searchEntries } from './memory-search';
import { formatEntryLine } from './snapshot';

export const RECALL_MESSAGE_TYPE = 'memory-recall';

/** One recalled memory, as the chat lists it under "Recalled N memories". */
export interface RecalledMemory {
  id: string;
  type: string;
  fact: string;
  behaviour?: string;
}

export interface RecallDetails {
  ids: string[];
  scores: number[];
  memories: RecalledMemory[];
}

type SessionBranch = ReturnType<ExtensionContext['sessionManager']['getBranch']>;

/**
 * The ids already recalled in the session since its latest compaction, read
 * from the recall messages saved in the session. A resumed session therefore
 * does not add a memory twice.
 */
export function recalledSinceCompaction(branch: SessionBranch): Set<string> {
  const recalled = new Set<string>();
  let lastCompaction = -1;
  branch.forEach((entry, index) => {
    if (entry.type === 'compaction') lastCompaction = index;
  });
  for (const entry of branch.slice(lastCompaction + 1)) {
    if (entry.type !== 'custom_message' || entry.customType !== RECALL_MESSAGE_TYPE) continue;
    const details = entry.details as Partial<RecallDetails> | undefined;
    for (const id of details?.ids ?? []) recalled.add(id);
  }
  return recalled;
}

export function formatRecallMessage(entries: StoredEntry[]): string {
  return [
    `Memories that may apply to this message (${entries.length}):`,
    ...entries.map(formatEntryLine),
  ].join('\n');
}

export interface RecallInput {
  sessionId: string;
  prompt: string;
  workspaceRoot: string;
  /** Mutated: ids added by this call are recorded here. */
  recalled: Set<string>;
}

/** Returns the recall message for this turn, or undefined when nothing new matches. */
export async function recallForTurn(input: RecallInput): Promise<BeforeAgentStartEventResult['message'] | undefined> {
  if (!input.prompt.trim()) return undefined;
  const started = Date.now();
  const locations = [globalLocation(), workspaceLocation(input.workspaceRoot)];
  const { results, mode } = await searchEntries(input.prompt, locations, 'recall');

  const threshold = recallThresholdFor(mode);
  const entries: StoredEntry[] = [];
  const scores: number[] = [];
  for (const { entry, score } of results) {
    if (score < threshold) break;
    if (input.recalled.has(entry.id)) continue;
    entries.push(entry);
    scores.push(Number(score.toFixed(4)));
  }

  const latencyMs = Date.now() - started;
  if (entries.length === 0) {
    await recordMetric('recall-empty', { session: input.sessionId, latencyMs, mode });
    return undefined;
  }
  for (const entry of entries) input.recalled.add(entry.id);
  const ids = entries.map((entry) => entry.id);
  await recordMetric('recall', { session: input.sessionId, ids, scores, latencyMs, mode });
  const details: RecallDetails = {
    ids,
    scores,
    memories: entries.map((entry) => ({ id: entry.id, type: entry.type, ...splitBody(entry.body) })),
  };
  return {
    customType: RECALL_MESSAGE_TYPE,
    content: formatRecallMessage(entries),
    display: true,
    details,
  };
}
