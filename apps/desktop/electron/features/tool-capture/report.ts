import { formatSize } from '@electron/features/container/filesystem/truncate';
import type { ToolCaptureRecord, ToolCaptureStream } from './types';

function streamLine(label: string, stream: ToolCaptureStream): string {
  return `- ${label}: ${stream.runtimePath} (${formatSize(stream.bytes)})`;
}

/**
 * Render the human-readable capture report.
 *
 * It is a separate content block from the output payload and is outside the
 * payload byte/line budget, like the existing truncation and exit notices. It
 * reports runtime-valid paths only; host paths stay in typed details.
 */
export function renderCaptureReport(record: ToolCaptureRecord | undefined): string | undefined {
  if (!record) return undefined;
  if (!record.complete || !record.combined) {
    return `Complete output unavailable: ${record.unavailableReason ?? 'capture failed.'}`;
  }

  const lines = [
    `Complete output: ${record.combined.runtimePath} (${formatSize(record.combined.bytes)})`,
  ];
  const streams = [
    record.stdout ? streamLine('stdout', record.stdout) : undefined,
    record.stderr ? streamLine('stderr', record.stderr) : undefined,
  ].filter((line): line is string => line !== undefined);
  if (streams.length > 0) {
    lines.push('Streams:', ...streams);
  } else {
    lines.push('The command wrote no separate stream output.');
  }
  return lines.join('\n');
}
