import { formatBytes } from './format';
import type { OutputCategory } from './compaction/category';
import type { PreviewResult } from './preview';

/** Model-visible notices. Each is a separate content block, never payload data. */

export function renderOptimizationNotice(input: {
  category: OutputCategory;
  rule: OutputCategory | null;
  inputBytes: number;
  compactedBytes: number;
}): string {
  const saved = Math.max(0, input.inputBytes - input.compactedBytes);
  return `Output optimizer: ${input.rule ?? input.category} compaction kept diagnostics; ${formatBytes(saved)} of ${formatBytes(input.inputBytes)} omitted from this preview.`;
}

export function renderOmissionNotice(preview: PreviewResult): string {
  return `Preview truncated: showing ${preview.shownLines} of ${preview.totalLines} lines (${preview.omittedLines} omitted). The complete output is in the capture files reported above.`;
}

/** Explicit identification for a structured preview that does not parse. */
export function renderIncompleteStructuredNotice(totalBytes: number): string {
  return `Incomplete preview: the stdout document is ${formatBytes(totalBytes)} and does not fit the model preview. The complete document is the stdout capture file.`;
}

const TIMEOUT_NOTICE = /Command timed out after \d+s\./;
const EXIT_NOTICE = /Command exited with code -?\d+/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Keep the bash tool's status text when its payload is replaced.
 *
 * The exit code and a timeout notice live in the received payload, which
 * compaction replaces. The result must keep them visible.
 */
export function statusNotice(details: unknown, receivedPayload: string): string | undefined {
  const parts: string[] = [];
  const timeout = receivedPayload.match(TIMEOUT_NOTICE)?.[0];
  if (timeout) parts.push(timeout);

  const exitCode = isRecord(details) ? details.exitCode : undefined;
  if (typeof exitCode === 'number' && exitCode !== 0) {
    parts.push(EXIT_NOTICE.test(receivedPayload) ? (receivedPayload.match(EXIT_NOTICE)?.[0] as string) : `Command exited with code ${exitCode}`);
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}
