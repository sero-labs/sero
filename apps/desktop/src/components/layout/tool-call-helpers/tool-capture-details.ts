/**
 * Read the typed complete-output capture record out of a tool result's details.
 *
 * The desktop UI runs on the host, so it opens a capture through the `hostPath`
 * in the typed record. Nothing here parses a human-readable notice.
 */

/** One complete capture file the UI can open. */
export interface ToolCaptureFile {
  hostPath: string;
  bytes: number;
}

export interface ToolCaptureView {
  /**
   * The complete output the viewer opens.
   *
   * It is the combined file, which holds every captured byte, so a result offers
   * one control rather than one per stream.
   */
  file?: ToolCaptureFile;
  /** Why no file can be opened. Set only when `file` is absent. */
  unavailableReason?: string;
  /**
   * The command that ran, when it differs from the requested one.
   *
   * This is UI metadata. The model is told what it asked for and nothing more,
   * because the wrapper repeats on every rewritten command.
   */
  rewrite?: { requested: string; executed: string };
}

export function describeToolCapture(
  details: Record<string, unknown> | null | undefined,
): ToolCaptureView | null {
  const capture = parseToolCaptureDetails(details);
  if (!capture) return null;

  return {
    file: capture.complete ? capture.combined : undefined,
    unavailableReason: capture.complete ? undefined : capture.unavailableReason,
    rewrite: parseRewrite(details),
  };
}

export function parseToolCaptureDetails(
  details: Record<string, unknown> | null | undefined,
): {
  captureId: string;
  complete: boolean;
  combined?: ToolCaptureFile;
  unavailableReason?: string;
} | null {
  const value = details?.capture;
  if (!isRecord(value)) return null;
  if (typeof value.captureId !== 'string' || value.captureId.length === 0) return null;
  return {
    captureId: value.captureId,
    complete: value.complete === true,
    combined: parseFile(value.combined),
    unavailableReason: typeof value.unavailableReason === 'string' ? value.unavailableReason : undefined,
  };
}

function parseFile(value: unknown): ToolCaptureFile | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.hostPath !== 'string' || value.hostPath.length === 0) return undefined;
  return {
    hostPath: value.hostPath,
    bytes: typeof value.bytes === 'number' && Number.isFinite(value.bytes) ? value.bytes : 0,
  };
}

/** The requested and executed commands a rewritten result recorded. */
function parseRewrite(
  details: Record<string, unknown> | null | undefined,
): ToolCaptureView['rewrite'] {
  const value = details?.rewrite;
  if (!isRecord(value)) return undefined;
  const { requested, executed } = value;
  if (typeof requested !== 'string' || !requested) return undefined;
  if (typeof executed !== 'string' || !executed) return undefined;
  return { requested, executed };
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
