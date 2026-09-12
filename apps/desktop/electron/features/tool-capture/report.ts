import { formatSize } from '@electron/features/container/filesystem/truncate';
import type { ToolCaptureRecord, ToolCaptureStream } from './types';

function streamLine(label: string, stream: ToolCaptureStream): string {
  return `- ${label}: ${runtimePath(stream)} (${formatSize(stream.bytes)})`;
}

/**
 * The path valid where the command ran.
 *
 * The host omits `runtimePath` when it equals `hostPath`, so the fallback never
 * leaks a host path into model text: the two only differ when both are stored.
 */
function runtimePath(stream: ToolCaptureStream): string {
  return stream.runtimePath ?? stream.hostPath;
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

  const combinedBytes = record.combined.bytes;
  const lines = [
    `Complete output: ${runtimePath(record.combined)} (${formatSize(combinedBytes)})`,
  ];
  const candidates = [
    record.stdout ? { label: 'stdout', stream: record.stdout } : undefined,
    record.stderr ? { label: 'stderr', stream: record.stderr } : undefined,
  ].filter((entry): entry is { label: string; stream: ToolCaptureStream } => entry !== undefined);

  // A stream that holds every captured byte is `combined` all over again, so
  // listing it duplicates the file in the report and in the viewer's buttons.
  const streams: string[] = [];
  for (const entry of candidates) {
    if (entry.stream.bytes !== combinedBytes) streams.push(streamLine(entry.label, entry.stream));
  }

  if (streams.length > 0) {
    lines.push('Streams:', ...streams);
  } else if (candidates.length === 0) {
    lines.push('The command wrote no separate stream output.');
  }
  return lines.join('\n');
}
