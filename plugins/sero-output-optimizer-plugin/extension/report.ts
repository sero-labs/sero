import { formatBytes } from './format';
import type { OutputCategory } from './compaction/category';
import type { PreviewResult } from './preview';

/** Model-visible notices. Each is a separate content block, never payload data. */

export function renderRewriteNotice(requested: string, executed: string): string {
  return [
    'Command executed differently:',
    `- requested: ${requested}`,
    `- executed:  ${executed}`,
  ].join('\n');
}

export function renderOptimizationNotice(input: {
  category: OutputCategory;
  rule: OutputCategory | null;
  inputBytes: number;
  compactedBytes: number;
  changed: boolean;
}): string {
  if (!input.changed) {
    return `Output optimizer: ${input.category} output is already compact (${formatBytes(input.inputBytes)}).`;
  }
  const saved = Math.max(0, input.inputBytes - input.compactedBytes);
  return `Output optimizer: ${input.rule ?? input.category} compaction kept diagnostics; ${formatBytes(saved)} of ${formatBytes(input.inputBytes)} omitted from this preview.`;
}

export function renderOmissionNotice(preview: PreviewResult): string {
  return `Preview truncated: showing ${preview.shownLines} of ${preview.totalLines} lines (${preview.omittedLines} omitted). The complete output is in the capture files reported above.`;
}
