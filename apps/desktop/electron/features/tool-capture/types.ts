/**
 * Complete tool-output capture records.
 *
 * A capture is the session-keyed set of files that holds everything a command
 * wrote, before the model-facing content is truncated. Every file in a capture
 * shares one lifecycle; only a finalized capture is advertised.
 */

export const TOOL_CAPTURE_RECORD_VERSION = 1;

export type ToolCaptureStreamKind = 'combined' | 'stdout' | 'stderr';

export interface ToolCaptureStream {
  stream: ToolCaptureStreamKind;
  /**
   * Absolute path in the environment where the command ran.
   *
   * Absent when it is identical to `hostPath`, which is the case on a host
   * workspace. Read it as `runtimePath ?? hostPath`.
   */
  runtimePath?: string;
  /** Absolute host path. Host consumers use this; it never enters model text. */
  hostPath: string;
  bytes: number;
}

export interface ToolCaptureRecord {
  version: typeof TOOL_CAPTURE_RECORD_VERSION;
  captureId: string;
  /** The session that produced the capture, or an ancestor the session inherited it from. */
  producerSessionId: string;
  /** True only after every capture file was written and closed. */
  complete: boolean;
  /** Present only on a complete capture. */
  combined?: ToolCaptureStream;
  /** Present only when the stream produced output and the capture is complete. */
  stdout?: ToolCaptureStream;
  stderr?: ToolCaptureStream;
  /** Why the complete output is unavailable. Set only when `complete` is false. */
  unavailableReason?: string;
}

export interface RuntimeOutputStream {
  stream: 'stdout' | 'stderr';
  write(chunk: string): void;
  close(): void;
}
