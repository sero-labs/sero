/**
 * Artifact helpers (D-14). Large outputs, model responses, and agent responses
 * are stored as artifacts under the state dir and referenced by path. The state
 * file keeps bounded summaries and references only.
 *
 * The actual write goes through host.writeArtifact; these helpers decide paths,
 * inlining, and run retention.
 */

import type { LogPolicy, LoopRun } from '../shared/types';
import type { OrchestratorHost } from './host';

/** Per-loop artifact base — every artifact for a loop lives under its own folder. */
export function loopArtifactDir(loopId: string): string {
  return `loops/${loopId}/artifacts`;
}

/** Run-scoped step output path: loops/<loopId>/artifacts/runs/<runId>/<name>. */
export function artifactPath(loopId: string, runId: string, name: string): string {
  return `${loopArtifactDir(loopId)}/runs/${runId}/${name}`;
}

export interface StoredOutput {
  /** Truncated/summary text safe to keep inline in state. */
  inline: string;
  /** Artifact reference when the full content was written, else undefined. */
  artifactRef?: string;
}

/**
 * Stores output, writing an artifact when it exceeds the inline byte budget.
 * Always returns a bounded `inline` summary plus an optional artifact ref.
 */
export async function storeOutput(
  host: OrchestratorHost,
  policy: LogPolicy,
  relativePath: string,
  content: string,
): Promise<StoredOutput> {
  const overBudget = byteLength(content) > policy.maxInlineOutputBytes;
  if (!overBudget) return { inline: content };

  const artifactRef = policy.retainArtifacts
    ? await host.writeArtifact(relativePath, content)
    : undefined;
  return { inline: truncate(content, policy.maxInlineOutputBytes), artifactRef };
}

/** Keeps only the most recent `retainRuns` runs. */
export function pruneRuns(runs: LoopRun[], retainRuns: number): LoopRun[] {
  if (retainRuns <= 0 || runs.length <= retainRuns) return runs;
  return runs.slice(runs.length - retainRuns);
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function truncate(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  // Reserve room for the marker; slice generously then trim to byte budget.
  const marker = '\n…[truncated — full output in artifact]';
  let slice = text.slice(0, maxBytes);
  while (byteLength(slice) + byteLength(marker) > maxBytes && slice.length > 0) {
    slice = slice.slice(0, -64);
  }
  return slice + marker;
}
