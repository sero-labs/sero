/**
 * Read the typed complete-output capture record out of a tool result's details.
 *
 * The model-visible report uses runtime-valid paths. The desktop UI runs on the
 * host, so it opens the `hostPath` from the same typed record. Neither consumer
 * parses a human-readable notice.
 */

export type ToolCaptureStreamKind = 'combined' | 'stdout' | 'stderr';

export interface ToolCaptureStreamDetails {
  stream: ToolCaptureStreamKind;
  runtimePath: string;
  hostPath: string;
  bytes: number;
}

export interface ToolCaptureDetails {
  captureId: string;
  complete: boolean;
  combined?: ToolCaptureStreamDetails;
  stdout?: ToolCaptureStreamDetails;
  stderr?: ToolCaptureStreamDetails;
  unavailableReason?: string;
}

export interface ToolCaptureFile {
  kind: ToolCaptureStreamKind;
  label: string;
  hostPath: string;
  bytes: number;
}

export interface ToolCaptureView {
  capture: ToolCaptureDetails;
  /** True when the model received a bounded preview rather than all of the output. */
  preview: boolean;
  /** Complete files the user can open. Empty when the capture is incomplete. */
  files: ToolCaptureFile[];
}

const STREAM_LABELS: Record<ToolCaptureStreamKind, string> = {
  combined: 'Combined output',
  stdout: 'stdout',
  stderr: 'stderr',
};

export function describeToolCapture(
  details: Record<string, unknown> | null | undefined,
): ToolCaptureView | null {
  const capture = parseToolCaptureDetails(details);
  if (!capture) return null;

  const files: ToolCaptureFile[] = [];
  for (const stream of [capture.combined, capture.stdout, capture.stderr]) {
    if (!stream) continue;
    files.push({
      kind: stream.stream,
      label: STREAM_LABELS[stream.stream],
      hostPath: stream.hostPath,
      bytes: stream.bytes,
    });
  }

  return {
    capture,
    preview: isTruncated(details),
    files: capture.complete ? files : [],
  };
}

export function parseToolCaptureDetails(
  details: Record<string, unknown> | null | undefined,
): ToolCaptureDetails | null {
  const value = details?.capture;
  if (!isRecord(value)) return null;
  if (typeof value.captureId !== 'string' || value.captureId.length === 0) return null;
  return {
    captureId: value.captureId,
    complete: value.complete === true,
    combined: parseStream(value.combined),
    stdout: parseStream(value.stdout),
    stderr: parseStream(value.stderr),
    unavailableReason: typeof value.unavailableReason === 'string' ? value.unavailableReason : undefined,
  };
}

function parseStream(value: unknown): ToolCaptureStreamDetails | undefined {
  if (!isRecord(value)) return undefined;
  const stream = value.stream;
  if (stream !== 'combined' && stream !== 'stdout' && stream !== 'stderr') return undefined;
  if (typeof value.hostPath !== 'string' || value.hostPath.length === 0) return undefined;
  return {
    stream,
    hostPath: value.hostPath,
    runtimePath: typeof value.runtimePath === 'string' ? value.runtimePath : value.hostPath,
    bytes: typeof value.bytes === 'number' && Number.isFinite(value.bytes) ? value.bytes : 0,
  };
}

/** The tool result carries `truncation` only when the payload was truncated. */
function isTruncated(details: Record<string, unknown> | null | undefined): boolean {
  return isRecord(details?.truncation);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '0B';
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
